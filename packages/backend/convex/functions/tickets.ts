import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { requireRole, requireUser } from "../lib/auth"

const CONTROL_ROLES = ["controleur", "chef_gare", "superviseur", "admin"] as const

/** Billets valides du voyageur connecté (portefeuille mobile). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    const results = []
    for (const booking of bookings) {
      if (booking.status !== "confirmee") continue

      const [trip, tickets] = await Promise.all([
        ctx.db.get(booking.tripId),
        ctx.db
          .query("tickets")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
      ])

      for (const ticket of tickets) {
        results.push({ ...ticket, trip, bookingReference: booking.reference })
      }
    }

    return results.sort(
      (a, b) => (a.trip?.departureAt ?? 0) - (b.trip?.departureAt ?? 0)
    )
  },
})

/**
 * Contrôle d'un billet par scan du QR code.
 * Chaque tentative est journalisée, y compris les échecs.
 */
export const scan = mutation({
  args: {
    qrPayload: v.string(),
    stationId: v.optional(v.id("stations")),
  },
  handler: async (ctx, { qrPayload, stationId }) => {
    const agent = await requireRole(ctx, CONTROL_ROLES)

    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_qrPayload", (q) => q.eq("qrPayload", qrPayload))
      .unique()

    if (!ticket) {
      return { result: "invalide" as const, ticket: null }
    }

    const trip = await ctx.db.get(ticket.tripId)
    const now = Date.now()

    let result:
      | "valide"
      | "deja_utilise"
      | "invalide"
      | "expire"
      | "mauvaise_desserte"

    if (ticket.status === "utilise") {
      result = "deja_utilise"
    } else if (ticket.status === "annule" || ticket.status === "rembourse") {
      result = "invalide"
    } else if (ticket.status !== "valide") {
      result = "expire"
    } else if (!trip || trip.status === "annule") {
      result = "mauvaise_desserte"
    } else if (trip.arrivalAt < now) {
      result = "expire"
    } else {
      result = "valide"
      await ctx.db.patch(ticket._id, { status: "utilise", usedAt: now })
    }

    await ctx.db.insert("ticketScans", {
      ticketId: ticket._id,
      tripId: ticket.tripId,
      agentId: agent._id,
      stationId,
      result,
      scannedAt: now,
    })

    return { result, ticket: { ...ticket, trip } }
  },
})

/** Manifeste passagers d'une desserte — contrôleurs et chefs de gare. */
export const manifest = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireRole(ctx, CONTROL_ROLES)

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_trip_status", (q) => q.eq("tripId", tripId))
      .collect()

    return {
      total: tickets.length,
      valides: tickets.filter((t) => t.status === "valide").length,
      embarques: tickets.filter((t) => t.status === "utilise").length,
      tickets,
    }
  },
})
