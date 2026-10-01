import { v } from "convex/values"
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  assertPermission,
  audit,
  requirePermission,
  requireUser,
  type Permission,
  type ProtectedResource,
} from "../lib/auth"
import { cdcReportType, productType } from "../schema"
import { addDays, toLocalTime, toServiceDate } from "../model/calendar"
import { loadFactor, type SegmentLoad } from "../model/kpi"
import {
  DEFAULT_ANALYTIC_ACCOUNTS,
  summarizeByAccount,
} from "../model/accounting"
import { engendrerJournal } from "./accounting"

/**
 * Pilotage et finances du portail de gestion.
 *
 * Tableau de bord, contrôle des recettes, comptabilité (déversement SAGE X3),
 * rapports du cahier des charges, paramétrage et supervision des services
 * raccordés. Les systèmes tiers réels (SAGE X3, opérateurs de paiement,
 * passerelles SMS et e-mail, annuaire) ne sont pas encore raccordés : leurs
 * réponses sont SIMULÉES ici, de façon déterministe et tracée, et chaque
 * écran le dit. Tout le reste lit et écrit les vraies données.
 */

type Ctx = QueryCtx | MutationCtx

/** Vrai si l'utilisateur a le droit — mêmes gardes que `requirePermission`. */
async function peut(
  ctx: Ctx,
  user: Doc<"users">,
  resource: ProtectedResource,
  permission: Permission = "consulter"
): Promise<boolean> {
  try {
    await assertPermission(ctx, user, resource, permission)
    return true
  } catch {
    return false
  }
}

/** Exige au moins un des droits fournis (lecture transverse du pilotage). */
async function exigerUnDe(
  ctx: Ctx,
  droits: readonly [ProtectedResource, Permission][]
): Promise<Doc<"users">> {
  const user = await requireUser(ctx)
  for (const [resource, permission] of droits) {
    if (await peut(ctx, user, resource, permission)) return user
  }
  throw new Error(
    `Accès refusé : ${user.role} ne peut consulter ni ${droits
      .map(([r]) => `« ${r} »`)
      .join(", ni ")}`
  )
}

function nomAgent(user: Doc<"users"> | null | undefined): string {
  if (!user) return "—"
  const nom = [user.firstName, user.lastName].filter(Boolean).join(" ")
  const complet = nom || user.email || "Agent"
  return user.matricule ? `${complet} · ${user.matricule}` : complet
}

function dateCourte(date: string): string {
  const [, mois, jour] = date.split("-")
  return `${jour}/${mois}`
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Petit cache de lectures par identifiant, pour les jointures répétées. */
function cache<T extends { _id: string }>(ctx: Ctx) {
  const vus = new Map<string, T | null>()
  return async (id: string | undefined | null): Promise<T | null> => {
    if (!id) return null
    if (!vus.has(id)) {
      vus.set(id, (await ctx.db.get(id as never)) as T | null)
    }
    return vus.get(id) ?? null
  }
}

/* ══════════════════════════ Tableau de bord ════════════════════════════ */

export type TonDecision = "veille" | "danger" | "info"

/**
 * Ce qui attend une décision : livrets et grilles soumis, écarts de caisse à
 * viser, déversements rejetés, journées restées ouvertes. Chaque entrée n'est
 * rendue qu'à qui peut la traiter ou au moins la consulter.
 */
export const aDecider = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const today = toServiceDate(Date.now())
    const items: Array<{
      cle: string
      genre: "livret" | "grille" | "ecart" | "deversement" | "journee"
      ton: TonDecision
      titre: string
      detail: string
      lien: string
    }> = []

    if (await peut(ctx, user, "livrets_horaires", "consulter")) {
      const livrets = await ctx.db
        .query("timetableBooklets")
        .withIndex("by_status", (q) => q.eq("status", "a_valider"))
        .take(10)
      for (const livret of livrets) {
        items.push({
          cle: `livret-${livret._id}`,
          genre: "livret",
          ton: "veille",
          titre: `Livret « ${livret.label} » à valider`,
          detail: `Du ${dateCourte(toServiceDate(livret.validFrom))} au ${dateCourte(toServiceDate(livret.validUntil))}`,
          lien: `/gestion/livrets/${livret._id}`,
        })
      }
    }

    if (await peut(ctx, user, "tarifs", "consulter")) {
      const grilles = await ctx.db
        .query("fareSchedules")
        .withIndex("by_status", (q) => q.eq("status", "a_valider"))
        .take(10)
      for (const grille of grilles) {
        items.push({
          cle: `grille-${grille._id}`,
          genre: "grille",
          ton: "info",
          titre: `Grille tarifaire « ${grille.label} » soumise`,
          detail: `Application au ${dateCourte(toServiceDate(grille.validFrom))} · en attente d'approbation`,
          lien: `/gestion/tarifs/${grille._id}`,
        })
      }
    }

    if (await peut(ctx, user, "caisse", "consulter")) {
      const cloturees = await ctx.db
        .query("cashSessions")
        .withIndex("by_status", (q) => q.eq("status", "cloturee"))
        .take(500)
      const ecarts = cloturees.filter((s) => (s.varianceXaf ?? 0) !== 0)
      if (ecarts.length > 0) {
        const pos = cache<Doc<"pointsOfSale">>(ctx)
        const codes = new Set<string>()
        for (const s of ecarts.slice(0, 20)) {
          const p = await pos(s.pointOfSaleId)
          if (p) codes.add(p.code)
        }
        const net = ecarts.reduce((t, s) => t + (s.varianceXaf ?? 0), 0)
        items.push({
          cle: "ecarts",
          genre: "ecart",
          ton: "veille",
          titre: `${ecarts.length} écart${ecarts.length > 1 ? "s" : ""} de caisse à viser`,
          detail: `${[...codes].slice(0, 3).join(", ")}${codes.size > 3 ? "…" : ""} · ${net > 0 ? "+" : ""}${net.toLocaleString("fr-FR")} XAF au total`,
          lien: "/gestion/recettes",
        })
      }
    }

    if (await peut(ctx, user, "journal_comptable", "consulter")) {
      const rejets = await ctx.db
        .query("outboxEvents")
        .withIndex("by_type_status", (q) =>
          q.eq("type", "sage_export").eq("status", "echec")
        )
        .take(10)
      for (const event of rejets) {
        const day = await ctx.db.get(event.entityId as Id<"accountingDays">)
        items.push({
          cle: `deversement-${event._id}`,
          genre: "deversement",
          ton: "danger",
          titre: `Déversement SAGE du ${day ? dateCourte(day.date) : "?"} rejeté`,
          detail: event.lastError ?? "Motif non transmis",
          lien: day
            ? `/gestion/comptabilite?journee=${day._id}`
            : "/gestion/comptabilite",
        })
      }
    }

    if (await peut(ctx, user, "journee_comptable", "consulter")) {
      const ouvertes = (
        await ctx.db
          .query("accountingDays")
          .withIndex("by_status", (q) => q.eq("status", "ouverte"))
          .take(100)
      ).filter((d) => d.date < today)
      if (ouvertes.length > 0) {
        const triees = ouvertes.sort((a, b) => b.date.localeCompare(a.date))
        items.push({
          cle: "journees",
          genre: "journee",
          ton: "veille",
          titre: `${ouvertes.length} journée${ouvertes.length > 1 ? "s" : ""} comptable${ouvertes.length > 1 ? "s" : ""} à clôturer`,
          detail: triees
            .slice(0, 4)
            .map((d) => dateCourte(d.date))
            .join(", "),
          lien: `/gestion/recettes?journee=${triees[0]!._id}`,
        })
      }
    }

    return items
  },
})

/** Dessertes d'un jour de service, avec leurs arrêts (position estimée). */
async function dessertesDuJour(ctx: Ctx, date: string) {
  return await ctx.db
    .query("trips")
    .withIndex("by_service_date", (q) => q.eq("serviceDate", date))
    .take(60)
}

/**
 * Trains du jour et de la veille (les trains de nuit), avec l'horaire de
 * chaque arrêt : la position se calcule côté écran à l'heure courante,
 * d'après l'horaire et le retard annoncé — une estimation, pas un GPS.
 */
export const circulations = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    await exigerUnDe(ctx, [
      ["rapports", "consulter"],
      ["places", "consulter"],
    ])
    const stations = await ctx.db
      .query("stations")
      .withIndex("by_kilometerPoint")
      .collect()
    const parId = new Map(stations.map((s) => [s._id as string, s]))
    const trips = [
      ...(await dessertesDuJour(ctx, addDays(args.date, -1))),
      ...(await dessertesDuJour(ctx, args.date)),
    ]
    const trains = []
    for (const trip of trips) {
      const stops = (
        await ctx.db
          .query("tripStops")
          .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
          .collect()
      ).sort((a, b) => a.sequence - b.sequence)
      trains.push({
        id: trip._id,
        trainNumber: trip.trainNumber,
        trainType: trip.trainType,
        serviceDate: trip.serviceDate,
        status: trip.status,
        delayMinutes: trip.delayMinutes,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
        origin: parId.get(trip.originStationId)?.name ?? "?",
        destination: parId.get(trip.destinationStationId)?.name ?? "?",
        stops: stops.map((s) => ({
          km: s.kilometerPoint,
          name: parId.get(s.stationId)?.name ?? "?",
          arrivalAt: s.arrivalAt,
          departureAt: s.departureAt,
        })),
      })
    }
    return {
      gares: stations
        .filter((s) => s.isActive)
        .map((s) => ({ code: s.code, name: s.name, km: s.kilometerPoint })),
      trains,
    }
  },
})

/**
 * Remplissage des dessertes d'un jour, lu en direct dans l'inventaire
 * (compteurs par tronçon). Les cumuls `tripMetrics` n'existent qu'après
 * clôture : pour demain, seul l'inventaire dit la vérité.
 */
export const remplissageDessertes = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    await exigerUnDe(ctx, [
      ["places", "consulter"],
      ["rapports", "consulter"],
    ])
    const stations = cache<Doc<"stations">>(ctx)
    const trips = (await dessertesDuJour(ctx, args.date)).sort(
      (a, b) => a.departureAt - b.departureAt
    )
    const lignes = []
    for (const trip of trips) {
      const stops = (
        await ctx.db
          .query("tripStops")
          .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
          .collect()
      ).sort((a, b) => a.sequence - b.sequence)
      const longueurs = new Map<number, number>()
      for (let i = 0; i + 1 < stops.length; i += 1) {
        longueurs.set(
          i,
          Math.abs(stops[i + 1]!.kilometerPoint - stops[i]!.kilometerPoint)
        )
      }
      const compteurs = await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
        .collect()
      const segments: SegmentLoad[] = compteurs.map((c) => ({
        segmentIndex: c.segmentIndex,
        capacity: c.capacity,
        sold: c.sold,
        lengthKm: longueurs.get(c.segmentIndex) ?? 0,
      }))
      const facteur = loadFactor(segments)
      const parClasse = new Map<string, { capacite: number; vendues: number }>()
      for (const c of compteurs) {
        const courant = parClasse.get(c.serviceClass) ?? {
          capacite: 0,
          vendues: 0,
        }
        courant.capacite = Math.max(courant.capacite, c.capacity)
        courant.vendues = Math.max(courant.vendues, c.sold)
        parClasse.set(c.serviceClass, courant)
      }
      const capacite = [...parClasse.values()].reduce((t, c) => t + c.capacite, 0)
      const vendues = [...parClasse.values()].reduce((t, c) => t + c.vendues, 0)
      const [origine, destination] = await Promise.all([
        stations(trip.originStationId),
        stations(trip.destinationStationId),
      ])
      lignes.push({
        tripId: trip._id,
        trainNumber: trip.trainNumber,
        trainType: trip.trainType,
        status: trip.status,
        departureAt: trip.departureAt,
        origin: origine?.name ?? "?",
        destination: destination?.name ?? "?",
        loadFactorPct: facteur.pct,
        peakPct: facteur.peakPct,
        seatsSold: vendues,
        capacity: capacite,
      })
    }
    return lignes
  },
})

/**
 * Écarts de caisse d'une période : à viser (clôturés, justifiés, pas encore
 * visés), visés, montants. Alimente le tableau de bord.
 */
