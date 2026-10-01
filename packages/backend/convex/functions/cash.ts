import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { internal } from "../_generated/api"
import { audit, requirePermission } from "../lib/auth"
import { paymentMethod } from "../schema"
import { toServiceDate } from "../model/calendar"
import {
  attenduParMoyen,
  compteEnCaisse,
  ecartCaisse,
  totalBilletage,
  validerBilletage,
} from "../model/caisse"

/** Billetage saisi au guichet : une ligne par coupure. */
const billetage = v.array(
  v.object({ denomination: v.number(), count: v.number() })
)

/**
 * Sessions de caisse et journée comptable.
 *
 * Le CDC §7.7 exige de rapprocher ventes et règlements à la fin de chaque
 * journée comptable, caisse par caisse. Une session non clôturée ou un écart
 * non justifié bloque la clôture : c'est le garde-fou anti-fraude du
 * circuit de recettes.
 */

/** Journée comptable ouverte du jour, créée à la demande. */
export const openAccountingDay = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "journee_comptable", "consulter")
    const date = toServiceDate(Date.now())
    const existing = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique()
    if (existing) return existing._id

    const id = await ctx.db.insert("accountingDays", {
      date,
      status: "ouverte",
      openedAt: Date.now(),
      totalTtc: 0,
      totalReceived: 0,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "journee.ouvrir",
      entityTable: "accountingDays",
      entityId: id,
      after: { date },
    })
    return id
  },
})

/** Journées disponibles pour le rapprochement et l'export comptable. */
export const listAccountingDays = query({
  args: {
    status: v.optional(v.union(v.literal("ouverte"), v.literal("cloturee"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "journee_comptable", "consulter")
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 31), 1), 100)
    const days = args.status
      ? await ctx.db
          .query("accountingDays")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("accountingDays").collect()

    return days
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, limit)
  },
})

/**
 * Ouvre la session de caisse du vendeur courant.
 *
 * Le billetage du fonds, s'il est fourni, fait foi : son total doit égaler le
 * fonds déclaré. Le carnet de secours remis avec la caisse borne les souches
 * que l'on ressaisira si le réseau tombe.
 */
export const openSession = mutation({
  args: {
    openingFloatXaf: v.number(),
    openingBreakdown: v.optional(billetage),
    emergencyBooklet: v.optional(
      v.object({
        number: v.string(),
        firstNumber: v.string(),
        lastNumber: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "creer")
    if (!actor.pointOfSaleId) {
      throw new Error("Agent non rattaché à un point de vente")
    }
    if (!Number.isFinite(args.openingFloatXaf) || args.openingFloatXaf < 0) {
      throw new Error(`Fond de caisse invalide : ${args.openingFloatXaf}`)
    }
    if (args.openingBreakdown) {
      validerBilletage(args.openingBreakdown)
      const compte = totalBilletage(args.openingBreakdown)
      if (compte !== args.openingFloatXaf) {
        throw new Error(
          `Billetage de ${compte} XAF pour un fonds déclaré de ` +
            `${args.openingFloatXaf} XAF : recomptez le fonds`
        )
      }
    }
    const carnet = args.emergencyBooklet
      ? {
          number: args.emergencyBooklet.number.trim(),
          firstNumber: args.emergencyBooklet.firstNumber.trim(),
          lastNumber: args.emergencyBooklet.lastNumber.trim(),
        }
      : undefined
    if (carnet && (!carnet.number || !carnet.firstNumber || !carnet.lastNumber)) {
      throw new Error(
        "Carnet de secours incomplet : numéro, première et dernière souche"
      )
    }

    const ouverte = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .first()
    if (ouverte) {
      throw new Error("Une session de caisse est déjà ouverte")
    }

    const date = toServiceDate(Date.now())
    let day = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique()
    if (!day) {
      const id = await ctx.db.insert("accountingDays", {
        date,
        status: "ouverte",
        openedAt: Date.now(),
        totalTtc: 0,
        totalReceived: 0,
      })
      day = (await ctx.db.get(id))!
    }
    if (day.status === "cloturee") {
      throw new Error(`Journée comptable du ${date} clôturée`)
    }

    const id = await ctx.db.insert("cashSessions", {
      sellerId: actor._id,
      pointOfSaleId: actor.pointOfSaleId,
      accountingDayId: day._id,
      openedAt: Date.now(),
      openingFloatXaf: args.openingFloatXaf,
      openingBreakdown: args.openingBreakdown?.filter((l) => l.count > 0),
      emergencyBooklet: carnet,
      expectedByMethod: [],
      status: "ouverte",
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "caisse.ouvrir",
      entityTable: "cashSessions",
      entityId: id,
      after: {
        openingFloatXaf: args.openingFloatXaf,
        openingBreakdown: args.openingBreakdown,
        emergencyBooklet: carnet,
      },
    })
    return id
  },
})

/** Session de caisse ouverte du vendeur courant, avec ses totaux théoriques. */
export const mySession = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "caisse", "consulter")
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .first()
    if (!session) return null

    // Les places tenues pendant une saisie ou un paiement mobile portent la
    // session, mais n'ont rien encaissé : elles restent hors des totaux.
    const sales = (
      await ctx.db
        .query("sales")
        .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
        .collect()
    ).filter(compteEnCaisse)

    return {
      session,
      salesCount: sales.length,
      totalTtc: sales.reduce((sum, s) => sum + s.amounts.ttc, 0),
      totalReceived: sales.reduce((sum, s) => sum + s.amounts.received, 0),
      cancellations: sales.filter((s) => s.kind === "annulation").length,
      refunds: sales.filter((s) => s.kind === "remboursement").length,
      /** Attendu net par moyen, hors fonds de caisse. */
      expectedByMethod: attenduParMoyen(sales),
    }
  },
})

