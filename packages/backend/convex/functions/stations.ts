import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { audit, requireRole } from "../lib/auth"

/** Gares actives, ordonnées le long de la ligne (PK croissant). */
export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("stations")
      .withIndex("by_kilometerPoint")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect(),
})

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) =>
    ctx.db
      .query("stations")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique(),
})

export const upsert = mutation({
  args: {
    id: v.optional(v.id("stations")),
    code: v.string(),
    name: v.string(),
    province: v.string(),
    kilometerPoint: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async (ctx, { id, ...data }) => {
    const actor = await requireRole(ctx, ["admin", "superviseur"])

    if (id) {
      await ctx.db.patch(id, data)
      await audit(ctx, {
        actorId: actor._id,
        action: "station.update",
        entityTable: "stations",
        entityId: id,
      })
      return id
    }

    const stationId = await ctx.db.insert("stations", data)
    await audit(ctx, {
      actorId: actor._id,
      action: "station.create",
      entityTable: "stations",
      entityId: stationId,
    })
    return stationId
  },
})
