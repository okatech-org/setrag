import { v } from "convex/values"
import { mutation, query, type QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import {
  emptyIncidentSummary,
  emptyPenaltySummary,
  servicePeriodBounds,
  summarizeIncidents,
  summarizePenalties,
} from "../model/controlSummary"
import { assertCan } from "../modules/platform/model"
import { scanResult, serviceClass } from "../schema"
import { performSale } from "./sales"
import { segmentMask } from "../model/inventory"
import { verifyScope, type ScopeVerdict } from "../model/barcode"
import {
  CURRENT_KEY_VERSION,
  isUsingDemoKey,
  publicKeyHex,
  verifyBarcode,
} from "../lib/signature"

/**
 * Application contrôleur — contrôle à bord, régularisation et signalements.
 *
 * Toutes les écritures venant du terrain sont IDEMPOTENTES par identifiant
 * client : le terminal travaille hors ligne, accumule ses opérations dans une
 * file locale, et rejoue tout le lot à la reconnexion. Un lot renvoyé deux
 * fois après une coupure ne doit rien dupliquer.
 */

/* ──────────────────────── Manifeste embarqué ───────────────────────────── */

/**
 * Manifeste d'une desserte, à télécharger avant le départ.
 *
 * C'est le paquet que le terminal emporte : tous les titres valides, la liste
 * des arrêts et le barème des amendes. Une fois chargé, le contrôle
 * fonctionne sans réseau.
 */
export const manifest = query({
  args: {
    tripId: v.id("trips"),
    /**
     * Faux quand le terminal télécharge les titres par lots via
     * `manifestTickets` : l'en-tête arrive alors seul, et l'agent voit
     * immédiatement ce qu'il embarque pendant que les lots défilent.
     */
    includeTickets: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "controles", "consulter")
    const withTickets = args.includeTickets ?? true

    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const stops = (
      await ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).sort((a, b) => a.sequence - b.sequence)

    const stations = await Promise.all(
      stops.map(async (s) => {
        const station = await ctx.db.get(s.stationId)
        return {
          sequence: s.sequence,
          stationId: s.stationId,
          code: station?.code ?? "?",
          name: station?.name ?? "?",
          kilometerPoint: s.kilometerPoint,
          arrivalAt: s.arrivalAt,
          departureAt: s.departureAt,
        }
      })
    )

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .collect()

    // Seuls les titres opposables partent sur le terminal : un billet annulé
    // ou remboursé doit être refusé à bord, il est donc transmis avec son
    // statut plutôt qu'omis.
    const embarquables = tickets.filter((t) => EMBARQUABLES.includes(t.status))

    const scans = await ctx.db
      .query("ticketScans")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .collect()

    const voitures = withTickets
      ? await coachLabelsOf(ctx, embarquables)
      : new Map<Id<"tickets">, string>()

    return {
      trip,
      stops: stations,
      tickets: withTickets
        ? embarquables.map((t) => embarkTicket(t, voitures.get(t._id)))
        : [],
      /**
       * Composition du train : voitures dans l'ordre de la rame, avec leur
       * plan de places. Le terminal en tire la progression par voiture et le
       * plan d'une voiture ; sans elle, il ne connaîtrait que les voitures
       * où un titre a été vendu.
       */
      composition: await embarkComposition(ctx, trip.trainId),
      /** Nombre total de titres à embarquer, connu avant tout téléchargement. */
      ticketCount: embarquables.length,
      subscriptions: await embarkSubscriptions(ctx, trip.departureAt),
      /**
       * Barème kilométrique en vigueur, embarqué pour que la régularisation
       * à bord calcule le même prix que le guichet, sans réseau.
       */
      fare: await embarkFareSchedule(ctx),
      alreadyScanned: scans.map((s) => ({
        ticketId: s.ticketId,
        scannedAt: s.scannedAt,
        result: s.result,
      })),
      generatedAt: Date.now(),
      /** Barème des amendes, embarqué pour la rédaction hors ligne. */
      penalties: PENALTY_SCALE,
      /**
       * Clé publique de vérification des codes-barres.
       *
       * C'est elle qui rend le contrôle hors ligne réellement sûr : sans
       * elle, le terminal ne pourrait que comparer le code présenté à la
       * liste embarquée, et accepterait donc n'importe quelle contrefaçon
       * recopiant un code légitime aperçu ailleurs. Avec elle, il établit
       * lui-même que le titre a bien été émis par SETRAG.
       */
      signing: {
        publicKey: publicKeyHex(),
        keyVersion: CURRENT_KEY_VERSION,
        /** Vrai si le déploiement tourne encore sur la clé du dépôt. */
        isDemoKey: isUsingDemoKey(),
      },
    }
  },
})

/** Statuts de titre qui doivent partir sur le terminal, refus compris. */
const EMBARQUABLES: readonly string[] = [
  "valide",
  "utilise",
  "annule",
  "rembourse",
]

/**
 * Projection d'un titre telle qu'elle voyage dans le manifeste.
 *
 * `coachLabel` n'est renseigné sur aucun titre vendu au guichet ou en ligne :
 * la vente attribue une place, pas une voiture. Le repère est donc lu sur la
 * voiture de la place quand le titre ne le porte pas (`coachLabelsOf`).
 */