export const syntheseEcarts = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "caisse", "consulter")
    const days = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.gte("date", args.from).lte("date", args.to))
      .take(400)
    let aViser = 0
    let aViserXaf = 0
    let vises = 0
    let ouvertes = 0
    let sessions = 0
    for (const day of days) {
      const duJour = await ctx.db
        .query("cashSessions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .collect()
      sessions += duJour.length
      for (const s of duJour) {
        const ecart = s.varianceXaf ?? 0
        if (s.status === "ouverte") ouvertes += 1
        else if (s.status === "validee") vises += ecart !== 0 ? 1 : 0
        else if (ecart !== 0) {
          aViser += 1
          aViserXaf += ecart
        }
      }
    }
    return { sessions, ouvertes, aViser, aViserXaf, vises }
  },
})

/** Bornes des cumuls disponibles : les indicateurs s'arrêtent à la dernière clôture. */
export const periodeDisponible = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "rapports", "consulter")
    const [derniere, premiere] = await Promise.all([
      ctx.db.query("dailyMetrics").withIndex("by_date").order("desc").first(),
      ctx.db.query("dailyMetrics").withIndex("by_date").order("asc").first(),
    ])
    return {
      premiere: premiere?.date ?? null,
      derniere: derniere?.date ?? null,
      aujourdhui: toServiceDate(Date.now()),
    }
  },
})

/* ═════════════════════════ Contrôle des recettes ═══════════════════════ */

export type EtatCaisse =
  | "ouverte"
  | "juste"
  | "a_justifier"
  | "a_viser"
  | "recomptage"
  | "visee"

export function etatCaisse(
  session: Pick<
    Doc<"cashSessions">,
    "status" | "varianceXaf" | "varianceReason" | "recountRequestedAt"
  >
): EtatCaisse {
  if (session.status === "ouverte") return "ouverte"
  if (session.status === "validee") return "visee"
  if (session.recountRequestedAt) return "recomptage"
  const ecart = session.varianceXaf ?? 0
  if (ecart === 0) return "juste"
  return session.varianceReason?.trim() ? "a_viser" : "a_justifier"
}

/** Journées comptables récentes, avec l'état de leurs caisses. */
export const journeesRecettes = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "journee_comptable", "consulter")
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 31), 1), 90)
    const days = await ctx.db
      .query("accountingDays")
      .withIndex("by_date")
      .order("desc")
      .take(limit)
    const closer = cache<Doc<"users">>(ctx)
    const lignes = []
    for (const day of days) {
      const sessions = await ctx.db
        .query("cashSessions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .collect()
      const etats = sessions.map(etatCaisse)
      lignes.push({
        _id: day._id,
        date: day.date,
        status: day.status,
        totalTtc: day.totalTtc,
        totalReceived: day.totalReceived,
        closedAt: day.closedAt,
        closedBy: day.closedBy ? nomAgent(await closer(day.closedBy)) : null,
        exportStatus: day.exportStatus,
        caisses: sessions.length,
        ouvertes: etats.filter((e) => e === "ouverte").length,
        aViser: etats.filter((e) => e === "a_viser" || e === "recomptage")
          .length,
        aJustifier: etats.filter((e) => e === "a_justifier").length,
        ecartNet: sessions.reduce((t, s) => t + (s.varianceXaf ?? 0), 0),
        ecartBrut: sessions.reduce(
          (t, s) => t + Math.abs(s.varianceXaf ?? 0),
          0
        ),
      })
    }
    return lignes
  },
})

/** Caisses d'une journée : attendu, constaté, écart, état. */
export const caissesJournee = query({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "caisse", "consulter")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")

    const [sessions, sales] = await Promise.all([
      ctx.db
        .query("cashSessions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .collect(),
      ctx.db
        .query("sales")
        .withIndex("by_accounting_day", (q) =>
          q.eq("accountingDayId", day._id)
        )
        .collect(),
    ])

    const opposables = sales.filter(
      (s) =>
        s.status !== "brouillon" &&
        s.status !== "en_attente_paiement" &&
        s.status !== "expiree"
    )
    const parCaisse = new Map<string, Doc<"sales">[]>()
    for (const sale of opposables) {
      const cle = sale.cashSessionId ?? "__sans__"
      parCaisse.set(cle, [...(parCaisse.get(cle) ?? []), sale])
    }

    const users = cache<Doc<"users">>(ctx)
    const pos = cache<Doc<"pointsOfSale">>(ctx)
    const caisses = []
    for (const session of sessions) {
      const ventes = parCaisse.get(session._id) ?? []
      const [vendeur, point, viseur] = await Promise.all([
        users(session.sellerId),
        pos(session.pointOfSaleId),
        users(session.validatedBy),
      ])
      const attendu = round2(ventes.reduce((t, s) => t + s.amounts.received, 0))
      const constate =
        session.status === "ouverte"
          ? null
          : round2(
              (session.countedByMethod ?? []).reduce(
                (t, c) => t + c.amountXaf,
                0
              )
            )
      caisses.push({
        _id: session._id,
        pointOfSale: point
          ? { code: point.code, name: point.name }
          : { code: "?", name: "Point de vente inconnu" },
        seller: nomAgent(vendeur),
        sellerMatricule: vendeur?.matricule ?? null,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        openingFloatXaf: session.openingFloatXaf,
        operations: ventes.length,
        refunds: ventes.filter((s) => s.kind !== "vente").length,
        expectedXaf: attendu,
        countedXaf: constate,
        varianceXaf: session.status === "ouverte" ? null : (session.varianceXaf ?? 0),
        varianceReason: session.varianceReason ?? null,
        etat: etatCaisse(session),
        validatedBy: viseur ? nomAgent(viseur) : null,
        validatedAt: session.validatedAt ?? null,
        recountRequestedAt: session.recountRequestedAt ?? null,
      })
    }

    const ventes = opposables.filter((s) => s.kind === "vente")
    const sorties = opposables.filter((s) => s.kind !== "vente")
    const enLigne = parCaisse.get("__sans__") ?? []
    return {
      day: {
        _id: day._id,
        date: day.date,
        status: day.status,
        closedAt: day.closedAt ?? null,
        exportStatus: day.exportStatus ?? null,
      },
      caisses: caisses.sort((a, b) =>
        `${a.pointOfSale.code}${a.openedAt}`.localeCompare(
          `${b.pointOfSale.code}${b.openedAt}`
        )
      ),
      totals: {
        netTtc: round2(opposables.reduce((t, s) => t + s.amounts.ttc, 0)),
        ventes: ventes.length,
        ventesTtc: round2(ventes.reduce((t, s) => t + s.amounts.ttc, 0)),
        remboursements: sorties.length,
        remboursementsTtc: round2(
          sorties.reduce((t, s) => t + Math.abs(s.amounts.ttc), 0)
        ),
        horsCaisseTtc: round2(enLigne.reduce((t, s) => t + s.amounts.ttc, 0)),
        horsCaisse: enLigne.length,
      },
    }
  },
})

const LIBELLE_ACTION: Record<string, string> = {
  "caisse.ouvrir": "Ouverture de la caisse",
  "caisse.cloturer": "Clôture de la caisse",
  "caisse.viser": "Écart visé",
  "caisse.recomptage": "Recomptage demandé",
}

/** Détail d'une caisse : billetage, justification, opérations, journal. */
export const caisse = query({
  args: { sessionId: v.id("cashSessions") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "caisse", "consulter")
    const session = await ctx.db.get(args.sessionId)
    if (!session) return null
    const users = cache<Doc<"users">>(ctx)
    const [vendeur, point, day, viseur, demandeur] = await Promise.all([
      users(session.sellerId),
      ctx.db.get(session.pointOfSaleId),
      ctx.db.get(session.accountingDayId),
      users(session.validatedBy),
      users(session.recountRequestedBy),
    ])

    const sales = (
      await ctx.db
        .query("sales")
        .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
        .collect()
    ).sort((a, b) => b.soldAt - a.soldAt)

    const attenduParMoyen = new Map<string, number>()
    const operations = []
    for (const sale of sales) {
      const paiement = await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .first()
      const moyen = paiement?.method ?? "especes"
      const opposable =
        sale.status !== "brouillon" &&
        sale.status !== "en_attente_paiement" &&
        sale.status !== "expiree"
      if (opposable) {
        attenduParMoyen.set(
          moyen,
          round2((attenduParMoyen.get(moyen) ?? 0) + sale.amounts.received)
        )
      }
      operations.push({
        _id: sale._id,
        number: sale.number,
        soldAt: sale.soldAt,
        kind: sale.kind,
        product: sale.product,
        status: sale.status,
        ttc: sale.amounts.ttc,
        received: sale.amounts.received,
        method: moyen,
      })
    }
    const constateParMoyen = new Map<string, number>(
      (session.countedByMethod ?? []).map((c) => [c.method, c.amountXaf])
    )
    const moyens = [
      ...new Set([...attenduParMoyen.keys(), ...constateParMoyen.keys()]),
    ]
    const billetage = moyens.map((method) => {
      const attendu = attenduParMoyen.get(method) ?? 0
      const constate =
        session.status === "ouverte" ? null : (constateParMoyen.get(method) ?? 0)
      return {
        method,
        expectedXaf: attendu,
        countedXaf: constate,
        varianceXaf: constate === null ? null : round2(constate - attendu),
      }
    })

    const journal = (
      await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityTable", "cashSessions").eq("entityId", session._id)
        )
        .take(50)
    ).sort((a, b) => a.createdAt - b.createdAt)
    const evenements = []
    for (const log of journal) {
      evenements.push({
        _id: log._id,
        at: log.createdAt,
        action: LIBELLE_ACTION[log.action] ?? log.action,
        actor: nomAgent(await users(log.actorId)),
        reason: log.reason ?? null,
      })
    }

    const attendu = round2(
      [...attenduParMoyen.values()].reduce((t, x) => t + x, 0)
    )
    return {
      session: {
        _id: session._id,
        status: session.status,
        etat: etatCaisse(session),
        openedAt: session.openedAt,
        closedAt: session.closedAt ?? null,
        openingFloatXaf: session.openingFloatXaf,
        expectedXaf: attendu,
        countedXaf:
          session.status === "ouverte"
            ? null
            : round2(
                (session.countedByMethod ?? []).reduce(
                  (t, c) => t + c.amountXaf,
                  0
                )
              ),
        varianceXaf: session.status === "ouverte" ? null : (session.varianceXaf ?? 0),
        varianceReason: session.varianceReason ?? null,
        validatedBy: viseur ? nomAgent(viseur) : null,
        validatedAt: session.validatedAt ?? null,
        visaComment: session.visaComment ?? null,
        recountRequestedAt: session.recountRequestedAt ?? null,
        recountRequestedBy: demandeur ? nomAgent(demandeur) : null,
        recountReason: session.recountReason ?? null,
      },
      seller: nomAgent(vendeur),
      pointOfSale: point
        ? { code: point.code, name: point.name }
        : { code: "?", name: "Point de vente inconnu" },
      day: day ? { _id: day._id, date: day.date, status: day.status } : null,
      billetage,
      operations,
      journal: evenements,
    }
  },
})

/**
 * Visa d'une caisse par le contrôle des recettes. Un écart doit d'abord
 * avoir été justifié par le vendeur ; une fois visée, la caisse part au
 * déversement comptable.
 */
export const viserCaisse = mutation({
  args: {
    sessionId: v.id("cashSessions"),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "valider")
    const session = await ctx.db.get(args.sessionId)
    if (!session) throw new Error("Caisse introuvable")
    if (session.status === "ouverte") {
      throw new Error("Caisse encore ouverte : le visa suit la clôture.")
    }
    if (session.status === "validee") {
      throw new Error("Caisse déjà visée.")
    }
    const ecart = session.varianceXaf ?? 0
    if (ecart !== 0 && !session.varianceReason?.trim()) {
      throw new Error(
        "Écart non justifié : le vendeur doit d'abord le justifier."
      )
    }
    if (session.sellerId === actor._id) {
      throw new Error(
        "Séparation des tâches : un agent ne vise pas sa propre caisse."
      )
    }
    const commentaire = args.commentaire?.trim() || undefined
    if (commentaire && commentaire.length > 500) {
      throw new Error("Le commentaire dépasse 500 caractères.")
    }
    const now = Date.now()
    const after = {
      status: "validee" as const,
      validatedBy: actor._id,
      validatedAt: now,
      visaComment: commentaire,
    }
    await ctx.db.patch(session._id, after)
    await audit(ctx, {
      actorId: actor._id,
      action: "caisse.viser",
      entityTable: "cashSessions",
      entityId: session._id,
      permission: "valider",
      reason: commentaire,
      before: {
        status: session.status,
        varianceXaf: ecart,
        varianceReason: session.varianceReason,
        recountRequestedAt: session.recountRequestedAt,
      },
      after,
    })
    return { varianceXaf: ecart, validatedAt: now }
  },
})

