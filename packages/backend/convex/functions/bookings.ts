import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { audit, requireAgent, requireUser } from "../lib/auth"
import { serviceClass } from "../schema"

const SEAT_HOLD_DURATION_MS = 15 * 60 * 1000
const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000

const CLASS_MULTIPLIER = {
  economique: 1,
  confort: 1.5,
  vip: 2.25,
} as const

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateReference(prefix: string, length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (const byte of bytes) {
    out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  }
  return `${prefix}-${out}`
}

function seatPrice(base: number, cls: keyof typeof CLASS_MULTIPLIER): number {
  return Math.round((base * CLASS_MULTIPLIER[cls]) / 100) * 100
}

const passengerValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  birthDate: v.optional(v.string()),
  document: v.optional(
    v.object({
      type: v.union(
        v.literal("cni"),
        v.literal("passeport"),
        v.literal("carte_sejour")
      ),
      number: v.string(),
    })
  ),
  phone: v.optional(v.string()),
})

/**
 * Crée une réservation et bloque les places pendant 15 minutes.
 *
 * Les mutations Convex étant transactionnelles et sérialisables, le
 * décrément de `seatsAvailable` ne peut pas produire de survente.
 */
export const create = mutation({
  args: {
    tripId: v.id("trips"),
    serviceClass: serviceClass,
    passengers: v.array(passengerValidator),
    contactPhone: v.string(),
    contactEmail: v.optional(v.string()),
    /** Réservation émise au guichet pour un tiers. */
    onBehalfOfUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const isCounterSale = args.onBehalfOfUserId !== undefined

    if (isCounterSale) await requireAgent(ctx)
    if (args.passengers.length < 1 || args.passengers.length > 9) {
      throw new Error("Entre 1 et 9 passagers par réservation")
    }

    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")
    if (trip.status === "annule" || trip.status === "termine") {
      throw new Error("Cette desserte n'est plus commercialisée")
    }
    if (trip.departureAt <= Date.now()) {
      throw new Error("Cette desserte est déjà partie")
    }

    const count = args.passengers.length
    const available = trip.seatsAvailable[args.serviceClass]
    if (available < count) {
      throw new Error(
        `Places insuffisantes : ${available} disponible(s) en ${args.serviceClass}`
      )
    }

    // Blocage transactionnel des places.
    await ctx.db.patch(args.tripId, {
      seatsAvailable: {
        ...trip.seatsAvailable,
        [args.serviceClass]: available - count,
      },
    })

    const totalXaf = seatPrice(trip.basePriceXaf, args.serviceClass) * count

    const bookingId = await ctx.db.insert("bookings", {
      reference: generateReference("SET"),
      userId: args.onBehalfOfUserId ?? user._id,
      issuedByAgentId: isCounterSale ? user._id : undefined,
      tripId: args.tripId,
      serviceClass: args.serviceClass,
      status: "en_attente_paiement",
      passengerCount: count,
      totalXaf,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
      holdExpiresAt: Date.now() + SEAT_HOLD_DURATION_MS,
    })

    // Les billets sont créés dès la réservation, à l'état « valide » une fois
    // le paiement confirmé (cf. `confirmPayment`).
    for (const passenger of args.passengers) {
      const reference = generateReference("BIL", 8)
      await ctx.db.insert("tickets", {
        bookingId,
        tripId: args.tripId,
        reference,
        passenger,
        serviceClass: args.serviceClass,
        status: "expire", // activé au paiement
        qrPayload: reference,
      })
    }

    return { bookingId, totalXaf }
  },
})

/** Confirme le paiement, active les billets et clôt la réservation. */
export const confirmPayment = mutation({
  args: {
    bookingId: v.id("bookings"),
    paymentId: v.id("payments"),
  },
  handler: async (ctx, { bookingId, paymentId }) => {
    const booking = await ctx.db.get(bookingId)
    if (!booking) throw new Error("Réservation introuvable")
    if (booking.status === "confirmee") return bookingId

    const payment = await ctx.db.get(paymentId)
    if (!payment || payment.bookingId !== bookingId) {
      throw new Error("Paiement non rattaché à cette réservation")
    }
    if (payment.status !== "reussi") {
      throw new Error("Paiement non abouti")
    }
    if (payment.amountXaf < booking.totalXaf) {
      throw new Error("Montant réglé insuffisant")
    }

    await ctx.db.patch(bookingId, {
      status: "confirmee",
      holdExpiresAt: undefined,
    })

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect()

    for (const ticket of tickets) {
      await ctx.db.patch(ticket._id, { status: "valide" })
    }

    return bookingId
  },
})

/** Réservations du voyageur connecté. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect()

    return Promise.all(
      bookings.map(async (booking) => ({
        ...booking,
        trip: await ctx.db.get(booking.tripId),
      }))
    )
  },
})

export const getByReference = query({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const user = await requireUser(ctx)

    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique()

    if (!booking) return null

    const isOwner = booking.userId === user._id
    const isAgent = user.role !== "voyageur"
    if (!isOwner && !isAgent) throw new Error("Accès refusé")

    const [trip, tickets] = await Promise.all([
      ctx.db.get(booking.tripId),
      ctx.db
        .query("tickets")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect(),
    ])

    return { ...booking, trip, tickets }
  },
})

/** Annule une réservation et restitue les places. */
export const cancel = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const user = await requireUser(ctx)
    const booking = await ctx.db.get(bookingId)
    if (!booking) throw new Error("Réservation introuvable")

    const isOwner = booking.userId === user._id
    const isAgent = user.role !== "voyageur"
    if (!isOwner && !isAgent) throw new Error("Accès refusé")

    if (booking.status === "annulee" || booking.status === "remboursee") {
      return
    }

    const trip = await ctx.db.get(booking.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    if (!isAgent && trip.departureAt - Date.now() < CANCELLATION_CUTOFF_MS) {
      throw new Error(
        "Annulation impossible à moins de 2 heures du départ — présentez-vous au guichet"
      )
    }

    await releaseSeats(ctx, booking, trip)
    await ctx.db.patch(bookingId, {
      status: "annulee",
      cancelledAt: Date.now(),
      holdExpiresAt: undefined,
    })

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect()

    for (const ticket of tickets) {
      await ctx.db.patch(ticket._id, { status: "annule" })
    }

    await audit(ctx, {
      actorId: user._id,
      action: "booking.cancel",
      entityTable: "bookings",
      entityId: bookingId,
    })
  },
})

/** Restitue les places d'une réservation à l'inventaire de la desserte. */
async function releaseSeats(
  ctx: { db: { patch: (id: Id<"trips">, patch: object) => Promise<void> } },
  booking: Doc<"bookings">,
  trip: Doc<"trips">
) {
  await ctx.db.patch(trip._id, {
    seatsAvailable: {
      ...trip.seatsAvailable,
      [booking.serviceClass]:
        trip.seatsAvailable[booking.serviceClass] + booking.passengerCount,
    },
  })
}
