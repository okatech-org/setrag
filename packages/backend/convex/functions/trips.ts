import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { audit, requireRole } from "../lib/auth"
import { serviceClass, tripStatus } from "../schema"

const CLASS_MULTIPLIER = {
  economique: 1,
  confort: 1.5,
  vip: 2.25,
} as const

function seatPrice(base: number, cls: keyof typeof CLASS_MULTIPLIER): number {
  return Math.round((base * CLASS_MULTIPLIER[cls]) / 100) * 100
}

/** Recherche de dessertes sur une journée donnée. */
export const search = query({
  args: {
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    /** Début de la journée recherchée (ms epoch, fuseau Africa/Libreville). */
    dayStart: v.number(),
    passengers: v.optional(v.number()),
    serviceClass: v.optional(serviceClass),
  },
  handler: async (ctx, args) => {
    const dayEnd = args.dayStart + 24 * 3600_000
    const seatsNeeded = args.passengers ?? 1

    const trips = await ctx.db
      .query("trips")
      .withIndex("by_route_departure", (q) =>
        q
          .eq("originStationId", args.originStationId)
          .eq("destinationStationId", args.destinationStationId)
          .gte("departureAt", args.dayStart)
          .lt("departureAt", dayEnd)
      )
      .collect()

    const classes = args.serviceClass
      ? [args.serviceClass]
      : (["economique", "confort", "vip"] as const)

    return trips
      .filter((t) => t.status !== "annule" && t.status !== "termine")
      .map((trip) => ({
        ...trip,
        availability: classes
          .map((cls) => ({
            serviceClass: cls,
            seatsAvailable: trip.seatsAvailable[cls],
            priceXaf: seatPrice(trip.basePriceXaf, cls),
          }))
          .filter((a) => a.seatsAvailable >= seatsNeeded),
      }))
      .filter((t) => t.availability.length > 0)
  },
})

export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get(tripId)
    if (!trip) return null

    const [origin, destination, stops] = await Promise.all([
      ctx.db.get(trip.originStationId),
      ctx.db.get(trip.destinationStationId),
      ctx.db
        .query("tripStops")
        .withIndex("by_trip", (q) => q.eq("tripId", tripId))
        .collect(),
    ])

    return { ...trip, origin, destination, stops }
  },
})

/** Dessertes du jour — tableau de bord agent. */
export const listUpcoming = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    await requireRole(ctx, [
      "agent_guichet",
      "controleur",
      "chef_gare",
      "superviseur",
      "admin",
    ])

    return ctx.db
      .query("trips")
      .withIndex("by_departure", (q) =>
        q.gte("departureAt", from).lte("departureAt", to)
      )
      .collect()
  },
})

export const setStatus = mutation({
  args: {
    tripId: v.id("trips"),
    status: tripStatus,
    delayMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { tripId, status, delayMinutes }) => {
    const actor = await requireRole(ctx, ["chef_gare", "superviseur", "admin"])

    await ctx.db.patch(tripId, { status, delayMinutes })
    await audit(ctx, {
      actorId: actor._id,
      action: "trip.setStatus",
      entityTable: "trips",
      entityId: tripId,
      metadata: { status, delayMinutes },
    })
  },
})