/**
 * Demande de recomptage adressée au vendeur. La caisse reste clôturée ; la
 * demande est tracée et notifiée (file d'envoi, passerelle simulée).
 */
export const demanderRecomptage = mutation({
  args: { sessionId: v.id("cashSessions"), motif: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "valider")
    const motif = args.motif.trim()
    if (motif.length < 5 || motif.length > 500) {
      throw new Error("Le motif doit contenir entre 5 et 500 caractères.")
    }
    const session = await ctx.db.get(args.sessionId)
    if (!session) throw new Error("Caisse introuvable")
    if (session.status !== "cloturee") {
      throw new Error(
        session.status === "ouverte"
          ? "Caisse encore ouverte : le recomptage suit la clôture."
          : "Caisse déjà visée : recomptage impossible."
      )
    }
    const now = Date.now()
    await ctx.db.patch(session._id, {
      recountRequestedAt: now,
      recountRequestedBy: actor._id,
      recountReason: motif,
    })
    await ctx.db.insert("outboxEvents", {
      type: "notification",
      entityId: session._id,
      payload: JSON.stringify({
        kind: "cash_recount_request",
        sessionId: session._id,
        sellerId: session.sellerId,
        requestedBy: actor._id,
        motif,
      }),
      status: "en_attente",
      attempts: 0,
      createdAt: now,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "caisse.recomptage",
      entityTable: "cashSessions",
      entityId: session._id,
      permission: "valider",
      reason: motif,
      after: { recountRequestedAt: now },
    })
    return { requestedAt: now }
  },
})

/* ══════════════════════════════ Comptabilité ═══════════════════════════ */

/** Journées comptables et état de leur déversement SAGE. */
export const journeesComptables = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "journal_comptable", "consulter")
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 31), 1), 90)
    const days = await ctx.db
      .query("accountingDays")
      .withIndex("by_date")
      .order("desc")
      .take(limit)
    const events = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .take(1000)
    const parJour = new Map(events.map((e) => [e.entityId, e]))
    const lignes = []
    for (const day of days) {
      const event = parJour.get(day._id)
      const derniere = await ctx.db
        .query("sageTransmissions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .order("desc")
        .first()
      lignes.push({
        _id: day._id,
        date: day.date,
        status: day.status,
        totalTtc: day.totalTtc,
        exportStatus: day.exportStatus ?? null,
        exportError: day.exportError ?? null,
        journal:
          day.journalEntryCount !== undefined
            ? {
                pieces: day.journalEntryCount,
                totalTtc: day.journalTotalTtc ?? 0,
                refundsTtc: day.journalRefundsTtc ?? 0,
                generatedAt: day.journalGeneratedAt ?? null,
              }
            : event
              ? { pieces: null, totalTtc: day.totalTtc, refundsTtc: null, generatedAt: event.createdAt }
              : null,
        event: event
          ? {
              _id: event._id,
              status: event.status,
              attempts: event.attempts,
              lastError: event.lastError ?? null,
              sentAt: event.sentAt ?? null,
            }
          : null,
        derniereTransmission: derniere
          ? {
              sentAt: derniere.sentAt,
              result: derniere.result,
              receiptNumber: derniere.receiptNumber,
              rejected: derniere.rejectedPieces.length,
            }
          : null,
      })
    }
    return lignes
  },
})

/** Centres de coût proposés pour rattacher une pièce : un par point de vente actif. */
async function centresDeCout(ctx: Ctx) {
  const points = await ctx.db.query("pointsOfSale").take(500)
  return points
    .filter((p) => p.isActive)
    .map((p) => ({ code: `CC-${p.code}`, label: `${p.code} · ${p.name}` }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Détail d'une journée comptable : pièces V65, équilibre, taxes, échanges
 * avec SAGE X3 et pièces rejetées.
 */
export const detailJournee = query({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "journal_comptable", "consulter")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) return null
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
      .collect()
    const somme = (f: (e: Doc<"journalEntries">) => number, filtre = (_: Doc<"journalEntries">) => true) =>
      round2(entries.filter(filtre).reduce((t, e) => t + f(e), 0))
    const totaux = {
      ht: somme((e) => e.ht),
      vat: somme((e) => e.vat),
      css: somme((e) => e.css),
      ttc: somme((e) => e.ttc),
      ventesTtc: somme((e) => e.ttc, (e) => e.ttc >= 0),
      sortiesTtc: somme((e) => Math.abs(e.ttc), (e) => e.ttc < 0),
    }
    const event = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .filter((q) => q.eq(q.field("entityId"), day._id))
      .first()
    const users = cache<Doc<"users">>(ctx)
    const transmissions = []
    for (const t of await ctx.db
      .query("sageTransmissions")
      .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
      .order("desc")
      .take(20)) {
      transmissions.push({
        _id: t._id,
        attempt: t.attempt,
        sentAt: t.sentAt,
        result: t.result,
        receiptNumber: t.receiptNumber,
        pieceCount: t.pieceCount,
        totalTtc: t.totalTtc,
        rejectedPieces: t.rejectedPieces,
        simulated: t.simulated,
        sentBy: t.sentBy ? nomAgent(await users(t.sentBy)) : "Traitement de nuit",
      })
    }
    const sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
      .collect()
    return {
      day: {
        _id: day._id,
        date: day.date,
        status: day.status,
        totalTtc: day.totalTtc,
        closedAt: day.closedAt ?? null,
        exportStatus: day.exportStatus ?? null,
        exportError: day.exportError ?? null,
      },
      entries: entries
        .sort((a, b) => a.pieceNumber.localeCompare(b.pieceNumber))
        .map((e) => ({
          _id: e._id,
          journalCode: e.journalCode,
          pieceNumber: e.pieceNumber,
          saleDate: e.saleDate,
          financialSite: e.financialSite,
          pointOfSaleCode: e.pointOfSaleCode,
          analyticAccount: e.analyticAccount,
          costCenter: e.costCenter ?? null,
          ht: e.ht,
          vat: e.vat,
          css: e.css,
          ttc: e.ttc,
        })),
      totaux,
      /*
       * Équilibre de l'écriture de ventes : le débit (encaissements, TTC)
       * égale le crédit (produits HT + TVA collectée + CSS).
       */
      equilibre: {
        debit: totaux.ttc,
        credit: round2(totaux.ht + totaux.vat + totaux.css),
        ecart: round2(totaux.ttc - (totaux.ht + totaux.vat + totaux.css)),
        attendu: day.totalTtc,
        ecartJournee: round2(totaux.ttc - day.totalTtc),
      },
      byAccount: summarizeByAccount(entries),
      event: event
        ? {
            _id: event._id,
            status: event.status,
            attempts: event.attempts,
            lastError: event.lastError ?? null,
            createdAt: event.createdAt,
            sentAt: event.sentAt ?? null,
          }
        : null,
      transmissions,
      caisses: {
        total: sessions.length,
        ouvertes: sessions.filter((s) => s.status === "ouverte").length,
        nonVisees: sessions.filter(
          (s) => s.status === "cloturee" && (s.varianceXaf ?? 0) !== 0
        ).length,
      },
      centresDeCout: await centresDeCout(ctx),
    }
  },
})

const COMPTES_CONNUS = new Set(Object.values(DEFAULT_ANALYTIC_ACCOUNTS))

/**
 * Réponse simulée de SAGE X3 à un déversement.
 *
 * Tant que l'interface réelle n'est pas raccordée, la réponse est calculée
 * d'après les règles que SAGE applique à l'import : chaque pièce doit porter
 * un compte analytique du plan et un point de vente connu, actif, ou à
 * défaut un centre de coût de rattachement. Déterministe : la même journée
 * donne le même résultat, et une correction la fait passer.
 */
async function reponseSage(ctx: MutationCtx, entries: Doc<"journalEntries">[]) {
  const points = await ctx.db.query("pointsOfSale").take(500)
  const actifs = new Set(points.filter((p) => p.isActive).map((p) => p.code))
  const connus = new Set(points.map((p) => p.code))
  const centres = new Set([...actifs].map((code) => `CC-${code}`))
  const rejets: Doc<"sageTransmissions">["rejectedPieces"] = []
  for (const e of entries) {
    let motif: string | null = null
    if (!COMPTES_CONNUS.has(e.analyticAccount)) {
      motif = `Compte analytique ${e.analyticAccount} absent du plan SAGE`
    } else if (e.costCenter && !centres.has(e.costCenter)) {
      motif = `Centre de coût ${e.costCenter} inconnu`
    } else if (!e.costCenter && !actifs.has(e.pointOfSaleCode)) {
      motif = connus.has(e.pointOfSaleCode)
        ? `Compte analytique inconnu : CC-${e.pointOfSaleCode} (point de vente suspendu)`
        : `Compte analytique inconnu : point de vente ${e.pointOfSaleCode} absent du référentiel`
    }
    if (motif) {
      rejets.push({
        pieceNumber: e.pieceNumber,
        pointOfSaleCode: e.pointOfSaleCode,
        analyticAccount: e.analyticAccount,
        costCenter: e.costCenter,
        ttc: e.ttc,
        reason: motif,
      })
    }
  }
  return rejets
}

async function transmettre(
  ctx: MutationCtx,
  day: Doc<"accountingDays">,
  actorId: Id<"users"> | undefined
) {
  const event = await ctx.db
    .query("outboxEvents")
    .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
    .filter((q) => q.eq(q.field("entityId"), day._id))
    .first()
  if (!event) {
    throw new Error("Aucun journal engendré pour cette journée : rien à déverser.")
  }
  if (event.status === "envoye") {
    throw new Error("Déversement déjà intégré par SAGE : nouvel envoi refusé.")
  }
  if (event.status === "echec") {
    throw new Error("Déversement rejeté : corrigez les pièces puis rejouez.")
  }
  const entries = await ctx.db
    .query("journalEntries")
    .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
    .collect()
  const rejets = await reponseSage(ctx, entries)
  const now = Date.now()
  const tentative = event.attempts + 1
  const accuse = `X3-${day.date.replaceAll("-", "")}-${String(tentative).padStart(2, "0")}`
  const totalTtc = round2(entries.reduce((t, e) => t + e.ttc, 0))
  await ctx.db.insert("sageTransmissions", {
    accountingDayId: day._id,
    outboxEventId: event._id,
    attempt: tentative,
    sentAt: now,
    result: rejets.length === 0 ? "integre" : "rejete",
    receiptNumber: accuse,
    pieceCount: entries.length,
    totalTtc,
    rejectedPieces: rejets,
    simulated: true,
    sentBy: actorId,
  })
  if (rejets.length === 0) {
    await ctx.db.patch(event._id, {
      status: "envoye",
      attempts: tentative,
      sentAt: now,
      lastError: undefined,
    })
    await ctx.db.patch(day._id, { exportStatus: "integre", exportError: undefined })
  } else {
    const motif = `SAGE X3 : ${rejets.length} pièce${rejets.length > 1 ? "s" : ""} rejetée${rejets.length > 1 ? "s" : ""} — ${rejets[0]!.reason}`
    await ctx.db.patch(event._id, {
      status: "echec",
      attempts: tentative,
      lastError: motif,
    })
    await ctx.db.patch(day._id, { exportStatus: "echec", exportError: motif })
  }
  return {
    result: rejets.length === 0 ? ("integre" as const) : ("rejete" as const),
    receiptNumber: accuse,
    pieces: entries.length,
    rejected: rejets.length,
    attempt: tentative,
  }
}

/** Transmet à SAGE X3 (simulé) le journal en file d'une journée. */
export const transmettreSage = mutation({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "journal_comptable", "modifier")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")
    const resultat = await transmettre(ctx, day, actor._id)
    await audit(ctx, {
      actorId: actor._id,
      action: "comptabilite.transmettre",
      entityTable: "accountingDays",
      entityId: day._id,
      permission: "modifier",
      after: { ...resultat, simulated: true },
    })
    return resultat
  },
})

/**
 * Rattache des pièces rejetées à un centre de coût, puis rejoue le
 * déversement dans la même transaction. L'ancienne valeur reste au journal
 * d'audit ; le journal n'est jamais régénéré (pas de double comptage).
 */