/**
 * Contexte complet de l'accueil vendeur.
 *
 * Une seule requête réactive alimente l'en-tête, l'état de caisse, les
 * compteurs et les dernières opérations. Cela évite d'ouvrir plusieurs
 * souscriptions qui pourraient brièvement afficher des états incompatibles
 * lors d'une vente ou de l'ouverture de caisse.
 */
export const sellerDashboard = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    if (!actor.pointOfSaleId) {
      throw new Error("Agent non rattaché à un point de vente")
    }

    const pointOfSale = await ctx.db.get(actor.pointOfSaleId)
    if (!pointOfSale) throw new Error("Point de vente introuvable")

    const station = pointOfSale.stationId
      ? await ctx.db.get(pointOfSale.stationId)
      : null
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .first()

    if (!session) {
      return {
        seller: {
          id: actor._id,
          firstName: actor.firstName,
          lastName: actor.lastName,
          matricule: actor.matricule,
          role: actor.role,
        },
        pointOfSale: {
          code: pointOfSale.code,
          name: pointOfSale.name,
          type: pointOfSale.type,
          stationName: station?.name,
        },
        session: null,
        metrics: {
          salesCount: 0,
          totalReceived: 0,
          cancellations: 0,
          refunded: 0,
        },
        lastOperations: [],
      }
    }

    const sales = (
      await ctx.db
        .query("sales")
        .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
        .collect()
    ).filter(compteEnCaisse)
    const ordered = [...sales].sort(
      (left, right) => right._creationTime - left._creationTime
    )

    return {
      seller: {
        id: actor._id,
        firstName: actor.firstName,
        lastName: actor.lastName,
        matricule: actor.matricule,
        role: actor.role,
      },
      pointOfSale: {
        code: pointOfSale.code,
        name: pointOfSale.name,
        type: pointOfSale.type,
        stationName: station?.name,
      },
      session: {
        id: session._id,
        openedAt: session.openedAt,
        openingFloatXaf: session.openingFloatXaf,
      },
      metrics: {
        salesCount: sales.filter((sale) => sale.kind === "vente").length,
        totalReceived: sales.reduce(
          (sum, sale) => sum + sale.amounts.received,
          0
        ),
        cancellations: sales.filter((sale) => sale.kind === "annulation")
          .length,
        refunded: Math.abs(
          sales
            .filter((sale) => sale.kind === "remboursement")
            .reduce((sum, sale) => sum + sale.amounts.received, 0)
        ),
      },
      lastOperations: ordered.slice(0, 10).map((sale) => ({
        id: sale._id,
        number: sale.number,
        product: sale.product,
        kind: sale.kind,
        status: sale.status,
        amountXaf: sale.amounts.ttc,
        createdAt: sale._creationTime,
      })),
    }
  },
})

/**
 * Clôture la session de caisse avec le comptage réel.
 *
 * Un écart non justifié bloque la clôture : le vendeur doit expliquer la
 * différence avant que la session ne remonte au contrôle des recettes.
 */
