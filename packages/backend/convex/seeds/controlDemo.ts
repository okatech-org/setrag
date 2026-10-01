import { internalMutation } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { performCounterSale } from "../functions/sales"
import { toServiceDate } from "../model/calendar"

/**
 * Tournée de démonstration du contrôleur.
 *
 * Provisionne ce qu'un contrôleur trouve en montant à bord : une desserte du
 * jour avec des voyageurs, une caisse ouverte, une partie de la voiture déjà
 * contrôlée, un procès-verbal, un incident — et un conflit à arbitrer, parce
 * que c'est l'écran qu'on ne peut pas montrer sans deux terminaux.
 *
 * Idempotent : relancer met à jour sans dupliquer. Les écritures portent des
 * identifiants client préfixés `demo-controle-`, ce qui les rend
 * reconnaissables et rejouables comme celles du terrain.
 *
 *   bunx convex run seeds/controlDemo:provision
 */
export const provision = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error(
        "Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true."
      )
    }

    const email = process.env.DEMO_CONTROL_EMAIL?.trim().toLowerCase()
    if (!email) throw new Error("DEMO_CONTROL_EMAIL est absent.")

    const agent = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique()
    if (!agent) throw new Error(`Compte applicatif introuvable : ${email}`)
    if (agent.role !== "controleur_train") {
      throw new Error(`Le compte ${email} n'est pas un compte de contrôle.`)
    }
    if (!agent.pointOfSaleId) {
      throw new Error(
        `Le compte ${email} n'est rattaché à aucun point de vente : la vente ` +
          `à bord et l'encaissement des amendes lui seraient refusés.`
      )
    }

    const trip = await nextOpenTrip(ctx)
    if (!trip) throw new Error("Aucune desserte future ouverte à la vente.")

    const stops = (
      await ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
        .collect()
    ).sort((a, b) => a.sequence - b.sequence)
    if (stops.length < 3) {
      throw new Error("La desserte retenue compte moins de trois arrêts.")
    }

    const session = await openCashSession(ctx, agent)
    const tickets = await ensureTickets(ctx, agent, trip, stops)
    const scans = await ensureScans(ctx, agent, trip, tickets)
    const conflict = await ensureConflict(ctx, agent, trip, tickets)
    const penalty = await ensurePenalty(ctx, agent, trip)
    const incident = await ensureIncident(ctx, agent, trip)

    return {
      email,
      trip: trip.trainNumber,
      serviceDate: trip.serviceDate,
      cashSessionId: session._id,
      tickets: tickets.length,
      scans,
      conflict,
      penalty,
      incident,
    }
  },
})

/** Prochaine desserte ouverte à la vente — le terrain de la démonstration. */
async function nextOpenTrip(ctx: MutationCtx): Promise<Doc<"trips"> | null> {
  const trips = (await ctx.db.query("trips").collect())
    .filter(
      (trip) =>
        trip.isOpenForSale &&
        trip.status === "planifie" &&
        trip.departureAt > Date.now()
    )
    .sort((a, b) => a.departureAt - b.departureAt)
  return trips[0] ?? null
}

/**
 * Caisse embarquée du contrôleur.
 *
 * Sans elle, la vente à bord et l'encaissement des amendes sont refusés par le
 * cœur transactionnel : la démonstration s'arrêterait au premier voyageur à
 * régulariser.
 */
async function openCashSession(
  ctx: MutationCtx,
  agent: Doc<"users">
): Promise<Doc<"cashSessions">> {
  const existing = await ctx.db
    .query("cashSessions")
    .withIndex("by_seller", (q) => q.eq("sellerId", agent._id))
    .filter((q) => q.eq(q.field("status"), "ouverte"))
    .first()
  if (existing) return existing

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
    sellerId: agent._id,
    pointOfSaleId: agent.pointOfSaleId!,
    accountingDayId: day._id,
    openedAt: Date.now() - 2 * 60 * 60 * 1000,
    openingFloatXaf: 25_000,
    expectedByMethod: [],
    status: "ouverte",
  })
  return (await ctx.db.get(id))!
}