function embarkTicket(t: Doc<"tickets">, coachLabel?: string) {
  return {
    _id: t._id,
    number: t.number,
    passenger: t.passenger,
    serviceClass: t.serviceClass,
    seatLabel: t.seatLabel,
    coachLabel: t.coachLabel ?? coachLabel,
    fromStopIndex: t.fromStopIndex,
    toStopIndex: t.toStopIndex,
    status: t.status,
    barcodePayload: t.barcodePayload,
  }
}

/**
 * Voiture de chaque titre, déduite de sa place.
 *
 * Lecture seule : le titre n'est pas réécrit. Une desserte n'a que quelques
 * voitures, d'où le cache par voiture — une place lue par titre, une voiture
 * lue une fois.
 */
async function coachLabelsOf(
  ctx: QueryCtx,
  tickets: Doc<"tickets">[]
): Promise<Map<Id<"tickets">, string>> {
  const parVoiture = new Map<Id<"coaches">, string | undefined>()
  const labels = new Map<Id<"tickets">, string>()
  for (const ticket of tickets) {
    if (ticket.coachLabel || !ticket.seatId) continue
    const seat = await ctx.db.get(ticket.seatId)
    if (!seat) continue
    if (!parVoiture.has(seat.coachId)) {
      parVoiture.set(seat.coachId, (await ctx.db.get(seat.coachId))?.label)
    }
    const label = parVoiture.get(seat.coachId)
    if (label) labels.set(ticket._id, label)
  }
  return labels
}

/**
 * Composition du train d'une desserte, dans l'ordre de la rame.
 *
 * Les places inactives sont omises : le plan les montre comme des vides, et
 * aucun titre ne peut y être assis.
 */
async function embarkComposition(ctx: QueryCtx, trainId: Id<"trains">) {
  const [coaches, seats] = await Promise.all([
    ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", trainId))
      .collect(),
    ctx.db
      .query("seats")
      .withIndex("by_train", (q) => q.eq("trainId", trainId))
      .collect(),
  ])
  return coaches
    .sort((a, b) => a.position - b.position)
    .map((coach) => ({
      label: coach.label,
      serviceClass: coach.serviceClass,
      position: coach.position,
      rowCount: coach.rowCount,
      columnCount: coach.columnCount,
      seatCount: coach.seatCount,
      standingCapacity: coach.standingCapacity,
      seats: seats
        .filter((s) => s.coachId === coach._id && s.isActive)
        .sort((a, b) => a.row - b.row || a.column - b.column)
        .map((s) => ({ label: s.label, row: s.row, column: s.column })),
    }))
}

/**
 * Abonnements opposables le jour de la desserte.
 *
 * Un abonné ne figure dans aucun manifeste de titres : sa carte vaut droit de
 * circuler. Sans cette liste, le terminal verrait une signature authentique
 * sans pouvoir dire à qui elle appartient ni jusqu'à quand elle court.
 */
async function embarkSubscriptions(ctx: QueryCtx, atMs: number) {
  const all = await ctx.db.query("subscriptions").collect()
  return all
    .filter(
      (s) =>
        s.status === "active" && s.validFrom <= atMs && s.validUntil >= atMs
    )
    .map((s) => ({
      _id: s._id,
      cardNumber: s.cardNumber,
      kind: s.kind,
      serviceClass: s.serviceClass,
      validFrom: s.validFrom,
      validUntil: s.validUntil,
      barcodePayload: s.barcodePayload,
    }))
}

/**
 * Barème kilométrique en vigueur, réduit à ce qu'un terminal doit connaître.
 *
 * Le contrôleur qui régularise à bord doit annoncer le prix du guichet. Le
 * barème part donc avec lui — taux au kilomètre, taxes et assiette d'arrondi
 * — plutôt qu'un tarif figé qui dériverait à la première révision.
 */
async function embarkFareSchedule(ctx: QueryCtx) {
  const schedule = await ctx.db
    .query("fareSchedules")
    .withIndex("by_status", (q) => q.eq("status", "actif"))
    .first()
  if (!schedule) return null

  const bases = await ctx.db
    .query("fareBases")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
    .collect()

  return {
    scheduleId: schedule._id,
    label: schedule.label,
    validFrom: schedule.validFrom,
    validUntil: schedule.validUntil,
    roundingBasis: schedule.roundingBasis,
    vatPct: schedule.vatPct,
    cssPct: schedule.cssPct,
    bases: bases.map((b) => ({
      trainType: b.trainType,
      serviceClass: b.serviceClass,
      shortDistanceRate: b.shortDistanceRate,
      longDistanceRate: b.longDistanceRate,
    })),
  }
}

/**
 * Titres d'une desserte, page par page.
 *
 * Le téléchargement se fait en gare, sur un réseau qui coupe : un lot perdu
 * ne doit pas condamner le paquet entier. Chaque page confirmée est écrite
 * localement, et la reprise repart du dernier curseur reçu.
 */
export const manifestTickets = query({
  args: {
    tripId: v.id("trips"),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "controles", "consulter")
    const numItems = Math.min(
      Math.max(Math.trunc(args.pageSize ?? 100), 1),
      500
    )

    const page = await ctx.db
      .query("tickets")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .paginate({ cursor: args.cursor ?? null, numItems })

    const embarquables = page.page.filter((t) =>
      EMBARQUABLES.includes(t.status)
    )
    const voitures = await coachLabelsOf(ctx, embarquables)

    return {
      tickets: embarquables.map((t) => embarkTicket(t, voitures.get(t._id))),
      cursor: page.continueCursor,
      isDone: page.isDone,
    }
  },
})