export const corrigerEtRejouer = mutation({
  args: {
    accountingDayId: v.id("accountingDays"),
    pieceNumbers: v.array(v.string()),
    costCenter: v.string(),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "journal_comptable", "modifier")
    const motif = args.motif.trim()
    if (motif.length < 5) {
      throw new Error("Le motif de correction est obligatoire (5 caractères au moins).")
    }
    if (args.pieceNumbers.length === 0) {
      throw new Error("Sélectionnez au moins une pièce à corriger.")
    }
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")
    const centres = new Set((await centresDeCout(ctx)).map((c) => c.code))
    if (!centres.has(args.costCenter)) {
      throw new Error(`Centre de coût ${args.costCenter} inconnu du référentiel.`)
    }
    const event = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .filter((q) => q.eq(q.field("entityId"), day._id))
      .first()
    if (!event) throw new Error("Aucun déversement pour cette journée.")
    if (event.status === "envoye") {
      throw new Error("Déversement déjà intégré : correction refusée.")
    }
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
      .collect()
    const cibles = new Set(args.pieceNumbers)
    const avant: Array<{ pieceNumber: string; costCenter: string | null }> = []
    for (const e of entries) {
      if (!cibles.has(e.pieceNumber)) continue
      avant.push({ pieceNumber: e.pieceNumber, costCenter: e.costCenter ?? null })
      await ctx.db.patch(e._id, { costCenter: args.costCenter })
    }
    if (avant.length !== cibles.size) {
      throw new Error("Une ou plusieurs pièces n'appartiennent pas à cette journée.")
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "comptabilite.corriger",
      entityTable: "accountingDays",
      entityId: day._id,
      permission: "modifier",
      reason: motif,
      before: avant,
      after: { costCenter: args.costCenter, pieces: [...cibles] },
    })
    await ctx.db.patch(event._id, { status: "en_attente", lastError: undefined })
    await ctx.db.patch(day._id, { exportStatus: "en_attente", exportError: undefined })
    const resultat = await transmettre(ctx, (await ctx.db.get(day._id))!, actor._id)
    await audit(ctx, {
      actorId: actor._id,
      action: "comptabilite.rejeu",
      entityTable: "accountingDays",
      entityId: day._id,
      permission: "modifier",
      reason: motif,
      after: { ...resultat, simulated: true },
    })
    return resultat
  },
})

/* ═══════════════════════════════ Rapports ══════════════════════════════ */

export type TypeRapport =
  | "ventes"
  | "tracabilite_places"
  | "places_vendues"
  | "remboursements"
  | "etat_caisse"
  | "extraction_voyageurs"

/** Les états nominatifs exigent en plus l'accès aux données voyageurs. */
export const RAPPORTS_NOMINATIFS: readonly TypeRapport[] = [
  "places_vendues",
  "extraction_voyageurs",
]

export const ENTETES_RAPPORT: Record<TypeRapport, readonly string[]> = {
  ventes: [
    "N° opération",
    "Date",
    "Heure",
    "Opération",
    "Produit",
    "Canal",
    "Point de vente",
    "Vendeur",
    "Train",
    "HT",
    "TVA",
    "CSS",
    "TTC",
    "Encaissé",
    "Moyen de paiement",
    "Statut",
  ],
  tracabilite_places: [
    "Train",
    "Date de circulation",
    "Voiture",
    "Place",
    "Motif",
    "Commentaire",
    "Bloquée par",
    "Bloquée le",
    "Débloquée par",
    "Débloquée le",
    "État",
  ],
  places_vendues: [
    "Train",
    "Date de circulation",
    "Voiture",
    "Place",
    "Classe",
    "Billet",
    "Voyageur",
    "Téléphone",
    "Nationalité",
    "Origine",
    "Destination",
    "Prix TTC",
    "Point de vente",
    "Statut",
  ],
  remboursements: [
    "N° opération",
    "Date",
    "Heure",
    "Opération",
    "Vente d'origine",
    "Produit",
    "Point de vente",
    "Vendeur",
    "Montant rendu TTC",
    "Pénalité %",
    "Motif",
  ],
  etat_caisse: [
    "Journée",
    "Point de vente",
    "Vendeur",
    "Ouverture",
    "Clôture",
    "Fond de caisse",
    "Opérations",
    "Dont remboursements",
    "Bagages",
    "Poids bagages (kg)",
    "Colis",
    "Poids colis (kg)",
    "Attendu",
    "Constaté",
    "Écart",
    "Justification",
    "État",
    "Visée par",
  ],
  extraction_voyageurs: [
    "Nom",
    "Prénom",
    "Sexe",
    "Date de naissance",
    "Nationalité",
    "Pièce d'identité",
    "Téléphone",
    "Contact d'urgence",
    "Billet",
    "Train",
    "Date de circulation",
    "Origine",
    "Destination",
    "Voiture",
    "Place",
    "Statut",
    "Contrôlé à",
  ],
}

const LIBELLES_RAPPORT: Record<TypeRapport, string> = {
  ventes: "ventes",
  tracabilite_places: "tracabilite-places",
  places_vendues: "places-vendues",
  remboursements: "remboursements",
  etat_caisse: "etat-de-caisse",
  extraction_voyageurs: "extraction-voyageurs",
}

const CANAUX: Record<string, string> = {
  guichet: "Guichet",
  ligne: "En ligne",
  agence: "Agence accréditée",
  bord: "À bord",
  manuel: "Ressaisie manuelle",
}
const PRODUITS: Record<string, string> = {
  billet: "Billet",
  bagage: "Bagage",
  colis: "Colis",
  taa: "Transport de véhicule",
  funeraire: "Transport funéraire",
}
const MOYENS: Record<string, string> = {
  especes: "Espèces",
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
  clickpay: "Click&Pay",
  visa: "Visa",
  mastercard: "Mastercard",
  en_compte: "En compte",
}
const CLASSES: Record<string, string> = {
  DEUXIEME: "2e classe",
  PREMIERE: "1re classe",
  VIP: "VIP",
}
const OPERATIONS: Record<string, string> = {
  vente: "Vente",
  annulation: "Annulation",
  remboursement: "Remboursement",
}
const ETATS_CAISSE: Record<EtatCaisse, string> = {
  ouverte: "Ouverte",
  juste: "Juste",
  a_justifier: "À justifier",
  a_viser: "À viser",
  recomptage: "Recomptage demandé",
  visee: "Visée",
}
const MOTIFS_BLOCAGE: Record<string, string> = {
  maintenance: "Maintenance",
  exploitation: "Exploitation",
  protocole: "Protocole",
  autre: "Autre",
}