export const closeSession = mutation({
  args: {
    /**
     * Compté par moyen, hors fonds de caisse : les espèces valent le
     * billetage moins le fonds d'ouverture.
     */
    countedByMethod: v.array(
      v.object({ method: paymentMethod, amountXaf: v.number() })
    ),
    varianceReason: v.optional(v.string()),
    /** Billetage des espèces comptées, fonds compris. */
    closingBreakdown: v.optional(billetage),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "modifier")
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .first()
    if (!session) throw new Error("Aucune session de caisse ouverte")

    if (args.closingBreakdown) {
      validerBilletage(args.closingBreakdown)
      const especesComptees = args.countedByMethod
        .filter((c) => c.method === "especes")
        .reduce((sum, c) => sum + c.amountXaf, 0)
      const billete = totalBilletage(args.closingBreakdown)
      if (billete - session.openingFloatXaf !== especesComptees) {
        throw new Error(
          `Billetage de ${billete} XAF incohérent avec les espèces déclarées ` +
            `(${especesComptees} XAF hors fonds de ${session.openingFloatXaf} XAF)`
        )
      }
    }

    // Les places tenues sans règlement n'ont rien encaissé.
    const sales = (
      await ctx.db
        .query("sales")
        .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
        .collect()
    ).filter(compteEnCaisse)

    // Théorique : ce que le système a enregistré, moyen par moyen.
    const expectedByMethod = attenduParMoyen(sales)
    const expectedTotal = expectedByMethod.reduce(
      (sum, e) => sum + e.amountXaf,
      0
    )
    const countedTotal = args.countedByMethod.reduce(
      (sum, c) => sum + c.amountXaf,
      0
    )
    const varianceXaf = ecartCaisse(expectedByMethod, args.countedByMethod)

    if (varianceXaf !== 0 && !args.varianceReason?.trim()) {
      throw new Error(
        `Écart de caisse de ${varianceXaf} XAF : une justification est ` +
          `obligatoire pour clôturer`
      )
    }

    await ctx.db.patch(session._id, {
      closedAt: Date.now(),
      expectedByMethod:
        expectedByMethod.length > 0
          ? expectedByMethod.map(({ method, amountXaf }) => ({
              method,
              amountXaf,
            }))
          : [{ method: "especes", amountXaf: 0 }],
      countedByMethod: args.countedByMethod,
      closingBreakdown: args.closingBreakdown?.filter((l) => l.count > 0),
      varianceXaf,
      varianceReason: args.varianceReason?.trim() || undefined,
      status: "cloturee",
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "caisse.cloturer",
      entityTable: "cashSessions",
      entityId: session._id,
      after: {
        expectedTotal,
        countedTotal,
        varianceXaf,
        reason: args.varianceReason,
        expectedByMethod,
        countedByMethod: args.countedByMethod,
      },
    })

    return { varianceXaf, expectedTotal, countedTotal, sessionId: session._id }
  },
})

/**
 * Clôture la journée comptable.
 * Refusée tant qu'une session de caisse reste ouverte : la recette du jour
 * ne serait pas complète.
 */
export const closeAccountingDay = mutation({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "journee_comptable", "valider")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")
    if (day.status === "cloturee") {
      throw new Error("Journée comptable déjà clôturée")
    }

    const sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_day", (q) => q.eq("accountingDayId", args.accountingDayId))
      .collect()

    const ouvertes = sessions.filter((s) => s.status === "ouverte")
    if (ouvertes.length > 0) {
      throw new Error(
        `${ouvertes.length} session(s) de caisse encore ouverte(s) : ` +
          `clôture impossible`
      )
    }

    const nonJustifiees = sessions.filter(
      (s) => (s.varianceXaf ?? 0) !== 0 && !s.varianceReason?.trim()
    )
    if (nonJustifiees.length > 0) {
      throw new Error(
        `${nonJustifiees.length} écart(s) de caisse non justifié(s) : ` +
          `clôture impossible`
      )
    }

    await ctx.db.patch(args.accountingDayId, {
      status: "cloturee",
      closedAt: Date.now(),
      closedBy: actor._id,
      exportStatus: "en_attente",
    })

    // Les indicateurs se calculent une fois la journée figée, et hors de
    // cette mutation : ils parcourent toutes les ventes du jour, ce qui n'a
    // rien à faire dans la transaction de clôture.
    await ctx.scheduler.runAfter(
      0,
      internal.functions.rollup.rollupAccountingDay,
      {
        accountingDayId: args.accountingDayId,
      }
    )

    await audit(ctx, {
      actorId: actor._id,
      action: "journee.cloturer",
      entityTable: "accountingDays",
      entityId: args.accountingDayId,
      after: {
        date: day.date,
        sessions: sessions.length,
        totalTtc: day.totalTtc,
      },
    })

    return { sessions: sessions.length, totalTtc: day.totalTtc }
  },
})

/** États de contrôle d'une journée, pour le contrôleur de recettes. */
export const controlStates = query({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "caisse", "consulter")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")

    const sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_day", (q) => q.eq("accountingDayId", args.accountingDayId))
      .collect()

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_accounting_day", (q) =>
        q.eq("accountingDayId", args.accountingDayId)
      )
      .collect()

    return {
      day,
      sessions,
      totals: {
        sales: sales.filter((s) => s.kind === "vente").length,
        cancellations: sales.filter((s) => s.kind === "annulation").length,
        refunds: sales.filter((s) => s.kind === "remboursement").length,
        ttc: sales.reduce((sum, s) => sum + s.amounts.ttc, 0),
        received: sales.reduce((sum, s) => sum + s.amounts.received, 0),
      },
      openSessions: sessions.filter((s) => s.status === "ouverte").length,
      unjustifiedVariances: sessions.filter(
        (s) => (s.varianceXaf ?? 0) !== 0 && !s.varianceReason?.trim()
      ).length,
    }
  },
})