/**
 * Dessertes que le contrôleur peut prendre en charge.
 *
 * Aucune table n'affecte nominativement un agent à un train : la feuille de
 * route reste un document d'exploitation. On propose donc la fenêtre utile —
 * ce qui roule ou va rouler — et l'agent désigne la sienne.
 */
export const assignedTrips = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "controles", "consulter")
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 10), 1), 50)

    const now = Date.now()
    const HOUR = 60 * 60 * 1000
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_departure", (q) => q.gte("departureAt", now - 12 * HOUR))
      .order("asc")
      .take(limit * 3)

    const candidates = await Promise.all(
      trips
        .filter(
          (trip) =>
            trip.status !== "annule" && trip.departureAt <= now + 72 * HOUR
        )
        .map(async (trip) => {
          const [booklet, tickets] = await Promise.all([
            ctx.db.get(trip.bookletId),
            ctx.db
              .query("tickets")
              .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
              .collect(),
          ])
          return {
            trip,
            bookletActive: booklet?.status === "actif",
            ticketCount: tickets.filter((ticket) =>
              EMBARQUABLES.includes(ticket.status)
            ).length,
          }
        })
    )

    /**
     * Une circulation physique est définie par le train et son instant de
     * départ. Un rejeu du seed de démonstration a pu lui donner deux IDs de
     * desserte distincts, alors que le code-barres du billet porte un seul de
     * ces IDs. N'en présenter qu'un évite que le contrôleur embarque le
     * manifeste vide et refuse ensuite tous les vrais titres.
     */
    const byCirculation = new Map<string, (typeof candidates)[number]>()
    for (const candidate of candidates) {
      const key = `${candidate.trip.trainId}|${candidate.trip.departureAt}`
      const current = byCirculation.get(key)
      if (
        !current ||
        candidate.ticketCount > current.ticketCount ||
        (candidate.ticketCount === current.ticketCount &&
          candidate.bookletActive &&
          !current.bookletActive) ||
        (candidate.ticketCount === current.ticketCount &&
          candidate.bookletActive === current.bookletActive &&
          candidate.trip._creationTime > current.trip._creationTime)
      ) {
        byCirculation.set(key, candidate)
      }
    }

    const retenues = [...byCirculation.values()]
      .sort((left, right) => left.trip.departureAt - right.trip.departureAt)
      .slice(0, limit)

    return await Promise.all(
      retenues.map(async ({ trip, ticketCount }) => {
        const [origin, destination, stops] = await Promise.all([
          ctx.db.get(trip.originStationId),
          ctx.db.get(trip.destinationStationId),
          ctx.db
            .query("tripStops")
            .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
            .collect(),
        ])
        const pk = stops.map((s) => s.kilometerPoint)
        return {
          id: trip._id,
          trainNumber: trip.trainNumber,
          trainType: trip.trainType,
          serviceDate: trip.serviceDate,
          departureAt: trip.departureAt,
          arrivalAt: trip.arrivalAt,
          status: trip.status,
          origin: origin?.name ?? "?",
          destination: destination?.name ?? "?",
          stopCount: stops.length,
          distanceKm: pk.length > 0 ? Math.max(...pk) - Math.min(...pk) : 0,
          expectedPassengers: ticketCount,
        }
      })
    )
  },
})

/* ─────────────────────── Vérification d'un code-barres ─────────────────── */

/** Verdict complet rendu au terminal, motif de refus compris. */
export type TicketVerdict =
  | "valide"
  | "contrefait"
  | "illisible"
  | "cle_hors_service"
  | ScopeVerdict
  | "annule"
  | "rembourse"
  | "deja_controle"
  | "non_paye"
  | "inconnu"

/**
 * Vérifie un code-barres présenté au contrôle.
 *
 * Cette query est le recours EN LIGNE : hors réseau, le terminal fait la même
 * chose avec la clé publique et le manifeste. Elle sert quand le titre est
 * absent du manifeste — acheté après le téléchargement, ou sur une autre
 * desserte — et pour lever un doute.
 *
 * L'ordre des contrôles suit celui de leur utilité pour l'agent : d'abord
 * l'authenticité, qui distingue la fraude de l'erreur, puis la portée, puis
 * le statut administratif.
 */
export const verifyTicket = query({
  args: {
    barcode: v.string(),
    tripId: v.id("trips"),
    currentStopIndex: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "controles", "consulter")

    const check = verifyBarcode(args.barcode)
    if (!check.authentic || !check.payload) {
      // Trois échecs bien différents, qui n'appellent pas la même conduite :
      // un code étranger ou abîmé se represente ou se saisit à la main ; une
      // clé retirée du service est un problème d'exploitation, pas de
      // voyageur ; une signature fausse, elle, est une contrefaçon.
      const motif = check.error ?? ""
      const verdict: TicketVerdict = /hors service/.test(motif)
        ? "cle_hors_service"
        : /étranger|Base45|tronqué|CBOR|charge utile|Version de format/.test(
              motif
            )
          ? "illisible"
          : "contrefait"
      return { verdict, reason: check.error, ticket: null }
    }

    const payload = check.payload
    const scope = verifyScope(payload, {
      tripId: args.tripId,
      currentStopIndex: args.currentStopIndex,
      nowSeconds: Math.floor(Date.now() / 1000),
    })

    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_number", (q) => q.eq("number", payload.ref))
      .unique()

    const résumé = ticket
      ? {
          _id: ticket._id,
          number: ticket.number,
          passenger: ticket.passenger,
          serviceClass: ticket.serviceClass,
          seatLabel: ticket.seatLabel,
          coachLabel:
            ticket.coachLabel ??
            (await coachLabelsOf(ctx, [ticket])).get(ticket._id),
          fromStopIndex: ticket.fromStopIndex,
          toStopIndex: ticket.toStopIndex,
          status: ticket.status,
        }
      : null

    if (scope !== "valide") {
      return { verdict: scope as TicketVerdict, reason: null, ticket: résumé }
    }

    // Un code authentique dont le titre est introuvable trahit une base
    // désynchronisée, pas une fraude : la signature, elle, est bonne.
    if (!ticket) {
      return {
        verdict: "inconnu" as TicketVerdict,
        reason: `Titre ${payload.ref} absent de la base`,
        ticket: null,
      }
    }

    const parStatut: Partial<Record<string, TicketVerdict>> = {
      annule: "annule",
      rembourse: "rembourse",
      utilise: "deja_controle",
      en_attente: "non_paye",
    }
    const verdict = parStatut[ticket.status] ?? "valide"
    return { verdict, reason: null, ticket: résumé }
  },
})

