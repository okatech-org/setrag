import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex } from "@noble/hashes/utils"
import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { getUser, requireUser } from "../lib/auth"
import {
  ASSISTANT_PROFILES,
  type AssistantId,
  type TextProviderName,
} from "./contracts"
import { publicProviderConfig, resolveTextProviderConfig } from "./providers"

const assistantIdValidator = v.union(
  v.literal("concierge"),
  v.literal("booking"),
  v.literal("tickets"),
  v.literal("account")
)

const providerValidator = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("google")
)

export function hashGuestKey(guestKey: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(guestKey)))
}

function assertGuestKey(guestKey: string): void {
  if (guestKey.length < 32 || guestKey.length > 256) {
    throw new Error(
      "Le secret de session doit contenir entre 32 et 256 caractères."
    )
  }
}

async function assertConversationAccess(
  ctx: QueryCtx | MutationCtx,
  conversation: Doc<"assistantConversations">,
  guestKey?: string
): Promise<Doc<"users"> | null> {
  const user = await getUser(ctx)
  if (conversation.userId) {
    if (!user || user._id !== conversation.userId) {
      throw new Error("Conversation inaccessible.")
    }
    return user
  }
  if (!guestKey || hashGuestKey(guestKey) !== conversation.guestKeyHash) {
    throw new Error("Conversation inaccessible.")
  }
  return user
}

export const getConfiguration = query({
  args: {},
  handler: async (ctx) => {
    const authenticated = (await getUser(ctx)) !== null
    return {
      assistants: Object.values(ASSISTANT_PROFILES).map((profile) => {
        const config = resolveTextProviderConfig(profile.id)
        return {
          id: profile.id,
          name: profile.name,
          description: profile.description,
          ...publicProviderConfig(config),
        }
      }),
      authenticated,
    }
  },
})

export const create = mutation({
  args: {
    guestKey: v.string(),
    assistantId: v.optional(assistantIdValidator),
    provider: v.optional(providerValidator),
  },
  handler: async (ctx, args) => {
    assertGuestKey(args.guestKey)
    const assistantId = (args.assistantId ?? "concierge") as AssistantId
    const config = resolveTextProviderConfig(
      assistantId,
      args.provider as TextProviderName | undefined
    )
    const user = await getUser(ctx)
    const now = Date.now()
    const conversationId = await ctx.db.insert("assistantConversations", {
      userId: user?._id,
      guestKeyHash: hashGuestKey(args.guestKey),
      assistantId,
      provider: config.provider,
      model: config.model,
      status: "active",
      createdAt: now,
      lastMessageAt: now,
    })
    return {
      conversationId,
      assistant: ASSISTANT_PROFILES[assistantId],
      ...publicProviderConfig(config),
    }
  },
})

export const get = query({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return null
    await assertConversationAccess(ctx, conversation, args.guestKey)
    return conversation
  },
})

export const listMessages = query({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    await assertConversationAccess(ctx, conversation, args.guestKey)
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)))
    const messages = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit)
    return messages.reverse()
  },
})

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)))
    return await ctx.db
      .query("assistantConversations")
      .withIndex("by_user_and_last_message_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit)
  },
})

export const close = mutation({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    await assertConversationAccess(ctx, conversation, args.guestKey)
    await ctx.db.patch(conversation._id, { status: "closed" })
    return { closed: true }
  },
})

export const accessContext = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    const user = await assertConversationAccess(
      ctx,
      conversation,
      args.guestKey
    )
    if (conversation.status !== "active") {
      throw new Error("Cette conversation est terminée.")
    }
    return {
      conversation,
      isAuthenticated: user !== null,
      rateLimitKey: user?._id ?? conversation.guestKeyHash,
    }
  },
})

export const history = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 30)))
    const messages = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit)
    return messages.reverse()
  },
})

export const appendMessage = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    content: v.string(),
    requestId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    provider: v.optional(providerValidator),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = await ctx.db.insert("assistantMessages", {
      ...args,
      createdAt: now,
    })
    await ctx.db.patch(args.conversationId, { lastMessageAt: now })
    return id
  },
})

/**
 * Ajoute un message déterministe une seule fois. Les confirmations différées
 * (bouton web, Telegram, voix) peuvent ainsi être rejouées sans dupliquer
 * l'historique visible par le modèle.
 */
export const appendMessageOnce = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    content: v.string(),
    requestId: v.string(),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    provider: v.optional(providerValidator),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_request_id_and_role", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
          .eq("role", args.role)
      )
      .unique()
    if (existing) return existing._id

    const now = Date.now()
    const id = await ctx.db.insert("assistantMessages", {
      ...args,
      createdAt: now,
    })
    await ctx.db.patch(args.conversationId, { lastMessageAt: now })
    return id
  },
})

const TURN_LEASE_MS = 2 * 60 * 1_000

/**
 * Prend un bail sur un tour. Le résultat structuré est conservé afin qu'un
 * webhook ou un client qui rejoue la même requête retrouve aussi les boutons
 * et actions, pas uniquement le texte final.
 */
export const beginTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()

    if (existing?.status === "completed") {
      return {
        acquired: false,
        state: "completed" as const,
        resultJson: existing.resultJson,
      }
    }
    if (
      existing?.status === "running" &&
      now - existing.updatedAt < TURN_LEASE_MS
    ) {
      return {
        acquired: false,
        state: "running" as const,
        resultJson: undefined,
      }
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "running",
        error: undefined,
        attempts: existing.attempts + 1,
        updatedAt: now,
      })
      return {
        acquired: true,
        state: "running" as const,
        resultJson: undefined,
      }
    }

    await ctx.db.insert("assistantTurns", {
      conversationId: args.conversationId,
      requestId: args.requestId,
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    })
    return {
      acquired: true,
      state: "running" as const,
      resultJson: undefined,
    }
  },
})

export const completeTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
    resultJson: v.string(),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()
    if (!turn) throw new Error("Tour assistant introuvable.")
    await ctx.db.patch(turn._id, {
      status: "completed",
      resultJson: args.resultJson,
      error: undefined,
      updatedAt: Date.now(),
    })
  },
})

export const failTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()
    if (!turn || turn.status === "completed") return
    await ctx.db.patch(turn._id, {
      status: "failed",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    })
  },
})

export const messagesForRequest = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const [user, assistant] = await Promise.all([
      ctx.db
        .query("assistantMessages")
        .withIndex("by_conversation_and_request_id_and_role", (q) =>
          q
            .eq("conversationId", args.conversationId)
            .eq("requestId", args.requestId)
            .eq("role", "user")
        )
        .unique(),
      ctx.db
        .query("assistantMessages")
        .withIndex("by_conversation_and_request_id_and_role", (q) =>
          q
            .eq("conversationId", args.conversationId)
            .eq("requestId", args.requestId)
            .eq("role", "assistant")
        )
        .unique(),
    ])
    return { user, assistant }
  },
})

export type ConversationAccessContext = {
  conversation: Doc<"assistantConversations">
  isAuthenticated: boolean
  rateLimitKey: string
}

export type ConversationId = Id<"assistantConversations">
