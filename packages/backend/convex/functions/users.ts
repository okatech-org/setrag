import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { authComponent } from "../betterAuth/auth"
import { getUser, requireAdmin, requireUser, audit } from "../lib/auth"
import { role } from "../schema"

/** Profil applicatif de l'utilisateur courant. */
export const me = query({
  args: {},
  handler: async (ctx) => getUser(ctx),
})

/**
 * Crée le profil applicatif au premier accès après authentification.
 * Idempotent : appelée par le client à chaque ouverture de session.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) throw new Error("Non authentifié")

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authUser._id))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: Date.now() })
      return existing._id
    }

    return await ctx.db.insert("users", {
      authId: authUser._id,
      email: authUser.email ?? undefined,
      firstName: (authUser as { firstName?: string }).firstName,
      lastName: (authUser as { lastName?: string }).lastName,
      phone: (authUser as { phone?: string }).phone,
      role: "voyageur",
      isActive: true,
      lastSeenAt: Date.now(),
    })
  },
})

export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await ctx.db.patch(user._id, args)
  },
})

/** Attribution d'un rôle — administrateurs uniquement. */
export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: role,
    stationId: v.optional(v.id("stations")),
    matricule: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const target = await ctx.db.get(args.userId)
    if (!target) throw new Error("Utilisateur introuvable")

    await ctx.db.patch(args.userId, {
      role: args.role,
      stationId: args.stationId,
      matricule: args.matricule,
    })

    await audit(ctx, {
      actorId: admin._id,
      action: "user.setRole",
      entityTable: "users",
      entityId: args.userId,
      metadata: { from: target.role, to: args.role },
    })
  },
})