/**
 * Barème des amendes.
 * Valeurs provisoires : le CDC prévoit la rédaction de procès-verbaux sans
 * fixer les montants. À arrêter par la direction commerciale.
 */
export const PENALTY_SCALE = [
  {
    reason: "sans_titre",
    label: "Voyage sans titre de transport",
    amountXaf: 25000,
  },
  {
    reason: "titre_invalide",
    label: "Titre invalide ou expiré",
    amountXaf: 15000,
  },
  {
    reason: "classe_superieure",
    label: "Classe supérieure à celle payée",
    amountXaf: 8000,
  },
  { reason: "autre", label: "Autre motif", amountXaf: 10000 },
] as const

/* ──────────────────────── Synchronisation des scans ────────────────────── */

/**
 * Remonte un lot de contrôles effectués à bord.
 *
 * Idempotent : un `clientScanId` déjà connu est ignoré. Un titre validé sur
 * deux terminaux différents est marqué en CONFLIT plutôt que rejeté — le
 * système ne peut pas distinguer une fraude d'un second contrôle légitime,
 * l'arbitrage est humain.
 */
export const syncScans = mutation({
  args: {
    scans: v.array(
      v.object({
        clientScanId: v.string(),
        tripId: v.id("trips"),
        ticketId: v.optional(v.id("tickets")),
        subscriptionId: v.optional(v.id("subscriptions")),
        result: scanResult,
        stopIndex: v.optional(v.number()),
        scannedAt: v.number(),
        offline: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "controles", "creer")

    let created = 0
    let duplicates = 0
    let conflicts = 0
    const conflictIds: Id<"ticketScans">[] = []

    for (const scan of args.scans) {
      const existing = await ctx.db
        .query("ticketScans")
        .withIndex("by_client_id", (q) =>
          q.eq("clientScanId", scan.clientScanId)
        )
        .unique()
      if (existing) {
        duplicates += 1
        continue
      }

      // Conflit : le même titre a déjà été validé par un autre terminal.
      let conflict = false
      if (scan.ticketId && scan.result === "valide") {
        const previous = await ctx.db
          .query("ticketScans")
          .withIndex("by_ticket", (q) => q.eq("ticketId", scan.ticketId))
          .collect()
        conflict = previous.some(
          (p) => p.result === "valide" && p.agentId !== actor._id
        )
      }

      const id = await ctx.db.insert("ticketScans", {
        ticketId: scan.ticketId,
        subscriptionId: scan.subscriptionId,
        tripId: scan.tripId,
        agentId: actor._id,
        result: scan.result,
        stopIndex: scan.stopIndex,
        scannedAt: scan.scannedAt,
        offline: scan.offline,
        clientScanId: scan.clientScanId,
        syncedAt: Date.now(),
        conflict,
      })
      created += 1
      if (conflict) {
        conflicts += 1
        conflictIds.push(id)
      }

      // Un contrôle valide marque le titre comme utilisé.
      if (scan.ticketId && scan.result === "valide" && !conflict) {
        const ticket = await ctx.db.get(scan.ticketId)
        if (ticket && ticket.status === "valide") {
          await ctx.db.patch(scan.ticketId, {
            status: "utilise",
            usedAt: scan.scannedAt,
          })
        }
      }
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "controle.synchroniser",
      entityTable: "ticketScans",
      entityId: "*",
      after: { received: args.scans.length, created, duplicates, conflicts },
    })

    return {
      received: args.scans.length,
      created,
      duplicates,
      conflicts,
      conflictIds,
    }
  },
})

/** Contrôles d'un agent, pour l'écran d'historique du terminal. */
export const myScans = query({
  args: { tripId: v.optional(v.id("trips")) },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "controles", "consulter")
    const scans = await ctx.db
      .query("ticketScans")
      .withIndex("by_agent", (q) => q.eq("agentId", actor._id))
      .collect()
    const filtered = args.tripId
      ? scans.filter((s) => s.tripId === args.tripId)
      : scans
    return filtered.sort((a, b) => b.scannedAt - a.scannedAt)
  },
})

