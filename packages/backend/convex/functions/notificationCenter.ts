import { v } from "convex/values"

import { mutation, query } from "../_generated/server"
import { requireUser } from "../lib/auth"

/**
 * Centre de notifications du voyageur.
 *
 * Séparé de `notifications.ts`, qui tourne sous le runtime Node pour l'envoi
 * d'e-mails : une query Convex ne peut pas y vivre.
 */

const category = v.union(
  v.literal("retard"),
  v.literal("rappel"),
  v.literal("achat"),
  v.literal("remboursement")
)

/** Notifications du voyageur connecté, les plus récentes d'abord. */
export const list = query({
  args: { onlyUnread: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    // Les canaux e-mail et SMS sont des traces d'envoi, pas des messages à
    // lire dans l'application : seul l'in-app et le push alimentent la liste.
    const visible = rows.filter(
      (row) => row.channel === "in_app" || row.channel === "push"
    )
    const filtered = args.onlyUnread
      ? visible.filter((row) => row.readAt === undefined)
      : visible

    return filtered.sort(
      (a, b) => (b.sentAt ?? b._creationTime) - (a.sentAt ?? a._creationTime)
    )
  },
})

/** Nombre de messages non lus — alimente la pastille de la cloche. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", user._id).eq("readAt", undefined)
      )
      .collect()
    return rows.filter(
      (row) => row.channel === "in_app" || row.channel === "push"
    ).length
  },
})

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const row = await ctx.db.get(args.notificationId)
    // Même message qu'un identifiant inexistant : on ne confirme pas à un
    // tiers qu'une notification existe.
    if (!row || row.userId !== user._id) {
      throw new Error("Notification introuvable")
    }
    if (row.readAt === undefined) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() })
    }
  },
})

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", user._id).eq("readAt", undefined)
      )
      .collect()
    const now = Date.now()
    for (const row of rows) {
      await ctx.db.patch(row._id, { readAt: now })
    }
    return rows.length
  },
})

/* ─────────────────────────────── Préférences ───────────────────────────── */

/** Valeurs par défaut : tout est actif, rien n'est mis en sourdine. */
const DEFAULT_PREFERENCES = {
  pushEnabled: true,
  smsEnabled: true,
  mutedCategories: [] as Array<
    "retard" | "rappel" | "achat" | "remboursement"
  >,
}

export const preferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const row = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()
    if (!row) return DEFAULT_PREFERENCES
    return {
      pushEnabled: row.pushEnabled,
      smsEnabled: row.smsEnabled,
      mutedCategories: row.mutedCategories,
    }
  },
})

export const setPreferences = mutation({
  args: {
    pushEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    mutedCategories: v.array(category),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() })
      return existing._id
    }
    return await ctx.db.insert("notificationPreferences", {
      ...args,
      userId: user._id,
      updatedAt: Date.now(),
    })
  },
})