/** Format d'une cellule CSV lisible par Excel en français (« ; », virgule décimale). */
export function celluleCsv(valeur: string | number | boolean | null | undefined): string {
  if (valeur === null || valeur === undefined) return ""
  if (typeof valeur === "boolean") return valeur ? "oui" : "non"
  if (typeof valeur === "number") {
    return Number.isInteger(valeur) ? String(valeur) : String(round2(valeur)).replace(".", ",")
  }
  return /[";\n\r]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur
}

export function versCsv(entete: readonly string[], lignes: readonly (readonly (string | number | null)[])[]) {
  return [entete, ...lignes]
    .map((ligne) => ligne.map((c) => celluleCsv(c)).join(";"))
    .join("\r\n")
}

type Cellule = string | number | null

function dateLocale(timestamp: number) {
  const d = toServiceDate(timestamp)
  const [a, m, j] = d.split("-")
  return `${j}/${m}/${a}`
}

function horodatage(timestamp: number | undefined | null) {
  return timestamp ? `${dateLocale(timestamp)} ${toLocalTime(timestamp)}` : null
}

/** Lignes d'un état pour un jour donné : un appel par jour borne les lectures. */
export const lignesRapportJour = internalQuery({
  args: { runId: v.id("reportRuns"), date: v.string() },
  handler: async (ctx, args): Promise<Cellule[][]> => {
    const run = await ctx.db.get(args.runId)
    if (!run) return []
    const { pointOfSaleId, trainNumber, product } = run.filters
    const users = cache<Doc<"users">>(ctx)
    const pos = cache<Doc<"pointsOfSale">>(ctx)
    const trips = cache<Doc<"trips">>(ctx)
    const stations = cache<Doc<"stations">>(ctx)
    const lignes: Cellule[][] = []
    const memeTrain = (numero: string) =>
      !trainNumber ||
      numero.replace(/^[A-Z]+-/, "") === trainNumber.trim().toUpperCase().replace(/^[A-Z]+-/, "")

    const jourComptable = async () =>
      await ctx.db
        .query("accountingDays")
        .withIndex("by_date", (q) => q.eq("date", args.date))
        .unique()

    const ventesDuJour = async () => {
      const day = await jourComptable()
      if (!day) return []
      return (
        await ctx.db
          .query("sales")
          .withIndex("by_accounting_day", (q) => q.eq("accountingDayId", day._id))
          .collect()
      )
        .filter(
          (s) =>
            s.status !== "brouillon" &&
            s.status !== "en_attente_paiement" &&
            s.status !== "expiree"
        )
        .filter((s) => !pointOfSaleId || s.pointOfSaleId === pointOfSaleId)
        .filter((s) => !product || s.product === product)
        .sort((a, b) => a.soldAt - b.soldAt)
    }

    const trainDeVente = async (sale: Doc<"sales">) => {
      if (sale.product !== "billet") return null
      const ticket = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", sale.originSaleId ?? sale._id))
        .first()
      const trip = ticket ? await trips(ticket.tripId) : null
      return trip?.trainNumber ?? null
    }

    switch (run.reportType) {
      case "ventes": {
        for (const sale of await ventesDuJour()) {
          const train = await trainDeVente(sale)
          if (trainNumber && (!train || !memeTrain(train))) continue
          const paiement = await ctx.db
            .query("payments")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .first()
          const [vendeur, point] = await Promise.all([
            users(sale.sellerId),
            pos(sale.pointOfSaleId),
          ])
          lignes.push([
            sale.number,
            dateLocale(sale.soldAt),
            toLocalTime(sale.soldAt),
            OPERATIONS[sale.kind] ?? sale.kind,
            PRODUITS[sale.product] ?? sale.product,
            CANAUX[sale.channel] ?? sale.channel,
            point?.code ?? null,
            vendeur ? nomAgent(vendeur) : null,
            train,
            sale.amounts.ht,
            sale.amounts.vat,
            sale.amounts.css,
            sale.amounts.ttc,
            sale.amounts.received,
            paiement ? (MOYENS[paiement.method] ?? paiement.method) : sale.channel === "ligne" ? null : "Espèces",
            sale.status,
          ])
        }
        return lignes
      }
      case "remboursements": {
        for (const sale of await ventesDuJour()) {
          if (sale.kind === "vente") continue
          if (trainNumber) {
            const train = await trainDeVente(sale)
            if (!train || !memeTrain(train)) continue
          }
          const [vendeur, point, origine] = await Promise.all([
            users(sale.sellerId),
            pos(sale.pointOfSaleId),
            sale.originSaleId ? ctx.db.get(sale.originSaleId) : null,
          ])
          lignes.push([
            sale.number,
            dateLocale(sale.soldAt),
            toLocalTime(sale.soldAt),
            OPERATIONS[sale.kind] ?? sale.kind,
            origine?.number ?? null,
            PRODUITS[sale.product] ?? sale.product,
            point?.code ?? null,
            vendeur ? nomAgent(vendeur) : null,
            Math.abs(sale.amounts.ttc),
            sale.penaltyPct ?? null,
            sale.refundReason ?? null,
          ])
        }
        return lignes
      }
      case "etat_caisse": {
        const day = await jourComptable()
        if (!day) return []
        const sessions = (
          await ctx.db
            .query("cashSessions")
            .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
            .collect()
        ).filter((s) => !pointOfSaleId || s.pointOfSaleId === pointOfSaleId)
        for (const session of sessions) {
          const ventes = (
            await ctx.db
              .query("sales")
              .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
              .collect()
          ).filter(
            (s) =>
              s.status !== "brouillon" &&
              s.status !== "en_attente_paiement" &&
              s.status !== "expiree"
          )
          let bagages = 0
          let poidsBagages = 0
          let colis = 0
          let poidsColis = 0
          for (const sale of ventes) {
            if (sale.kind !== "vente") continue
            if (sale.product === "bagage") {
              for (const b of await ctx.db
                .query("baggages")
                .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
                .collect()) {
                bagages += 1
                poidsBagages += b.weightKg
              }
            } else if (sale.product === "colis") {
              for (const p of await ctx.db
                .query("parcels")
                .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
                .collect()) {
                colis += 1
                poidsColis += p.totalWeightKg
              }
            }
          }
          const [vendeur, point, viseur] = await Promise.all([
            users(session.sellerId),
            pos(session.pointOfSaleId),
            users(session.validatedBy),
          ])
          const attendu = round2(ventes.reduce((t, s) => t + s.amounts.received, 0))
          const constate =
            session.status === "ouverte"
              ? null
              : round2((session.countedByMethod ?? []).reduce((t, c) => t + c.amountXaf, 0))
          lignes.push([
            dateLocale(day.openedAt),
            point?.code ?? null,
            nomAgent(vendeur),
            horodatage(session.openedAt),
            horodatage(session.closedAt),
            session.openingFloatXaf,
            ventes.length,
            ventes.filter((s) => s.kind !== "vente").length,
            bagages,
            round2(poidsBagages),
            colis,
            round2(poidsColis),
            attendu,
            constate,
            session.status === "ouverte" ? null : (session.varianceXaf ?? 0),
            session.varianceReason ?? null,
            ETATS_CAISSE[etatCaisse(session)],
            viseur ? nomAgent(viseur) : null,
          ])
        }
        return lignes
      }
      case "tracabilite_places":
      case "places_vendues":
      case "extraction_voyageurs": {
        const dessertes = (await dessertesDuJour(ctx, args.date))
          .filter((t) => memeTrain(t.trainNumber))
          .sort((a, b) => a.departureAt - b.departureAt)
        for (const trip of dessertes) {
          if (run.reportType === "tracabilite_places") {
            const blocs = await ctx.db
              .query("seatBlocks")
              .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
              .collect()
            for (const bloc of blocs.sort((a, b) => a._creationTime - b._creationTime)) {
              const seat = await ctx.db.get(bloc.seatId)
              const coach = seat ? await ctx.db.get(seat.coachId) : null
              lignes.push([
                trip.trainNumber,
                args.date,
                coach?.label ?? null,
                seat?.label ?? null,
                MOTIFS_BLOCAGE[bloc.reason] ?? bloc.reason,
                bloc.comment ?? null,
                nomAgent(await users(bloc.createdBy)),
                horodatage(bloc._creationTime),
                bloc.releasedBy ? nomAgent(await users(bloc.releasedBy)) : null,
                horodatage(bloc.releasedAt),
                bloc.isActive ? "Bloquée" : "Débloquée",
              ])
            }
            continue
          }
          const tickets = await ctx.db
            .query("tickets")
            .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
            .collect()
          for (const ticket of tickets.sort((a, b) =>
            `${a.coachLabel ?? ""}${a.seatLabel ?? ""}`.localeCompare(
              `${b.coachLabel ?? ""}${b.seatLabel ?? ""}`,
              "fr",
              { numeric: true }
            )
          )) {
            if (ticket.status === "en_attente" || ticket.status === "expire") continue
            const sale = await ctx.db.get(ticket.saleId)
            if (pointOfSaleId && sale?.pointOfSaleId !== pointOfSaleId) continue
            const [origine, destination] = await Promise.all([
              stations(ticket.originStationId),
              stations(ticket.destinationStationId),
            ])
            const p = ticket.passenger
            if (run.reportType === "places_vendues") {
              const point = await pos(sale?.pointOfSaleId)
              lignes.push([
                trip.trainNumber,
                args.date,
                ticket.coachLabel ?? null,
                ticket.isStanding ? "Debout" : (ticket.seatLabel ?? null),
                CLASSES[ticket.serviceClass] ?? ticket.serviceClass,
                ticket.number,
                `${p.lastName.toUpperCase()} ${p.firstName}`,
                p.phone ?? sale?.contactPhone ?? null,
                p.nationality ?? null,
                origine?.name ?? null,
                destination?.name ?? null,
                ticket.unitPriceTtc,
                point?.code ?? (sale?.channel ? (CANAUX[sale.channel] ?? sale.channel) : null),
                ticket.status,
              ])
            } else {
              if (ticket.status !== "valide" && ticket.status !== "utilise") continue
              lignes.push([
                p.lastName.toUpperCase(),
                p.firstName,
                p.gender,
                p.birthDate ?? null,
                p.nationality ?? null,
                p.documentNumber ?? null,
                p.phone ?? sale?.contactPhone ?? null,
                p.emergencyPhone ?? null,
                ticket.number,
                trip.trainNumber,
                args.date,
                origine?.name ?? null,
                destination?.name ?? null,
                ticket.coachLabel ?? null,
                ticket.isStanding ? "Debout" : (ticket.seatLabel ?? null),
                ticket.status,
                horodatage(ticket.usedAt),
              ])
            }
          }
        }
        return lignes
      }
    }
  },
})

const argsRapport = {
  reportType: cdcReportType,
  from: v.string(),
  to: v.string(),
  pointOfSaleId: v.optional(v.id("pointsOfSale")),
  trainNumber: v.optional(v.string()),
  product: v.optional(productType),
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/
export const DUREE_MAX_RAPPORT_JOURS = 92

function verifierPeriode(from: string, to: string) {
  if (!DATE_ISO.test(from) || !DATE_ISO.test(to)) {
    throw new Error("Période invalide : dates attendues au format AAAA-MM-JJ.")
  }
  if (from > to) throw new Error("La date de début suit la date de fin.")
  const jours =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  if (jours > DUREE_MAX_RAPPORT_JOURS) {
    throw new Error(
      `Période trop longue (${jours} jours) : ${DUREE_MAX_RAPPORT_JOURS} jours au plus par état.`
    )
  }
}

/** Droits d'un état : rapports, plus les données propres à l'état. */
export async function exigerDroitsRapport(
  ctx: Ctx,
  type: TypeRapport,
  permission: Permission = "creer"
) {
  const actor = await requirePermission(ctx, "rapports", permission)
  if (RAPPORTS_NOMINATIFS.includes(type)) {
    await requirePermission(ctx, "donnees_voyageurs", "consulter")
  }
  if (type === "tracabilite_places") {
    await requirePermission(ctx, "places", "consulter")
  }
  return actor
}

/**
 * Inscrit une exécution et confie sa production à une action : l'état peut
 * parcourir des milliers d'opérations, ce qui n'a rien à faire dans une
 * mutation. L'écran suit l'exécution en direct jusqu'au fichier.
 */
export async function inscrireExecution(
  ctx: MutationCtx,
  params: {
    reportType: TypeRapport
    from: string
    to: string
    filters: Doc<"reportRuns">["filters"]
    trigger: Doc<"reportRuns">["trigger"]
    scheduleId?: Id<"reportSchedules">
    requestedBy?: Id<"users">
    recipients?: string[]
  }
): Promise<Id<"reportRuns">> {
  const runId = await ctx.db.insert("reportRuns", {
    reportType: params.reportType,
    trigger: params.trigger,
    scheduleId: params.scheduleId,
    from: params.from,
    to: params.to,
    filters: params.filters,
    status: "en_cours",
    requestedBy: params.requestedBy,
    requestedAt: Date.now(),
    delivery:
      params.recipients && params.recipients.length > 0
        ? { recipients: params.recipients, status: "en_file" }
        : undefined,
  })
  await ctx.scheduler.runAfter(0, internal.functions.pilotage.produireRapport, {
    runId,
  })
  return runId
}

/** Correspondance des programmations historiques vers les six états. */
export function typeCdc(
  type: Doc<"reportSchedules">["reportType"]
): TypeRapport {
  switch (type) {
    case "ventes_canaux":
      return "ventes"
    case "remplissage":
      return "places_vendues"
    case "annulations":
      return "remboursements"
    case "recettes":
      return "etat_caisse"
    default:
      return type
  }
}

/** Période couverte par une exécution programmée : la période close précédente. */
export function periodeProgrammee(
  frequency: Doc<"reportSchedules">["frequency"],
  now: number
): { from: string; to: string } {
  const hier = addDays(toServiceDate(now), -1)
  const jours = frequency === "quotidien" ? 1 : frequency === "hebdomadaire" ? 7 : 30
  return { from: addDays(hier, -(jours - 1)), to: hier }
}

/** Génère un état à la demande. */
export const demanderRapport = mutation({
  args: argsRapport,
  handler: async (ctx, args) => {
    const actor = await exigerDroitsRapport(ctx, args.reportType)
    verifierPeriode(args.from, args.to)
    const trainNumber = args.trainNumber?.trim() || undefined
    if (args.pointOfSaleId && !(await ctx.db.get(args.pointOfSaleId))) {
      throw new Error("Point de vente introuvable.")
    }
    const filters = {
      pointOfSaleId: args.pointOfSaleId,
      trainNumber,
      product: args.product,
    }
    const runId = await inscrireExecution(ctx, {
      reportType: args.reportType,
      from: args.from,
      to: args.to,
      filters,
      trigger: "demande",
      requestedBy: actor._id,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "rapport.generer",
      entityTable: "reportRuns",
      entityId: runId,
      permission: "creer",
      classification: RAPPORTS_NOMINATIFS.includes(args.reportType)
        ? "confidentiel"
        : "interne",
      after: { reportType: args.reportType, from: args.from, to: args.to, filters },
    })
    return runId
  },
})

export const lireExecution = internalQuery({
  args: { runId: v.id("reportRuns") },
  handler: async (ctx, args) => await ctx.db.get(args.runId),
})

/** Produit le fichier d'un état, jour par jour, puis le range. */
export const produireRapport = internalAction({
  args: { runId: v.id("reportRuns") },
  handler: async (ctx, args): Promise<void> => {
    const run = await ctx.runQuery(internal.functions.pilotage.lireExecution, {
      runId: args.runId,
    })
    if (!run || run.status !== "en_cours") return
    try {
      const entete = ENTETES_RAPPORT[run.reportType]
      const lignes: Cellule[][] = []
      for (let jour = run.from; jour <= run.to; jour = addDays(jour, 1)) {
        const part: Cellule[][] = await ctx.runQuery(
          internal.functions.pilotage.lignesRapportJour,
          { runId: args.runId, date: jour }
        )
        lignes.push(...part)
      }
      const contenu = `\uFEFF${versCsv(entete, lignes)}`
      const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" })
      const storageId = await ctx.storage.store(blob)
      await ctx.runMutation(internal.functions.pilotage.terminerRapport, {
        runId: args.runId,
        storageId,
        rowCount: lignes.length,
        byteSize: blob.size,
        filename: `setrag-${LIBELLES_RAPPORT[run.reportType]}-${run.from}-${run.to}.csv`,
        preview: JSON.stringify({ entete, lignes: lignes.slice(0, 20) }),
      })
    } catch (cause) {
      await ctx.runMutation(internal.functions.pilotage.echouerRapport, {
        runId: args.runId,
        error: cause instanceof Error ? cause.message : String(cause),
      })
    }
  },
})

export const terminerRapport = internalMutation({
  args: {
    runId: v.id("reportRuns"),
    storageId: v.id("_storage"),
    rowCount: v.number(),
    byteSize: v.number(),
    filename: v.string(),
    preview: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return
    const now = Date.now()
    let delivery = run.delivery
    if (delivery) {
      // Passerelle e-mail simulée : l'envoi est inscrit dans la file et
      // acquitté aussitôt, avec le fichier en pièce jointe (référence).
      const outboxEventId = await ctx.db.insert("outboxEvents", {
        type: "notification",
        entityId: args.runId,
        payload: JSON.stringify({
          kind: "scheduled_report",
          reportType: run.reportType,
          runId: args.runId,
          filename: args.filename,
          recipients: delivery.recipients,
          simulated: true,
        }),
        status: "envoye",
        attempts: 1,
        createdAt: now,
        sentAt: now,
      })
      delivery = {
        ...delivery,
        status: "envoye",
        outboxEventId,
        message: `Remis à ${delivery.recipients.length} destinataire${delivery.recipients.length > 1 ? "s" : ""} (passerelle e-mail simulée)`,
      }
    }
    await ctx.db.patch(args.runId, {
      status: "produit",
      storageId: args.storageId,
      rowCount: args.rowCount,
      byteSize: args.byteSize,
      filename: args.filename,
      preview: args.preview,
      completedAt: now,
      delivery,
    })
    if (run.scheduleId) {
      const schedule = await ctx.db.get(run.scheduleId)
      if (schedule) await ctx.db.patch(schedule._id, { lastRunId: args.runId })
    }
  },
})

export const echouerRapport = internalMutation({
  args: { runId: v.id("reportRuns"), error: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return
    await ctx.db.patch(args.runId, {
      status: "echec",
      error: args.error.slice(0, 500),
      completedAt: Date.now(),
      delivery: run.delivery
        ? { ...run.delivery, status: "echec", message: "État non produit : aucun envoi." }
        : undefined,
    })
    await audit(ctx, {
      action: "rapport.echec",
      entityTable: "reportRuns",
      entityId: args.runId,
      result: "echec",
      after: { error: args.error.slice(0, 500) },
    })
  },
})

async function vueExecution(ctx: QueryCtx, run: Doc<"reportRuns">) {
  const [demandeur, schedule, point] = await Promise.all([
    run.requestedBy ? ctx.db.get(run.requestedBy) : null,
    run.scheduleId ? ctx.db.get(run.scheduleId) : null,
    run.filters.pointOfSaleId ? ctx.db.get(run.filters.pointOfSaleId) : null,
  ])
  return {
    _id: run._id,
    reportType: run.reportType,
    trigger: run.trigger,
    from: run.from,
    to: run.to,
    filters: {
      pointOfSale: point ? `${point.code} · ${point.name}` : null,
      trainNumber: run.filters.trainNumber ?? null,
      product: run.filters.product ?? null,
    },
    status: run.status,
    rowCount: run.rowCount ?? null,
    byteSize: run.byteSize ?? null,
    filename: run.filename ?? null,
    error: run.error ?? null,
    requestedAt: run.requestedAt,
    completedAt: run.completedAt ?? null,
    requestedBy: demandeur ? nomAgent(demandeur) : run.trigger === "programme" ? "Programmation" : "—",
    schedule: schedule ? { _id: schedule._id, label: schedule.label } : null,
    delivery: run.delivery ?? null,
  }
}

/** Historique des exécutions, toutes ou celles d'une programmation. */
export const executionsRapport = query({
  args: {
    scheduleId: v.optional(v.id("reportSchedules")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 200)
    const runs = args.scheduleId
      ? await ctx.db
          .query("reportRuns")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("reportRuns")
          .withIndex("by_requested_at")
          .order("desc")
          .take(limit)
    return await Promise.all(runs.map((run) => vueExecution(ctx, run)))
  },
})

/** Détail d'une exécution : aperçu et lien de téléchargement du fichier. */
export const executionRapport = query({
  args: { runId: v.id("reportRuns") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "rapports", "consulter")
    const run = await ctx.db.get(args.runId)
    if (!run) return null
    const nominatif = RAPPORTS_NOMINATIFS.includes(run.reportType)
    const autorise =
      !nominatif || (await peut(ctx, user, "donnees_voyageurs", "consulter"))
    const preview = autorise && run.preview
      ? (JSON.parse(run.preview) as { entete: string[]; lignes: Cellule[][] })
      : null
    return {
      ...(await vueExecution(ctx, run)),
      nominatif,
      autorise,
      preview,
      url: autorise && run.storageId ? await ctx.storage.getUrl(run.storageId) : null,
    }
  },
})

/** Trace le téléchargement d'un état (obligatoire pour les états nominatifs). */
export const tracerTelechargement = mutation({
  args: { runId: v.id("reportRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error("Exécution introuvable")
    const actor = await exigerDroitsRapport(ctx, run.reportType, "consulter")
    await audit(ctx, {
      actorId: actor._id,
      action: "rapport.telecharger",
      entityTable: "reportRuns",
      entityId: run._id,
      permission: "consulter",
      classification: RAPPORTS_NOMINATIFS.includes(run.reportType)
        ? "confidentiel"
        : "interne",
      after: { filename: run.filename, rowCount: run.rowCount },
    })
    return { filename: run.filename ?? null }
  },
})

/** Filtres proposés par l'écran : points de vente et trains du référentiel. */
export const filtresRapport = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "rapports", "consulter")
    const [points, trains] = await Promise.all([
      ctx.db.query("pointsOfSale").take(500),
      ctx.db.query("trains").take(200),
    ])
    return {
      pointsOfSale: points
        .map((p) => ({ _id: p._id, code: p.code, name: p.name, isActive: p.isActive }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      trains: trains
        .map((t) => ({ number: t.number, name: t.name, type: t.type }))
        .sort((a, b) => a.number.localeCompare(b.number, "fr", { numeric: true })),
    }
  },
})