/** Contrôles en conflit, à arbitrer par un superviseur. */
export const listConflicts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "controles", "consulter")
    const scans = await ctx.db
      .query("ticketScans")
      .withIndex("by_conflict", (q) => q.eq("conflict", true))
      .collect()

    return await Promise.all(
      scans.map(async (scan) => {
        const [ticket, agent, trip] = await Promise.all([
          scan.ticketId ? ctx.db.get(scan.ticketId) : null,
          ctx.db.get(scan.agentId),
          ctx.db.get(scan.tripId),
        ])
        const siblings = scan.ticketId
          ? await ctx.db
              .query("ticketScans")
              .withIndex("by_ticket", (q) => q.eq("ticketId", scan.ticketId))
              .collect()
          : []
        return { scan, ticket, agent, trip, allScans: siblings }
      })
    )
  },
})

/** Tranche un conflit : le contrôle est accepté ou signalé comme fraude. */
export const resolveConflict = mutation({
  args: {
    scanId: v.id("ticketScans"),
    accept: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "proces_verbaux", "modifier")
    const scan = await ctx.db.get(args.scanId)
    if (!scan) throw new Error("Contrôle introuvable")

    await ctx.db.patch(args.scanId, { conflict: false })
    await audit(ctx, {
      actorId: actor._id,
      action: "controle.arbitrer",
      entityTable: "ticketScans",
      entityId: args.scanId,
      after: { accept: args.accept, note: args.note },
    })
  },
})

/**
 * Transmet un conflit au chef de gare, sans y toucher.
 *
 * Le contrôleur constate le doublon depuis son terminal mais ne l'efface pas :
 * un contrôle enregistré est immuable, c'est la garantie que sa trace vaut
 * quelque chose. Il alerte, joint son observation, et l'arbitrage reste au
 * superviseur — qui, lui, peut clore le conflit.
 */
export const flagConflict = mutation({
  args: {
    scanId: v.id("ticketScans"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "controles", "creer")
    const scan = await ctx.db.get(args.scanId)
    if (!scan) throw new Error("Contrôle introuvable")
    if (!scan.conflict) throw new Error("Ce contrôle n'est pas en conflit")

    const ticket = scan.ticketId ? await ctx.db.get(scan.ticketId) : null
    const note = args.note?.trim()

    const superviseurs = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "chef_gare"))
      .collect()
    for (const chef of superviseurs) {
      await ctx.db.insert("notifications", {
        userId: chef._id,
        channel: "push",
        title: "Conflit de contrôle signalé",
        body: `Titre ${ticket?.number ?? "inconnu"} — ${
          note || "double contrôle à arbitrer"
        }`.slice(0, 200),
        data: JSON.stringify({ scanId: args.scanId }),
      })
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "controle.signaler",
      entityTable: "ticketScans",
      entityId: args.scanId,
      after: { note, notified: superviseurs.length },
    })

    return { notified: superviseurs.length }
  },
})

/* ─────────────────────────── Vente à bord ──────────────────────────────── */

/**
 * Vend un titre à bord, sans blocage préalable.
 *
 * Le contrôleur encaisse immédiatement : la vente est ferme dès l'écriture.
 * Elle emprunte le même chemin que la vente au guichet, donc la garantie
 * anti-survente s'applique aussi à bord.
 */
export const sellOnboard = mutation({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengers: v.array(
      v.object({
        lastName: v.string(),
        firstName: v.string(),
        gender: v.union(v.literal("M"), v.literal("F")),
        phone: v.optional(v.string()),
      })
    ),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    return await performSale(
      ctx,
      { actor, channel: "bord", mode: "ferme" },
      {
        tripId: args.tripId,
        originStationId: args.originStationId,
        destinationStationId: args.destinationStationId,
        serviceClass: args.serviceClass,
        passengers: args.passengers,
        method: "especes",
        deviceId: args.deviceId,
      }
    )
  },
})

/**
 * Remonte UNE vente encaissée à bord.
 *
 * Une vente par mutation, délibérément : une mutation Convex est une
 * transaction, et un refus au milieu d'un lot — desserte fermée, segment
 * complet — annulerait les ventes déjà passées du même envoi. Le terminal
 * boucle donc sur sa file, et chaque vente vit ou échoue seule.
 *
 * Idempotent par `clientSaleId` : le voyageur est déjà reparti avec son code,
 * une reprise après coupure ne doit pas lui vendre deux titres.
 *
 * Le prix est RECALCULÉ par le serveur ; le montant annoncé à bord revient
 * dans la réponse pour que tout écart apparaisse et se justifie en caisse.
 */
export const syncSale = mutation({
  args: {
    clientSaleId: v.string(),
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengers: v.array(
      v.object({
        lastName: v.string(),
        firstName: v.string(),
        gender: v.union(v.literal("M"), v.literal("F")),
        phone: v.optional(v.string()),
      })
    ),
    /** Montant calculé et encaissé à bord, avec le barème embarqué. */
    quotedXaf: v.number(),
    method: v.union(
      v.literal("especes"),
      v.literal("airtel_money"),
      v.literal("moov_money")
    ),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")

    const existing = await ctx.db
      .query("sales")
      .withIndex("by_client_id", (q) => q.eq("clientSaleId", args.clientSaleId))
      .unique()
    if (existing) {
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", existing._id))
        .collect()
      return {
        status: "doublon" as const,
        saleNumber: existing.number,
        ticketNumbers: tickets.map((t) => t.number),
        serverXaf: existing.amounts.ttc,
        quotedXaf: args.quotedXaf,
      }
    }

    const done = await performSale(
      ctx,
      { actor, channel: "bord", mode: "ferme" },
      {
        tripId: args.tripId,
        originStationId: args.originStationId,
        destinationStationId: args.destinationStationId,
        serviceClass: args.serviceClass,
        passengers: args.passengers,
        method: args.method,
        deviceId: args.deviceId,
        clientSaleId: args.clientSaleId,
      }
    )

    return {
      status: "cree" as const,
      saleNumber: done.number,
      ticketNumbers: done.tickets.map((t) => t.number),
      serverXaf: done.amounts.ttc,
      quotedXaf: args.quotedXaf,
    }
  },
})

