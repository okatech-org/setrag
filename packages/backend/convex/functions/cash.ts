import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import { paymentMethod } from "../schema"
import { toServiceDate } from "../model/calendar"

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

/** Ouvre la session de caisse du vendeur courant. */
export const openSession = mutation({
  args: { openingFloatXaf: v.number() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "creer")
    if (!actor.pointOfSaleId) {
      throw new Error("Agent non rattaché à un point de vente")
    }
    if (!Number.isFinite(args.openingFloatXaf) || args.openingFloatXaf < 0) {
      throw new Error(`Fond de caisse invalide : ${args.openingFloatXaf}`)
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
      expectedByMethod: [],
      status: "ouverte",
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "caisse.ouvrir",
      entityTable: "cashSessions",
      entityId: id,
      after: { openingFloatXaf: args.openingFloatXaf },
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

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
      .collect()

    return {
      session,
      salesCount: sales.length,
      totalTtc: sales.reduce((sum, s) => sum + s.amounts.ttc, 0),
      totalReceived: sales.reduce((sum, s) => sum + s.amounts.received, 0),
      cancellations: sales.filter((s) => s.kind === "annulation").length,
      refunds: sales.filter((s) => s.kind === "remboursement").length,
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
    countedByMethod: v.array(
      v.object({ method: paymentMethod, amountXaf: v.number() }),
    ),
    varianceReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "modifier")
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .first()
    if (!session) throw new Error("Aucune session de caisse ouverte")

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
      .collect()

    // Théorique : ce que le système a enregistré, tous modes confondus.
    const expectedTotal = sales.reduce((sum, s) => sum + s.amounts.received, 0)
    const countedTotal = args.countedByMethod.reduce(
      (sum, c) => sum + c.amountXaf,
      0,
    )
    const varianceXaf = Math.round((countedTotal - expectedTotal) * 100) / 100

    if (varianceXaf !== 0 && !args.varianceReason?.trim()) {
      throw new Error(
        `Écart de caisse de ${varianceXaf} XAF : une justification est ` +
          `obligatoire pour clôturer`,
      )
    }

    await ctx.db.patch(session._id, {
      closedAt: Date.now(),
      expectedByMethod: [
        { method: "especes", amountXaf: expectedTotal },
      ],
      countedByMethod: args.countedByMethod,
      varianceXaf,
      varianceReason: args.varianceReason,
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
      },
    })

    return { varianceXaf, expectedTotal, countedTotal }
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
          `clôture impossible`,
      )
    }

    const nonJustifiees = sessions.filter(
      (s) => (s.varianceXaf ?? 0) !== 0 && !s.varianceReason?.trim(),
    )
    if (nonJustifiees.length > 0) {
      throw new Error(
        `${nonJustifiees.length} écart(s) de caisse non justifié(s) : ` +
          `clôture impossible`,
      )
    }

    await ctx.db.patch(args.accountingDayId, {
      status: "cloturee",
      closedAt: Date.now(),
      closedBy: actor._id,
      exportStatus: "en_attente",
    })

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
        q.eq("accountingDayId", args.accountingDayId),
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
        (s) => (s.varianceXaf ?? 0) !== 0 && !s.varianceReason?.trim(),
      ).length,
    }
  },
})
