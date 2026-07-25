import { internalMutation } from "../_generated/server"

/**
 * Réservations dont le blocage de places a expiré sans paiement :
 * les places sont restituées et les billets invalidés.
 */
export const expireStaleBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()

    const stale = await ctx.db
      .query("bookings")
      .withIndex("by_hold_expiry", (q) =>
        q.eq("status", "en_attente_paiement").lt("holdExpiresAt", now)
      )
      .take(100)

    for (const booking of stale) {
      const trip = await ctx.db.get(booking.tripId)
      if (trip) {
        await ctx.db.patch(trip._id, {
          seatsAvailable: {
            ...trip.seatsAvailable,
            [booking.serviceClass]:
              trip.seatsAvailable[booking.serviceClass] + booking.passengerCount,
          },
        })
      }

      await ctx.db.patch(booking._id, {
        status: "expiree",
        holdExpiresAt: undefined,
      })

      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect()

      for (const ticket of tickets) {
        await ctx.db.patch(ticket._id, { status: "expire" })
      }
    }

    return { expired: stale.length }
  },
})

/** Passe en « terminé » les dessertes arrivées depuis plus d'une heure. */
export const closeCompletedTrips = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 3600_000

    const trips = await ctx.db
      .query("trips")
      .withIndex("by_departure", (q) => q.lt("departureAt", cutoff))
      .take(200)

    let closed = 0
    for (const trip of trips) {
      if (trip.status === "termine" || trip.status === "annule") continue
      if (trip.arrivalAt > cutoff) continue

      await ctx.db.patch(trip._id, { status: "termine" })
      closed++
    }

    return { closed }
  },
})