/**
 * Jeton d'envoi d'une photo d'incident.
 *
 * Les photos partent avant leur incident : le stockage rend un identifiant
 * que la synchronisation joindra ensuite au signalement. Une photo orpheline
 * coûte moins qu'un incident amputé de sa preuve.
 */
export const incidentPhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "incidents", "creer")
    return await ctx.storage.generateUploadUrl()
  },
})

/* ────────────────────────── Procès-verbaux ─────────────────────────────── */

/** Dessertes récentes proposées dans le formulaire de procès-verbal. */
export const penaltyTripOptions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "proces_verbaux", "creer")
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 30), 1), 100)
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_departure")
      .order("desc")
      .take(limit)

    return await Promise.all(
      trips
        .filter((trip) => trip.status !== "annule")
        .map(async (trip) => {
          const [origin, destination] = await Promise.all([
            ctx.db.get(trip.originStationId),
            ctx.db.get(trip.destinationStationId),
          ])
          return {
            id: trip._id,
            trainNumber: trip.trainNumber,
            serviceDate: trip.serviceDate,
            departureAt: trip.departureAt,
            origin: origin?.name ?? "?",
            destination: destination?.name ?? "?",
          }
        })
    )
  },
})

/**
 * Remonte un lot de procès-verbaux rédigés à bord.
 * Idempotent par `clientId`, comme les contrôles.
 */
export const syncPenalties = mutation({
  args: {
    penalties: v.array(
      v.object({
        clientId: v.string(),
        tripId: v.id("trips"),
        ticketId: v.optional(v.id("tickets")),
        offender: v.object({
          lastName: v.optional(v.string()),
          firstName: v.optional(v.string()),
          documentNumber: v.optional(v.string()),
          phone: v.optional(v.string()),
          declined: v.boolean(),
        }),
        reason: v.union(
          v.literal("sans_titre"),
          v.literal("titre_invalide"),
          v.literal("classe_superieure"),
          v.literal("autre")
        ),
        notes: v.optional(v.string()),
        amountXaf: v.number(),
        paidOnBoard: v.boolean(),
        issuedAt: v.number(),
        offline: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "proces_verbaux", "creer")

    let created = 0
    let duplicates = 0
    const numbers: string[] = []

    for (const pv of args.penalties) {
      const existing = await ctx.db
        .query("procesVerbaux")
        .withIndex("by_client_id", (q) => q.eq("clientId", pv.clientId))
        .unique()
      if (existing) {
        duplicates += 1
        continue
      }
      if (pv.amountXaf < 0) {
        throw new Error(`Montant d'amende invalide : ${pv.amountXaf}`)
      }

      const seq = await nextPenaltyNumber(ctx)
      const number = `PV-${String(seq).padStart(6, "0")}`

      const id = await ctx.db.insert("procesVerbaux", {
        number,
        agentId: actor._id,
        tripId: pv.tripId,
        ticketId: pv.ticketId,
        offender: pv.offender,
        reason: pv.reason,
        notes: pv.notes,
        amountXaf: pv.amountXaf,
        status: pv.paidOnBoard ? "paye" : "emis",
        issuedAt: pv.issuedAt,
        offline: pv.offline,
        clientId: pv.clientId,
      })

      if (pv.paidOnBoard) {
        const paymentId = await ctx.db.insert("payments", {
          penaltyId: id,
          method: "especes",
          status: "confirme",
          amountXaf: pv.amountXaf,
          settledAt: pv.issuedAt,
        })
        await ctx.db.patch(id, { paymentId })
      }

      created += 1
      numbers.push(number)
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "pv.synchroniser",
      entityTable: "procesVerbaux",
      entityId: "*",
      after: { received: args.penalties.length, created, duplicates, numbers },
    })

    return { received: args.penalties.length, created, duplicates, numbers }
  },
})

/** Numérotation continue des procès-verbaux, à l'échelle du réseau. */
async function nextPenaltyNumber(
  ctx: Parameters<typeof audit>[0]
): Promise<number> {
  const key = "reseau:pv"
  const existing = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  if (existing) {
    const value = existing.value + 1
    await ctx.db.patch(existing._id, { value })
    return value
  }
  await ctx.db.insert("sequences", { key, value: 1 })
  return 1
}

/** Procès-verbaux, filtrables par statut pour l'écran de suivi. */
export const listPenalties = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("emis"),
        v.literal("paye"),
        v.literal("conteste"),
        v.literal("annule")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "proces_verbaux", "consulter")
    const all = args.status
      ? await ctx.db
          .query("procesVerbaux")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("procesVerbaux").collect()

    return await Promise.all(
      all
        .sort((a, b) => b.issuedAt - a.issuedAt)
        .map(async (pv) => ({
          penalty: pv,
          agent: await ctx.db.get(pv.agentId),
          trip: await ctx.db.get(pv.tripId),
        }))
    )
  },
})