/* ══════════════════════════════ Paramétrage ════════════════════════════ */

export const CLE_PARAMETRES = "commercial"
export const CLE_PARAMETRES_PROGRAMMES = "commercial:programme"

export const PARAMETRES_PAR_DEFAUT = {
  vatPct: 18,
  cssPct: 0,
  seatHoldMinutes: 15,
  mobilePaymentAttempts: 3,
  degradedSalesEnabled: true,
  cashVarianceNotificationsEnabled: true,
  saleOpeningDays: 90,
  refundPenaltyEarlyPct: 10,
  refundPenaltyLatePct: 25,
  refundThresholdHours: 2,
  refundAfterDepartureAllowed: false,
  refundReasons: [
    "Changement de programme",
    "Train supprimé",
    "Retard de plus de deux heures",
    "Raison médicale",
    "Erreur de vente",
  ],
  ssoEnabled: true,
  mfaRequired: true,
  otpFallbackEnabled: true,
  sessionIdleMinutes: 10,
  ticketPrintFormat: "thermique_80" as "thermique_80" | "a5",
  duplicateMention: "DUPLICATA",
  ticketFooter: "Billet nominatif, non cessible. Conservez-le jusqu'à la sortie.",
}

export type Parametres = typeof PARAMETRES_PAR_DEFAUT

const CHAMPS_PARAMETRES = Object.keys(PARAMETRES_PAR_DEFAUT) as (keyof Parametres)[]

/** Paramètres d'un document, complétés par les valeurs par défaut. */
export function completerParametres(
  doc: Partial<Doc<"systemSettings">> | null
): Parametres {
  const resultat = { ...PARAMETRES_PAR_DEFAUT }
  if (!doc) return resultat
  for (const champ of CHAMPS_PARAMETRES) {
    const valeur = doc[champ as keyof Doc<"systemSettings">]
    if (valeur !== undefined) {
      ;(resultat as Record<string, unknown>)[champ] = valeur
    }
  }
  return resultat
}

/** Paramètres en vigueur, à lire par les autres modules (guichet, vente en ligne). */
export async function lireParametres(ctx: Ctx): Promise<Parametres> {
  const doc = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRES))
    .unique()
  return completerParametres(doc)
}

/** Contrôle des valeurs avant enregistrement : un message par champ fautif. */
export function verifierParametres(p: Parametres): string[] {
  const erreurs: string[] = []
  const borne = (valeur: number, min: number, max: number, libelle: string, entier = false) => {
    if (!Number.isFinite(valeur) || valeur < min || valeur > max || (entier && !Number.isInteger(valeur))) {
      erreurs.push(`${libelle} : entre ${min} et ${max}${entier ? ", nombre entier" : ""}.`)
    }
  }
  borne(p.vatPct, 0, 100, "TVA")
  borne(p.cssPct, 0, 100, "CSS")
  borne(p.seatHoldMinutes, 1, 120, "Tenue d'une place", true)
  borne(p.saleOpeningDays, 1, 365, "Ouverture de la vente", true)
  borne(p.mobilePaymentAttempts, 1, 10, "Tentatives de paiement mobile", true)
  borne(p.refundPenaltyEarlyPct, 0, 100, "Pénalité avant le seuil")
  borne(p.refundPenaltyLatePct, 0, 100, "Pénalité après le seuil")
  borne(p.refundThresholdHours, 0, 72, "Seuil de remboursement", true)
  borne(p.sessionIdleMinutes, 1, 120, "Session inactive", true)
  if (p.refundPenaltyLatePct < p.refundPenaltyEarlyPct) {
    erreurs.push("La pénalité tardive ne peut pas être inférieure à la pénalité anticipée.")
  }
  const motifs = p.refundReasons.map((m) => m.trim()).filter(Boolean)
  if (motifs.length === 0 || motifs.length > 20) {
    erreurs.push("Motifs de remboursement : entre 1 et 20.")
  }
  if (motifs.some((m) => m.length > 80)) {
    erreurs.push("Motifs de remboursement : 80 caractères au plus chacun.")
  }
  if (new Set(motifs.map((m) => m.toLowerCase())).size !== motifs.length) {
    erreurs.push("Motifs de remboursement : doublon.")
  }
  const mention = p.duplicateMention.trim()
  if (mention.length < 3 || mention.length > 24) {
    erreurs.push("Mention sur duplicata : entre 3 et 24 caractères.")
  }
  if (p.ticketFooter.length > 160) {
    erreurs.push("Pied de billet : 160 caractères au plus.")
  }
  if (!p.ssoEnabled && !p.otpFallbackEnabled) {
    erreurs.push("Sécurité : sans annuaire, le code à usage unique doit rester actif.")
  }
  return erreurs
}

/** Valeurs modifiées entre deux jeux de paramètres. */
export function differencesParametres(
  avant: Partial<Parametres>,
  apres: Partial<Parametres>
): Array<{ champ: string; avant: unknown; apres: unknown }> {
  const diffs: Array<{ champ: string; avant: unknown; apres: unknown }> = []
  for (const champ of CHAMPS_PARAMETRES) {
    if (!(champ in apres)) continue
    const a = JSON.stringify(avant[champ] ?? null)
    const b = JSON.stringify(apres[champ] ?? null)
    if (a !== b) diffs.push({ champ, avant: avant[champ] ?? null, apres: apres[champ] ?? null })
  }
  return diffs
}

const ACTIONS_PARAMETRAGE = [
  "parametrage.enregistrer",
  "parametrage.programmer",
  "parametrage.appliquer",
  "parametrage.annuler_programmation",
] as const

/** Paramètres en vigueur, version programmée et historique des modifications. */
export const parametres = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "parametrage", "consulter")
    const [courant, programme] = await Promise.all([
      ctx.db
        .query("systemSettings")
        .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRES))
        .unique(),
      ctx.db
        .query("systemSettings")
        .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRES_PROGRAMMES))
        .unique(),
    ])
    const users = cache<Doc<"users">>(ctx)
    const journaux = (
      await Promise.all(
        ACTIONS_PARAMETRAGE.map((action) =>
          ctx.db
            .query("auditLogs")
            .withIndex("by_action", (q) => q.eq("action", action))
            .order("desc")
            .take(20)
        )
      )
    )
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime)
      .slice(0, 30)
    const historique = []
    for (const log of journaux) {
      const avant = log.before ? (JSON.parse(log.before) as Partial<Parametres>) : {}
      const apres = log.after ? (JSON.parse(log.after) as Partial<Parametres> & { effectiveFrom?: number }) : {}
      historique.push({
        _id: log._id,
        at: log.createdAt,
        action: log.action,
        actor: log.actorId ? nomAgent(await users(log.actorId)) : "Système",
        reason: log.reason ?? null,
        effectiveFrom: apres.effectiveFrom ?? null,
        changes: differencesParametres(completerParametres(avant as never), apres),
      })
    }
    return {
      courant: completerParametres(courant),
      misAJourLe: courant?.updatedAt ?? null,
      misAJourPar: courant ? nomAgent(await users(courant.updatedBy)) : null,
      programme: programme
        ? {
            valeurs: completerParametres(programme),
            effectiveFrom: programme.effectiveFrom ?? null,
            par: nomAgent(await users(programme.updatedBy)),
            motif: programme.changeReason ?? null,
          }
        : null,
      historique,
    }
  },
})

/** Applique la version programmée à sa date d'effet. */
export const appliquerParametresProgrammes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const programme = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRES_PROGRAMMES))
      .unique()
    if (!programme) return { applied: false }
    if ((programme.effectiveFrom ?? 0) > Date.now() + 1000) return { applied: false }
    const courant = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRES))
      .unique()
    const valeurs = completerParametres(programme)
    const stored = {
      ...valeurs,
      key: CLE_PARAMETRES,
      updatedBy: programme.updatedBy,
      updatedAt: Date.now(),
      changeReason: programme.changeReason,
      effectiveFrom: undefined,
      scheduledJobId: undefined,
    }
    if (courant) await ctx.db.patch(courant._id, stored)
    else await ctx.db.insert("systemSettings", stored)
    await ctx.db.delete(programme._id)
    await audit(ctx, {
      actorId: programme.updatedBy,
      action: "parametrage.appliquer",
      entityTable: "systemSettings",
      entityId: courant?._id ?? CLE_PARAMETRES,
      reason: programme.changeReason,
      before: completerParametres(courant),
      after: { ...valeurs, effectiveFrom: programme.effectiveFrom },
    })
    return { applied: true }
  },
})