/** Voyageurs de la voiture, tels qu'ils figureront au manifeste embarqué. */
const PASSAGERS = [
  ["Paul", "MBADINGA", "M"],
  ["Alice", "KOUMBA", "F"],
  ["Jean", "OBAME", "M"],
  ["Antoinette", "NZE", "F"],
  ["Sylvain", "NDONG", "M"],
  ["Édith", "MOUSSAVOU", "F"],
] as const

/**
 * Marqueur d'une vente de démonstration : la desserte et le rang du voyageur.
 *
 * Porté par `clientSaleId`, la clé d'idempotence des ventes du terrain, et
 * retrouvé par son index : une relance sait exactement ce qu'elle a déjà
 * vendu, sans rien supposer des titres (la vente ne leur attribue pas de
 * voiture, par exemple). La desserte en fait partie, car la démonstration
 * change de circulation d'un jour à l'autre.
 */
function demoSaleId(tripId: Id<"trips">, rang: number): string {
  return `demo-controle-vente-${tripId}-${rang}`
}

/**
 * Titres à contrôler.
 *
 * Vendus par le chemin ordinaire du guichet : le manifeste embarqué doit
 * contenir des billets réellement signés, sinon la vérification hors ligne du
 * terminal n'aurait rien d'authentique à vérifier.
 *
 * Chaque voyageur n'est vendu qu'une fois : une relance retrouve sa vente par
 * son marqueur et ne vend que les manquants.
 */
async function ensureTickets(
  ctx: MutationCtx,
  agent: Doc<"users">,
  trip: Doc<"trips">,
  stops: Doc<"tripStops">[]
): Promise<Doc<"tickets">[]> {
  const terminus = stops[stops.length - 1]!
  const intermediaire = stops[Math.floor(stops.length / 2)]!
  const titres: Doc<"tickets">[] = []

  for (const [index, passager] of PASSAGERS.entries()) {
    const clientSaleId = demoSaleId(trip._id, index)
    const dejaVendue = await ctx.db
      .query("sales")
      .withIndex("by_client_id", (q) => q.eq("clientSaleId", clientSaleId))
      .unique()

    if (!dejaVendue) {
      const [firstName, lastName, gender] = passager
      // Un voyageur sur trois descend en route : c'est ce qui rend le verdict
      // « hors segment » démontrable une fois la desserte engagée.
      const destination = index % 3 === 2 ? intermediaire : terminus
      await performCounterSale(ctx, agent, {
        tripId: trip._id,
        originStationId: stops[0]!.stationId,
        destinationStationId: destination.stationId,
        serviceClass: "DEUXIEME",
        passengers: [
          {
            firstName,
            lastName,
            gender,
            phone: `+241 06 ${10 + index} ${20 + index} ${30 + index}`,
          },
        ],
        method: index % 2 === 0 ? "especes" : "airtel_money",
        deviceId: "demo-controle",
        clientSaleId,
      })
    }

    const vente =
      dejaVendue ??
      (await ctx.db
        .query("sales")
        .withIndex("by_client_id", (q) => q.eq("clientSaleId", clientSaleId))
        .unique())
    if (!vente) continue
    const titre = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", vente._id))
      .first()
    if (titre) titres.push(titre)
  }

  return titres
}

/**
 * Contrôles déjà effectués sur la première moitié de la voiture.
 *
 * La tournée doit paraître commencée : un écran d'historique vide ne montre
 * rien de ce que fait l'application.
 */
async function ensureScans(
  ctx: MutationCtx,
  agent: Doc<"users">,
  trip: Doc<"trips">,
  tickets: Doc<"tickets">[]
): Promise<number> {
  let created = 0
  const debut = Date.now() - 90 * 60 * 1000

  for (const [index, ticket] of tickets.slice(0, 3).entries()) {
    const clientScanId = `demo-controle-scan-${ticket.number}`
    const existant = await ctx.db
      .query("ticketScans")
      .withIndex("by_client_id", (q) => q.eq("clientScanId", clientScanId))
      .unique()
    if (existant) continue

    await ctx.db.insert("ticketScans", {
      ticketId: ticket._id,
      tripId: trip._id,
      agentId: agent._id,
      result: "valide",
      stopIndex: 0,
      scannedAt: debut + index * 4 * 60 * 1000,
      offline: true,
      clientScanId,
      syncedAt: Date.now(),
      conflict: false,
    })
    if (ticket.status === "valide") {
      await ctx.db.patch(ticket._id, {
        status: "utilise",
        usedAt: debut + index * 4 * 60 * 1000,
      })
    }
    created += 1
  }
  return created
}