/** Fiche complète d'un procès-verbal, bornée aux habilitations de gestion. */
export const getPenalty = query({
  args: { penaltyId: v.id("procesVerbaux") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "proces_verbaux", "consulter")
    const penalty = await ctx.db.get(args.penaltyId)
    if (!penalty) return null

    const [agent, trip, ticket, payment, resolver] = await Promise.all([
      ctx.db.get(penalty.agentId),
      ctx.db.get(penalty.tripId),
      penalty.ticketId ? ctx.db.get(penalty.ticketId) : null,
      penalty.paymentId ? ctx.db.get(penalty.paymentId) : null,
      penalty.resolvedBy ? ctx.db.get(penalty.resolvedBy) : null,
    ])
    return { penalty, agent, trip, ticket, payment, resolver }
  },
})

const PENALTY_TRANSITIONS = {
  emis: ["paye", "conteste", "annule"],
  conteste: ["emis", "paye", "annule"],
  paye: [],
  annule: [],
} as const

/** Conteste, annule ou solde un procès-verbal. */
export const setPenaltyStatus = mutation({
  args: {
    penaltyId: v.id("procesVerbaux"),
    status: v.union(
      v.literal("emis"),
      v.literal("paye"),
      v.literal("conteste"),
      v.literal("annule")
    ),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "proces_verbaux", "modifier")
    const pv = await ctx.db.get(args.penaltyId)
    if (!pv) throw new Error("Procès-verbal introuvable")
    const allowed = PENALTY_TRANSITIONS[pv.status] as readonly string[]
    if (!allowed.includes(args.status)) {
      throw new Error(
        `Transition de procès-verbal interdite : ${pv.status} → ${args.status}`
      )
    }
    const note = args.resolutionNote?.trim()
    if (!note) {
      throw new Error(
        "Un motif est obligatoire pour modifier le statut d'un procès-verbal"
      )
    }

    await ctx.db.patch(args.penaltyId, {
      status: args.status,
      resolvedBy: actor._id,
      resolutionNote: note || pv.resolutionNote,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "pv.statut",
      entityTable: "procesVerbaux",
      entityId: args.penaltyId,
      before: { status: pv.status },
      after: { status: args.status, note },
    })
  },
})

/* ──────────────────────────── Incidents ────────────────────────────────── */

/** Remonte un lot de signalements. Idempotent par `clientId`. */
export const syncIncidents = mutation({
  args: {
    incidents: v.array(
      v.object({
        clientId: v.string(),
        tripId: v.optional(v.id("trips")),
        stationId: v.optional(v.id("stations")),
        category: v.union(
          v.literal("securite"),
          v.literal("technique"),
          v.literal("comportement"),
          v.literal("medical"),
          v.literal("autre")
        ),
        severity: v.union(
          v.literal("information"),
          v.literal("important"),
          v.literal("critique")
        ),
        description: v.string(),
        photoStorageIds: v.optional(v.array(v.id("_storage"))),
        reportedAt: v.number(),
        offline: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "incidents", "creer")

    let created = 0
    let duplicates = 0
    let critical = 0

    for (const incident of args.incidents) {
      const existing = await ctx.db
        .query("incidents")
        .withIndex("by_client_id", (q) => q.eq("clientId", incident.clientId))
        .unique()
      if (existing) {
        duplicates += 1
        continue
      }
      if (!incident.description.trim()) {
        throw new Error("La description d'un incident est obligatoire")
      }

      const id = await ctx.db.insert("incidents", {
        reporterId: actor._id,
        tripId: incident.tripId,
        stationId: incident.stationId,
        category: incident.category,
        severity: incident.severity,
        description: incident.description,
        photoStorageIds: incident.photoStorageIds ?? [],
        status: "ouvert",
        reportedAt: incident.reportedAt,
        offline: incident.offline,
        clientId: incident.clientId,
      })
      created += 1

      // Un incident critique alerte immédiatement les superviseurs.
      if (incident.severity === "critique") {
        critical += 1
        const superviseurs = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "chef_gare"))
          .collect()
        for (const chef of superviseurs) {
          await ctx.db.insert("notifications", {
            userId: chef._id,
            channel: "push",
            title: "Incident critique signalé",
            body: incident.description.slice(0, 140),
            data: JSON.stringify({ incidentId: id }),
          })
        }
      }
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "incident.synchroniser",
      entityTable: "incidents",
      entityId: "*",
      after: { received: args.incidents.length, created, duplicates, critical },
    })

    return { received: args.incidents.length, created, duplicates, critical }
  },
})

/** Incidents, filtrables par statut. */
export const listIncidents = query({
  args: {
    status: v.optional(
      v.union(v.literal("ouvert"), v.literal("en_cours"), v.literal("resolu"))
    ),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "incidents", "consulter")
    const all = args.status
      ? await ctx.db
          .query("incidents")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("incidents").collect()

    return await Promise.all(
      all
        .sort((a, b) => b.reportedAt - a.reportedAt)
        .map(async (incident) => ({
          incident,
          reporter: await ctx.db.get(incident.reporterId),
          trip: incident.tripId ? await ctx.db.get(incident.tripId) : null,
        }))
    )
  },
})