/** Renonce à la version programmée avant sa date d'effet. */
export const annulerParametresProgrammes = mutation({
  args: { motif: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "modifier")
    const motif = args.motif.trim()
    if (motif.length < 5) throw new Error("Le motif est obligatoire (5 caractères au moins).")
    const programme = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRES_PROGRAMMES))
      .unique()
    if (!programme) throw new Error("Aucune modification programmée.")
    if (programme.scheduledJobId) {
      await ctx.scheduler.cancel(programme.scheduledJobId)
    }
    await ctx.db.delete(programme._id)
    await audit(ctx, {
      actorId: actor._id,
      action: "parametrage.annuler_programmation",
      entityTable: "systemSettings",
      entityId: programme._id,
      reason: motif,
      before: { ...completerParametres(programme), effectiveFrom: programme.effectiveFrom },
    })
    return { cancelled: true }
  },
})

/* ══════════════════════════════ Intégrations ═══════════════════════════ */

export const SERVICES = [
  { code: "SAGE_X3", nom: "SAGE X3 V12", usage: "Déversement comptable V65" },
  { code: "AIRTEL_MONEY", nom: "Airtel Money", usage: "Paiement guichet et en ligne" },
  { code: "MOOV_MONEY", nom: "Moov Money", usage: "Paiement guichet et en ligne" },
  { code: "CLICKPAY", nom: "Click&Pay", usage: "Lien de paiement, cartes" },
  { code: "ENTRA_ID", nom: "Entra ID", usage: "Connexion unique, annuaire Eramet" },
  { code: "SMS", nom: "Passerelle SMS et e-mail", usage: "Billets, alertes, rapports" },
  { code: "TERMINAUX", nom: "Terminaux de bord", usage: "Contrôle, synchronisation" },
  { code: "SIEM", nom: "SIEM Eramet", usage: "Journal d'audit scellé" },
] as const

export type CodeService = (typeof SERVICES)[number]["code"]
export type EtatService = "operationnel" | "degrade" | "incident" | "non_raccorde" | "inactif"

const METHODE_SERVICE: Partial<Record<CodeService, Doc<"payments">["method"][]>> = {
  AIRTEL_MONEY: ["airtel_money"],
  MOOV_MONEY: ["moov_money"],
  CLICKPAY: ["clickpay", "visa", "mastercard"],
}

const JOUR = 86_400_000

interface EvenementService {
  _id: string
  source: "outbox" | "paiement" | "controle" | "sceau" | "sage" | "test"
  at: number
  titre: string
  detail: string | null
  statut: "ok" | "attente" | "echec" | "info"
  rejouable: boolean
}

interface EtatCalcule {
  code: CodeService
  nom: string
  usage: string
  etat: EtatService
  libelleEtat: string
  dernierEchange: number | null
  fileAttente: number | null
  echecs: number
  reussite30j: number | null
  simule: boolean
  evenements: EvenementService[]
}

/**
 * Derniers paiements, lus une fois par requête et partagés par les trois
 * opérateurs : la supervision ne doit pas coûter plus que la vente.
 */
const LECTURES_PAIEMENTS = new WeakMap<object, Promise<Doc<"payments">[]>>()
function paiementsRecents(ctx: QueryCtx) {
  let lecture = LECTURES_PAIEMENTS.get(ctx.db)
  if (!lecture) {
    lecture = ctx.db.query("payments").order("desc").take(1500)
    LECTURES_PAIEMENTS.set(ctx.db, lecture)
  }
  return lecture
}

async function etatService(
  ctx: QueryCtx,
  service: (typeof SERVICES)[number],
  avecEvenements: boolean
): Promise<EtatCalcule> {
  const now = Date.now()
  const depuis = now - 30 * JOUR
  const base = { code: service.code, nom: service.nom, usage: service.usage }
  const evenements: EvenementService[] = []

  if (service.code === "SAGE_X3") {
    const events = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .take(500)
    const transmissions = await ctx.db
      .query("sageTransmissions")
      .withIndex("by_sent_at", (q) => q.gte("sentAt", depuis))
      .collect()
    const attente = events.filter((e) => e.status === "en_attente")
    const echecs = events.filter((e) => e.status === "echec")
    const dernier = Math.max(0, ...transmissions.map((t) => t.sentAt), ...events.map((e) => e.sentAt ?? 0))
    const vieux = attente.some((e) => now - e.createdAt > JOUR)
    if (avecEvenements) {
      const jours = cache<Doc<"accountingDays">>(ctx)
      for (const e of [...events].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30)) {
        const day = await jours(e.entityId)
        evenements.push({
          _id: e._id,
          source: "outbox",
          at: e.sentAt ?? e.createdAt,
          titre: `Journal V65 du ${day ? dateCourte(day.date) : "?"}`,
          detail: e.lastError ?? (e.status === "envoye" ? "Intégré par SAGE" : `${e.attempts} tentative(s)`),
          statut: e.status === "envoye" ? "ok" : e.status === "echec" ? "echec" : "attente",
          rejouable: e.status === "echec",
        })
      }
    }
    return {
      ...base,
      etat: echecs.length > 0 ? "incident" : vieux ? "degrade" : events.length === 0 ? "inactif" : "operationnel",
      libelleEtat:
        echecs.length > 0
          ? `${echecs.length} déversement${echecs.length > 1 ? "s" : ""} rejeté${echecs.length > 1 ? "s" : ""}`
          : vieux
            ? "Déversement en attente depuis plus de 24 h"
            : events.length === 0
              ? "Aucun déversement"
              : "Opérationnel",
      dernierEchange: dernier || null,
      fileAttente: attente.length,
      echecs: echecs.length,
      reussite30j:
        transmissions.length === 0
          ? null
          : round2((transmissions.filter((t) => t.result === "integre").length / transmissions.length) * 100),
      simule: true,
      evenements,
    }
  }

  const methodes = METHODE_SERVICE[service.code]
  if (methodes) {
    const paiements = (await paiementsRecents(ctx)).filter((p) => methodes.includes(p.method))
    const recents = paiements.filter((p) => p._creationTime >= depuis)
    const termines = recents.filter((p) => p.status === "confirme" || p.status === "echoue" || p.status === "expire")
    const reussis = termines.filter((p) => p.status === "confirme").length
    const attente = paiements.filter((p) => p.status === "initie" || p.status === "en_attente")
    const echecs24h = paiements.filter((p) => p.status === "echoue" && now - p._creationTime < JOUR).length
    const taux = termines.length === 0 ? null : round2((reussis / termines.length) * 100)
    const dernier = paiements[0] ? Math.max(paiements[0]._creationTime, paiements[0].settledAt ?? 0) : null
    const simule = paiements.length === 0 || paiements.some((p) => p.provider === "simule" || !p.provider)
    if (avecEvenements) {
      for (const p of paiements.slice(0, 30)) {
        evenements.push({
          _id: p._id,
          source: "paiement",
          at: p.settledAt ?? p._creationTime,
          titre: `${MOYENS[p.method] ?? p.method} · ${p.amountXaf.toLocaleString("fr-FR")} XAF`,
          detail: p.failureReason ?? p.providerReference ?? null,
          statut: p.status === "confirme" || p.status === "rembourse" ? "ok" : p.status === "echoue" || p.status === "expire" ? "echec" : "attente",
          rejouable: false,
        })
      }
    }
    const degrade = (taux !== null && taux < 95) || echecs24h >= 3
    return {
      ...base,
      etat: paiements.length === 0 ? "inactif" : degrade ? "degrade" : "operationnel",
      libelleEtat:
        paiements.length === 0
          ? "Aucune transaction"
          : degrade
            ? `Dégradé · ${echecs24h} échec${echecs24h > 1 ? "s" : ""} sur 24 h`
            : "Opérationnel",
      dernierEchange: dernier,
      fileAttente: attente.length,
      echecs: echecs24h,
      reussite30j: taux,
      simule,
      evenements,
    }
  }

  if (service.code === "ENTRA_ID") {
    const configure = Boolean(
      process.env.ERAMET_DIRECTORY_SYNC_URL && process.env.ERAMET_DIRECTORY_SYNC_TOKEN
    )
    return {
      ...base,
      etat: "non_raccorde",
      libelleEtat: configure
        ? "Non raccordé · contrat de données attendu"
        : "Non raccordé · adresse et jeton de l'annuaire à fournir",
      dernierEchange: null,
      fileAttente: null,
      echecs: 0,
      reussite30j: null,
      simule: true,
      evenements,
    }
  }

  if (service.code === "SMS") {
    const events = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "notification"))
      .order("desc")
      .take(500)
    const attente = events.filter((e) => e.status === "en_attente")
    const echecs = events.filter((e) => e.status === "echec")
    const envoyes = events.filter((e) => e.status === "envoye" && (e.sentAt ?? 0) >= depuis)
    const termines = events.filter((e) => e.createdAt >= depuis && e.status !== "en_attente")
    const dernier = Math.max(0, ...events.map((e) => e.sentAt ?? e.createdAt))
    if (avecEvenements) {
      for (const e of events.slice(0, 30)) {
        let genre = "Notification"
        try {
          const payload = JSON.parse(e.payload) as { kind?: string }
          genre =
            payload.kind === "scheduled_report"
              ? "Envoi de rapport"
              : payload.kind === "cash_recount_request"
                ? "Demande de recomptage"
                : payload.kind === "integration_retry_request"
                  ? "Demande de reprise"
                  : (payload.kind ?? genre)
        } catch {
          // Charge utile illisible : le libellé générique suffit.
        }
        evenements.push({
          _id: e._id,
          source: "outbox",
          at: e.sentAt ?? e.createdAt,
          titre: genre,
          detail: e.lastError ?? `${e.attempts} tentative(s)`,
          statut: e.status === "envoye" ? "ok" : e.status === "echec" ? "echec" : "attente",
          rejouable: e.status === "echec",
        })
      }
    }
    const vieux = attente.some((e) => now - e.createdAt > 6 * 3_600_000)
    return {
      ...base,
      etat: echecs.length > 0 ? "degrade" : vieux ? "degrade" : events.length === 0 ? "inactif" : "operationnel",
      libelleEtat:
        echecs.length > 0
          ? `${echecs.length} envoi${echecs.length > 1 ? "s" : ""} en échec`
          : vieux
            ? "Messages en attente depuis plus de 6 h"
            : events.length === 0
              ? "Aucun envoi"
              : "Opérationnel",
      dernierEchange: dernier || null,
      fileAttente: attente.length,
      echecs: echecs.length,
      reussite30j: termines.length === 0 ? null : round2((envoyes.length / termines.length) * 100),
      simule: true,
      evenements,
    }
  }

  if (service.code === "TERMINAUX") {
    const scans = await ctx.db.query("ticketScans").order("desc").take(1000)
    const conflits = await ctx.db
      .query("ticketScans")
      .withIndex("by_conflict", (q) => q.eq("conflict", true))
      .take(100)
    const recents = scans.filter((s) => s.scannedAt >= now - JOUR)
    const horsLigne = recents.filter((s) => s.offline).length
    const dernier = scans[0] ? (scans[0].syncedAt ?? scans[0].scannedAt) : null
    if (avecEvenements) {
      for (const s of scans.slice(0, 30)) {
        evenements.push({
          _id: s._id,
          source: "controle",
          at: s.syncedAt ?? s.scannedAt,
          titre: `Contrôle ${s.result.replaceAll("_", " ")}`,
          detail: s.offline
            ? `Hors ligne, synchronisé ${s.syncedAt ? `après ${Math.max(0, Math.round((s.syncedAt - s.scannedAt) / 60_000))} min` : "plus tard"}`
            : "En ligne",
          statut: s.conflict ? "echec" : "ok",
          rejouable: false,
        })
      }
    }
    return {
      ...base,
      etat: conflits.length > 0 ? "degrade" : scans.length === 0 ? "inactif" : "operationnel",
      libelleEtat:
        conflits.length > 0
          ? `${conflits.length} conflit${conflits.length > 1 ? "s" : ""} de contrôle à arbitrer`
          : scans.length === 0
            ? "Aucune synchronisation"
            : horsLigne > 0
              ? `Opérationnel · ${horsLigne} contrôle${horsLigne > 1 ? "s" : ""} hors ligne sur 24 h`
              : "Opérationnel",
      dernierEchange: dernier,
      fileAttente: null,
      echecs: conflits.length,
      reussite30j: null,
      simule: false,
      evenements,
    }
  }

  // SIEM : le scellement quotidien du journal d'audit tient lieu d'export.
  const sceaux = await ctx.db.query("auditSeals").withIndex("by_window_end").order("desc").take(30)
  const dernierSceau = sceaux[0]
  const enAttente = await ctx.db
    .query("auditLogs")
    .withIndex("by_createdAt", (q) => q.gt("createdAt", dernierSceau?.windowEnd ?? 0))
    .take(1000)
  if (avecEvenements) {
    for (const s of sceaux) {
      evenements.push({
        _id: s._id,
        source: "sceau",
        at: s.sealedAt,
        titre: `Fenêtre scellée · ${s.logCount} entrée${s.logCount > 1 ? "s" : ""}`,
        detail: `Empreinte ${s.sealHash.slice(0, 16)}…`,
        statut: "ok",
        rejouable: false,
      })
    }
  }
  const ancien = !dernierSceau || now - dernierSceau.sealedAt > 2 * JOUR
  return {
    ...base,
    etat: ancien ? "degrade" : "operationnel",
    libelleEtat: !dernierSceau
      ? "Aucun scellement encore produit"
      : ancien
        ? "Dernier scellement de plus de 48 h"
        : "Opérationnel",
    dernierEchange: dernierSceau?.sealedAt ?? null,
    fileAttente: enAttente.length,
    echecs: 0,
    reussite30j: null,
    simule: true,
    evenements,
  }
}