/**
 * Un titre contrôlé sur deux terminaux — l'écran d'arbitrage, en somme.
 *
 * C'est le seul état qu'on ne peut pas produire en manipulant l'application :
 * il faut un second contrôleur. On le fabrique donc ici, avec un écart de
 * deux minutes entre les deux passages : assez court pour que la lecture
 * assistée le signale comme suspect.
 */
async function ensureConflict(
  ctx: MutationCtx,
  agent: Doc<"users">,
  trip: Doc<"trips">,
  tickets: Doc<"tickets">[]
): Promise<boolean> {
  const ticket = tickets[0]
  if (!ticket) return false

  const clientScanId = `demo-controle-conflit-${ticket.number}`
  const existant = await ctx.db
    .query("ticketScans")
    .withIndex("by_client_id", (q) => q.eq("clientScanId", clientScanId))
    .unique()
  if (existant) return true

  const autre = await autreControleur(ctx, agent)
  if (!autre) return false

  await ctx.db.insert("ticketScans", {
    ticketId: ticket._id,
    tripId: trip._id,
    agentId: autre._id,
    result: "valide",
    stopIndex: 1,
    scannedAt: Date.now() - 88 * 60 * 1000,
    offline: true,
    clientScanId,
    syncedAt: Date.now(),
    conflict: true,
  })
  return true
}

/** Second contrôleur du réseau, à défaut de quoi aucun conflit n'est possible. */
async function autreControleur(
  ctx: MutationCtx,
  agent: Doc<"users">
): Promise<Doc<"users"> | null> {
  const controleurs = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "controleur_train"))
    .collect()
  return controleurs.find((c) => c._id !== agent._id) ?? null
}

/** Procès-verbal déjà dressé, réglé à bord. */
async function ensurePenalty(
  ctx: MutationCtx,
  agent: Doc<"users">,
  trip: Doc<"trips">
): Promise<string | null> {
  const clientId = "demo-controle-pv-1"
  const existant = await ctx.db
    .query("procesVerbaux")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique()
  if (existant) return existant.number

  const seq = await nextSequence(ctx, "reseau:pv")
  const number = `PV-${String(seq).padStart(6, "0")}`
  const issuedAt = Date.now() - 45 * 60 * 1000

  const id = await ctx.db.insert("procesVerbaux", {
    number,
    agentId: agent._id,
    tripId: trip._id,
    offender: {
      lastName: "NGUEMA",
      firstName: "Serge",
      documentNumber: "CNI 04-889-231",
      declined: false,
    },
    reason: "sans_titre",
    notes: "Monté à Ndjolé sans titre de transport.",
    amountXaf: 25_000,
    status: "paye",
    issuedAt,
    offline: true,
    clientId,
  })
  const paymentId = await ctx.db.insert("payments", {
    penaltyId: id,
    method: "especes",
    status: "confirme",
    amountXaf: 25_000,
    settledAt: issuedAt,
  })
  await ctx.db.patch(id, { paymentId })
  return number
}

/** Incident signalé en cours de tournée, encore ouvert. */
async function ensureIncident(
  ctx: MutationCtx,
  agent: Doc<"users">,
  trip: Doc<"trips">
): Promise<boolean> {
  const clientId = "demo-controle-incident-1"
  const existant = await ctx.db
    .query("incidents")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique()
  if (existant) return true

  await ctx.db.insert("incidents", {
    reporterId: agent._id,
    tripId: trip._id,
    category: "technique",
    severity: "important",
    description:
      "Porte de la voiture 3 bloquée en position ouverte depuis Booué. " +
      "Voyageurs écartés de la zone.",
    photoStorageIds: [],
    status: "ouvert",
    reportedAt: Date.now() - 60 * 60 * 1000,
    offline: true,
    clientId,
  })
  return true
}

/** Numérotation continue, partagée avec les procès-verbaux du terrain. */
async function nextSequence(ctx: MutationCtx, key: string): Promise<number> {
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

/** Réservé pour un usage futur : identifiants typés des tables touchées. */
export type ControlDemoIds = {
  trip: Id<"trips">
  session: Id<"cashSessions">
}