/** Fiche complète d'un incident et de son contexte d'exploitation. */
export const getIncident = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "incidents", "consulter")
    const incident = await ctx.db.get(args.incidentId)
    if (!incident) return null

    const [reporter, trip, station, resolver, photoUrls] = await Promise.all([
      ctx.db.get(incident.reporterId),
      incident.tripId ? ctx.db.get(incident.tripId) : null,
      incident.stationId ? ctx.db.get(incident.stationId) : null,
      incident.resolvedBy ? ctx.db.get(incident.resolvedBy) : null,
      Promise.all(
        incident.photoStorageIds.map((storageId) =>
          ctx.storage.getUrl(storageId)
        )
      ),
    ])
    return {
      incident,
      reporter,
      trip,
      station,
      resolver,
      photoUrls: photoUrls.filter((url): url is string => Boolean(url)),
    }
  },
})

/* ─────────────────────── Synthèse agrégée réseau ──────────────────────── */

/** Plafond de lecture d'une synthèse ; au-delà, le résultat se déclare tronqué. */
const NETWORK_SUMMARY_READ_LIMIT = 5_000

/**
 * Synthèse agrégée et anonyme des incidents et procès-verbaux d'une période.
 *
 * Elle sert la lecture de pilotage sans ouvrir les registres nominatifs :
 * seuls des effectifs et des montants sortent, jamais une identité, une
 * description, une photo, une desserte ou une gare. La lecture du module
 * Sécurité suffit ; les registres restent gardés par leurs permissions fines
 * `incidents` et `proces_verbaux`. Une vue réseau exige une portée globale :
 * une affectation limitée à un site reçoit un résultat restreint, sans lecture.
 */
export const networkSummary = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await assertCan(ctx, {
      moduleCode: "securite",
      resource: "securite",
      permission: "consulter",
      allowScopedLanding: true,
    })
    const { start, endExclusive } = servicePeriodBounds(args.from, args.to)
    const base = {
      generatedAt: Date.now(),
      period: { from: args.from, to: args.to },
    }

    if (!access.hasGlobalScope) {
      return {
        ...base,
        scope: "restreint" as const,
        dataState: "restricted" as const,
        truncated: false,
        incidents: emptyIncidentSummary(),
        penalties: emptyPenaltySummary(),
      }
    }

    const [incidentRows, penaltyRows] = await Promise.all([
      ctx.db
        .query("incidents")
        .withIndex("by_reported_at", (q) =>
          q.gte("reportedAt", start).lt("reportedAt", endExclusive)
        )
        .take(NETWORK_SUMMARY_READ_LIMIT + 1),
      ctx.db
        .query("procesVerbaux")
        .withIndex("by_issued_at", (q) =>
          q.gte("issuedAt", start).lt("issuedAt", endExclusive)
        )
        .take(NETWORK_SUMMARY_READ_LIMIT + 1),
    ])
    const incidents = summarizeIncidents(
      incidentRows
        .slice(0, NETWORK_SUMMARY_READ_LIMIT)
        .map(({ category, severity, status }) => ({
          category,
          severity,
          status,
        }))
    )
    const penalties = summarizePenalties(
      penaltyRows
        .slice(0, NETWORK_SUMMARY_READ_LIMIT)
        .map(({ reason, status, amountXaf }) => ({ reason, status, amountXaf }))
    )

    return {
      ...base,
      scope: "reseau" as const,
      dataState:
        incidents.total + penalties.total === 0
          ? ("empty" as const)
          : ("operational" as const),
      truncated:
        incidentRows.length > NETWORK_SUMMARY_READ_LIMIT ||
        penaltyRows.length > NETWORK_SUMMARY_READ_LIMIT,
      incidents,
      penalties,
    }
  },
})

const INCIDENT_TRANSITIONS = {
  ouvert: ["en_cours", "resolu"],
  en_cours: ["resolu"],
  // Une résolution peut être réouverte si de nouveaux éléments apparaissent.
  resolu: ["en_cours"],
} as const

/** Fait progresser un incident jusqu'à sa résolution. */
export const setIncidentStatus = mutation({
  args: {
    incidentId: v.id("incidents"),
    status: v.union(
      v.literal("ouvert"),
      v.literal("en_cours"),
      v.literal("resolu")
    ),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "incidents", "modifier")
    const incident = await ctx.db.get(args.incidentId)
    if (!incident) throw new Error("Incident introuvable")
    const allowed = INCIDENT_TRANSITIONS[incident.status] as readonly string[]
    if (!allowed.includes(args.status)) {
      throw new Error(
        `Transition d'incident interdite : ${incident.status} → ${args.status}`
      )
    }
    const note = args.resolutionNote?.trim()
    if (args.status === "resolu" && !note) {
      throw new Error("Une note de résolution est obligatoire")
    }
    if (!note) {
      throw new Error(
        "Une note est obligatoire pour modifier le statut d'un incident"
      )
    }

    const reopening = incident.status === "resolu" && args.status === "en_cours"
    await ctx.db.patch(args.incidentId, {
      status: args.status,
      resolvedBy:
        args.status === "resolu"
          ? actor._id
          : reopening
            ? undefined
            : incident.resolvedBy,
      resolvedAt:
        args.status === "resolu"
          ? Date.now()
          : reopening
            ? undefined
            : incident.resolvedAt,
      // La raison de réouverture reste dans l'audit ; la fiche ne doit plus
      // afficher l'ancienne note comme si l'incident était encore résolu.
      resolutionNote: reopening ? undefined : note,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "incident.statut",
      entityTable: "incidents",
      entityId: args.incidentId,
      before: { status: incident.status },
      after: { status: args.status, note },
    })
  },
})