async function dernierTest(ctx: QueryCtx, code: string) {
  const probe = await ctx.db
    .query("integrationProbes")
    .withIndex("by_service", (q) => q.eq("service", code))
    .order("desc")
    .first()
  return probe
    ? {
        at: probe.testedAt,
        result: probe.result,
        latencyMs: probe.latencyMs ?? null,
        message: probe.message,
      }
    : null
}

/** Santé des services raccordés. */
export const etatIntegrations = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "integrations", "consulter")
    const services = []
    for (const service of SERVICES) {
      // Sans les événements : `avecEvenements` à faux rend une liste vide.
      const etat = await etatService(ctx, service, false)
      services.push({ ...etat, dernierTest: await dernierTest(ctx, service.code) })
    }
    return { verifieLe: Date.now(), services }
  },
})

/** Détail d'un service : événements récents et tests de connexion. */
export const detailIntegration = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "integrations", "consulter")
    const service = SERVICES.find((s) => s.code === args.code)
    if (!service) return null
    const etat = await etatService(ctx, service, true)
    const users = cache<Doc<"users">>(ctx)
    const tests = []
    for (const probe of await ctx.db
      .query("integrationProbes")
      .withIndex("by_service", (q) => q.eq("service", service.code))
      .order("desc")
      .take(20)) {
      tests.push({
        _id: probe._id,
        at: probe.testedAt,
        result: probe.result,
        latencyMs: probe.latencyMs ?? null,
        message: probe.message,
        simulated: probe.simulated,
        by: nomAgent(await users(probe.testedBy)),
      })
    }
    return { ...etat, tests, dernierTest: await dernierTest(ctx, service.code) }
  },
})

/**
 * Test de connexion. Aucun appel réseau réel n'est émis tant que les
 * services ne sont pas raccordés : le résultat est dérivé de l'état observé
 * (échecs, file d'attente) et le test est tracé comme simulé.
 */
export const testerConnexion = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "integrations", "consulter")
    const service = SERVICES.find((s) => s.code === args.code)
    if (!service) throw new Error(`Service inconnu : ${args.code}`)
    const etat = await etatService(ctx, service, false)
    const now = Date.now()
    // Latence stable pour un service et une minute donnés : pas de hasard
    // dans une mutation, qui doit rester rejouable.
    let graine = now - (now % 60_000)
    for (const c of service.code) graine = (graine * 31 + c.charCodeAt(0)) % 1_000_003
    const latence =
      etat.etat === "non_raccorde" ? undefined : 80 + (graine % 240) + (etat.etat === "degrade" ? 900 : 0)
    const result: Doc<"integrationProbes">["result"] =
      etat.etat === "non_raccorde"
        ? "non_raccorde"
        : etat.etat === "incident"
          ? "echec"
          : etat.etat === "degrade"
            ? "degrade"
            : "ok"
    const message =
      result === "non_raccorde"
        ? `${service.nom} n'est pas raccordé : aucune connexion possible.`
        : result === "echec"
          ? `Connexion établie, mais ${etat.libelleEtat.toLowerCase()}.`
          : result === "degrade"
            ? `Réponse lente (${latence} ms) · ${etat.libelleEtat}.`
            : `Réponse en ${latence} ms.`
    await ctx.db.insert("integrationProbes", {
      service: service.code,
      result,
      latencyMs: latence,
      message,
      simulated: true,
      testedBy: actor._id,
      testedAt: now,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "integrations.tester",
      entityTable: "integrationProbes",
      entityId: service.code,
      after: { result, latencyMs: latence, simulated: true },
    })
    return { result, latencyMs: latence ?? null, message }
  },
})

/** Remet en file un envoi en échec, avec un motif tracé. */
export const rejouerEvenement = mutation({
  args: { eventId: v.id("outboxEvents"), motif: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "integrations", "modifier")
    const motif = args.motif.trim()
    if (motif.length < 5) throw new Error("Le motif est obligatoire (5 caractères au moins).")
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Événement introuvable")
    if (event.status !== "echec") {
      throw new Error("Seul un envoi en échec peut être rejoué.")
    }
    await ctx.db.patch(event._id, { status: "en_attente", lastError: undefined })
    if (event.type === "sage_export") {
      const day = await ctx.db.get(event.entityId as Id<"accountingDays">)
      if (day) {
        await ctx.db.patch(day._id, { exportStatus: "en_attente", exportError: undefined })
      }
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "integrations.rejouer",
      entityTable: "outboxEvents",
      entityId: event._id,
      permission: "modifier",
      reason: motif,
      before: { status: event.status, lastError: event.lastError, attempts: event.attempts },
      after: { status: "en_attente" },
    })
    return { replayed: true }
  },
})

/* ═══════════════════════ Amorçage de démonstration ═════════════════════ */

/** Écarts tirés en boucle pour les caisses de démonstration (XAF). */
const ECARTS_DEMO = [-500, 0, -3000, 250, -750, 0, 1000] as const

function exigerDemo() {
  if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
    throw new Error("Amorçage refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
  }
}

/**
 * Amorce la démonstration du pilotage sur un déploiement de démonstration :
 *
 * 1. clôt les caisses restées ouvertes sur une journée passée, avec un écart
 *    justifié (à viser au contrôle des recettes) ;
 * 2. clôt les journées passées dont toutes les caisses sont closes et
 *    justifiées, puis calcule leurs cumuls ;
 * 3. engendre le journal V65 des dernières journées clôturées et le déverse
 *    dans SAGE (simulé) : la plus récente reste en file, la suivante est
 *    rejetée (centre de coût d'une agence absente du référentiel), les
 *    autres sont intégrées ;
 * 4. produit trois états sur la dernière semaine clôturée.
 *
 * Rejouable : ce qui est déjà fait n'est pas refait.
 */
export const amorcerDemo = internalMutation({
  args: { journees: v.optional(v.number()) },
  handler: async (ctx, args) => {
    exigerDemo()
    const today = toServiceDate(Date.now())
    const now = Date.now()

    let caissesCloses = 0
    const ouvertes = await ctx.db
      .query("cashSessions")
      .withIndex("by_status", (q) => q.eq("status", "ouverte"))
      .take(100)
    for (const session of ouvertes) {
      const day = await ctx.db.get(session.accountingDayId)
      if (!day || day.date >= today) continue
      const ventes = (
        await ctx.db
          .query("sales")
          .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
          .collect()
      ).filter((s) => s.status !== "brouillon" && s.status !== "en_attente_paiement" && s.status !== "expiree")
      const attendu = round2(ventes.reduce((t, s) => t + s.amounts.received, 0))
      const ecartXaf = ECARTS_DEMO[caissesCloses % ECARTS_DEMO.length]!
      await ctx.db.patch(session._id, {
        closedAt: Math.min(session.openedAt + 9 * 3_600_000, now),
        expectedByMethod: [{ method: "especes", amountXaf: attendu }],
        countedByMethod: [{ method: "especes", amountXaf: round2(attendu + ecartXaf) }],
        varianceXaf: ecartXaf,
        varianceReason:
          ecartXaf === 0
            ? undefined
            : ecartXaf < 0
              ? "Monnaie rendue en trop sur une vente en espèces, constaté au recomptage."
              : "Pièce encaissée sans ticket lors d'une coupure réseau, ressaisie le lendemain.",
        status: "cloturee",
      })
      await audit(ctx, {
        actorId: session.sellerId,
        action: "caisse.cloturer",
        entityTable: "cashSessions",
        entityId: session._id,
        reason: "Amorçage de démonstration",
        after: { expectedTotal: attendu, varianceXaf: ecartXaf },
      })
      caissesCloses += 1
    }

    let journeesCloturees = 0
    const journeesOuvertes = await ctx.db
      .query("accountingDays")
      .withIndex("by_status", (q) => q.eq("status", "ouverte"))
      .take(100)
    for (const day of journeesOuvertes) {
      if (day.date >= today) continue
      const sessions = await ctx.db
        .query("cashSessions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .collect()
      const bloquee = sessions.some(
        (s) => s.status === "ouverte" || ((s.varianceXaf ?? 0) !== 0 && !s.varianceReason?.trim())
      )
      if (bloquee) continue
      await ctx.db.patch(day._id, { status: "cloturee", closedAt: now, exportStatus: "en_attente" })
      await ctx.scheduler.runAfter(0, internal.functions.rollup.rollupAccountingDay, { accountingDayId: day._id })
      await audit(ctx, {
        action: "journee.cloturer",
        entityTable: "accountingDays",
        entityId: day._id,
        reason: "Amorçage de démonstration",
        after: { date: day.date, sessions: sessions.length },
      })
      journeesCloturees += 1
    }

    const nombreJournaux = Math.min(Math.max(Math.trunc(args.journees ?? 8), 1), 30)
    const candidates = (
      await ctx.db
        .query("accountingDays")
        .withIndex("by_status", (q) => q.eq("status", "cloturee"))
        .collect()
    )
      .filter((d) => d.journalEntryCount === undefined && d.exportStatus !== "integre")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, nombreJournaux)
    for (const [index, day] of candidates.entries()) {
      await ctx.scheduler.runAfter(index * 500, internal.functions.pilotage.amorcerJourneeDemo, {
        accountingDayId: day._id,
        mode: index === 0 ? "en_file" : index === 1 ? "rejet" : "integre",
      })
    }

    const derniere = (
      await ctx.db
        .query("dailyMetrics")
        .withIndex("by_date")
        .order("desc")
        .first()
    )?.date
    const rapports: Id<"reportRuns">[] = []
    if (derniere) {
      for (const reportType of ["ventes", "etat_caisse", "remboursements"] as const) {
        rapports.push(
          await inscrireExecution(ctx, {
            reportType,
            from: addDays(derniere, -6),
            to: derniere,
            filters: {},
            trigger: "demande",
          })
        )
      }
    }

    return {
      caissesCloses,
      journeesCloturees,
      journauxPlanifies: candidates.map((d) => d.date),
      rapports: rapports.length,
    }
  },
})

/** Journal et déversement simulé d'une journée de démonstration. */
export const amorcerJourneeDemo = internalMutation({
  args: {
    accountingDayId: v.id("accountingDays"),
    mode: v.union(v.literal("en_file"), v.literal("rejet"), v.literal("integre")),
  },
  handler: async (ctx, args) => {
    exigerDemo()
    const day = await ctx.db.get(args.accountingDayId)
    if (!day || day.journalEntryCount !== undefined) return { done: false }
    const nonVisees = (
      await ctx.db
        .query("cashSessions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .collect()
    ).filter((s) => s.status === "cloturee" && (s.varianceXaf ?? 0) !== 0)
    // Une journée aux écarts non visés reste pour la démonstration du visa.
    if (nonVisees.length > 0) return { done: false, reason: "écarts à viser" }
    const journal = await engendrerJournal(ctx, { accountingDayId: day._id }, undefined)
    if (args.mode === "en_file") return { done: true, entries: journal.entries }
    if (args.mode === "rejet") {
      const pieces = (
        await ctx.db
          .query("journalEntries")
          .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
          .take(50)
      )
        .filter((e) => e.ttc > 0)
        .slice(0, 2)
      // Agence de Port-Gentil, suspendue et retirée du référentiel : son
      // centre de coût n'existe plus côté SAGE.
      for (const e of pieces) await ctx.db.patch(e._id, { costCenter: "CC-AG-POG" })
    }
    const resultat = await transmettre(ctx, (await ctx.db.get(day._id))!, undefined)
    return { done: true, ...resultat }
  },
})
