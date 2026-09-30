import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { hashGuestKey } from "../ai/conversations"
import { resolveTextProviderConfig } from "../ai/providers"
import { messagingButton } from "../schema"
import { channelValidator, type OutboundButton } from "./contracts"

const eventTypeValidator = v.union(
  v.literal("text"),
  v.literal("action"),
  v.literal("command"),
  v.literal("unsupported")
)

const EVENT_LEASE_MS = 2 * 60 * 1_000
const MAX_EVENT_ATTEMPTS = 5

/**
 * Nouvelle conversation d'assistant pour un fil. Elle porte le compte relié
 * à l'identité du fil, s'il y en a un : c'est ce `userId` qui fera de ce
 * compte l'acteur des tours suivants.
 */
export async function insertThreadConversation(
  ctx: MutationCtx,
  guestKeyHash: string,
  userId: Id<"users"> | undefined
): Promise<Id<"assistantConversations">> {
  const now = Date.now()
  const config = resolveTextProviderConfig("concierge")
  return await ctx.db.insert("assistantConversations", {
    userId,
    guestKeyHash,
    assistantId: "concierge",
    provider: config.provider,
    model: config.model,
    status: "active",
    createdAt: now,
    lastMessageAt: now,
  })
}

export const ingestEvent = internalMutation({
  args: {
    channel: channelValidator,
    externalEventId: v.string(),
    externalThreadId: v.string(),
    externalUserId: v.string(),
    type: eventTypeValidator,
    text: v.optional(v.string()),
    actionToken: v.optional(v.string()),
    linkTokenHash: v.optional(v.string()),
    providerInteractionId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    locale: v.optional(v.string()),
    rawPayload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messagingEvents")
      .withIndex("by_channel_and_external_event", (q) =>
        q
          .eq("channel", args.channel)
          .eq("externalEventId", args.externalEventId)
      )
      .unique()
    if (existing) return { eventId: existing._id, duplicate: true }

    const eventId = await ctx.db.insert("messagingEvents", {
      ...args,
      status: "received",
      attempts: 0,
      createdAt: Date.now(),
    })
    return { eventId, duplicate: false }
  },
})

export const getEvent = internalQuery({
  args: { eventId: v.id("messagingEvents") },
  handler: async (ctx, args) => ctx.db.get(args.eventId),
})

export const getThread = internalQuery({
  args: { threadId: v.id("messagingThreads") },
  handler: async (ctx, args) => ctx.db.get(args.threadId),
})

export const claimEvent = internalMutation({
  args: { eventId: v.id("messagingEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Événement de messagerie introuvable.")
    if (event.status === "processed" || event.status === "exhausted") {
      return { acquired: false, reason: event.status, event }
    }
    if (event.attempts >= MAX_EVENT_ATTEMPTS) {
      return { acquired: false, reason: "exhausted" as const, event }
    }
    const now = Date.now()
    if (
      event.status === "processing" &&
      event.processingStartedAt &&
      now - event.processingStartedAt < EVENT_LEASE_MS
    ) {
      return { acquired: false, reason: "processing" as const, event }
    }
    await ctx.db.patch(event._id, {
      status: "processing",
      attempts: event.attempts + 1,
      processingStartedAt: now,
      error: undefined,
    })
    return {
      acquired: true,
      reason: "acquired" as const,
      event: {
        ...event,
        status: "processing" as const,
        attempts: event.attempts + 1,
        processingStartedAt: now,
      },
    }
  },
})

export const ensureThread = internalMutation({
  args: {
    channel: channelValidator,
    externalThreadId: v.string(),
    externalUserId: v.string(),
    displayName: v.optional(v.string()),
    locale: v.optional(v.string()),
    guestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingThread = await ctx.db
      .query("messagingThreads")
      .withIndex("by_channel_and_external_thread", (q) =>
        q
          .eq("channel", args.channel)
          .eq("externalThreadId", args.externalThreadId)
      )
      .unique()
    if (existingThread) {
      const identity = await ctx.db.get(existingThread.identityId)
      if (identity && identity.externalUserId !== args.externalUserId) {
        throw new Error(
          "L'identité externe ne correspond pas à cette conversation."
        )
      }
      if (identity) {
        await ctx.db.patch(identity._id, {
          displayName: args.displayName ?? identity.displayName,
          locale: args.locale ?? identity.locale,
          lastSeenAt: now,
        })
      }

      // Invariant : la conversation du fil appartient au compte relié à
      // l'identité (ou à personne si elle n'est pas reliée). Après une
      // déliaison depuis le site, l'ancienne conversation est close : le fil
      // repart sur une conversation neuve, sans l'historique du compte.
      let conversationId = existingThread.conversationId
      const conversation = await ctx.db.get(conversationId)
      if (
        !conversation ||
        conversation.status !== "active" ||
        conversation.userId !== identity?.userId
      ) {
        if (conversation?.status === "active") {
          await ctx.db.patch(conversation._id, { status: "closed" })
        }
        conversationId = await insertThreadConversation(
          ctx,
          hashGuestKey(args.guestKey),
          identity?.userId
        )
      }
      await ctx.db.patch(existingThread._id, {
        conversationId,
        lastInboundAt: now,
        state:
          existingThread.state === "closed"
            ? ("active" as const)
            : existingThread.state,
      })
      return (await ctx.db.get(existingThread._id))!
    }

    let identity = await ctx.db
      .query("messagingIdentities")
      .withIndex("by_channel_and_external_user", (q) =>
        q.eq("channel", args.channel).eq("externalUserId", args.externalUserId)
      )
      .unique()
    if (!identity) {
      const identityId = await ctx.db.insert("messagingIdentities", {
        channel: args.channel,
        externalUserId: args.externalUserId,
        displayName: args.displayName,
        locale: args.locale,
        createdAt: now,
        lastSeenAt: now,
      })
      identity = (await ctx.db.get(identityId))!
    }

    const conversationId = await insertThreadConversation(
      ctx,
      hashGuestKey(args.guestKey),
      identity.userId
    )
    const threadId = await ctx.db.insert("messagingThreads", {
      channel: args.channel,
      externalThreadId: args.externalThreadId,
      identityId: identity._id,
      conversationId,
      state: "active",
      createdAt: now,
      lastInboundAt: now,
    })
    return (await ctx.db.get(threadId))!
  },
})

export const resetThread = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    guestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread) throw new Error("Conversation multicanale introuvable.")
    const current = await ctx.db.get(thread.conversationId)
    if (current) await ctx.db.patch(current._id, { status: "closed" })

    const now = Date.now()
    const identity = await ctx.db.get(thread.identityId)
    const conversationId = await insertThreadConversation(
      ctx,
      hashGuestKey(args.guestKey),
      identity?.userId
    )
    await ctx.db.patch(thread._id, {
      conversationId,
      state: "active",
      lastInboundAt: now,
    })
    return { ...thread, conversationId, state: "active" as const }
  },
})

export const attachEventToThread = internalMutation({
  args: {
    eventId: v.id("messagingEvents"),
    threadId: v.id("messagingThreads"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { threadId: args.threadId })
  },
})

export const claimThread = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    eventId: v.id("messagingEvents"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread) throw new Error("Conversation multicanale introuvable.")
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Événement de messagerie introuvable.")

    const pending = (
      await Promise.all(
        (["received", "processing", "failed"] as const).map((status) =>
          ctx.db
            .query("messagingEvents")
            .withIndex("by_channel_thread_status_and_created_at", (q) =>
              q
                .eq("channel", event.channel)
                .eq("externalThreadId", event.externalThreadId)
                .eq("status", status)
            )
            .first()
        )
      )
    )
      .filter((candidate) => candidate !== null)
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt ||
          left._creationTime - right._creationTime
      )
    if (pending[0]?._id !== event._id) {
      return { acquired: false }
    }

    const now = Date.now()
    if (
      thread.processingEventId &&
      thread.processingEventId !== args.eventId &&
      thread.processingStartedAt &&
      now - thread.processingStartedAt < EVENT_LEASE_MS
    ) {
      return { acquired: false }
    }
    await ctx.db.patch(thread._id, {
      processingEventId: args.eventId,
      processingStartedAt: now,
    })
    return { acquired: true }
  },
})

export const releaseThread = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    eventId: v.id("messagingEvents"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread || thread.processingEventId !== args.eventId) return
    await ctx.db.patch(thread._id, {
      processingEventId: undefined,
      processingStartedAt: undefined,
    })
  },
})

export const deferEvent = internalMutation({
  args: { eventId: v.id("messagingEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.status === "processed") return
    await ctx.db.patch(event._id, {
      status: "received",
      attempts: Math.max(0, event.attempts - 1),
      processingStartedAt: undefined,
    })
  },
})

export const completeEvent = internalMutation({
  args: { eventId: v.id("messagingEvents") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: "processed",
      processedAt: Date.now(),
      error: undefined,
    })
  },
})

export const failEvent = internalMutation({
  args: {
    eventId: v.id("messagingEvents"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.status === "processed") return
    await ctx.db.patch(event._id, {
      status: event.attempts >= MAX_EVENT_ATTEMPTS ? "exhausted" : "failed",
      error: args.error.slice(0, 500),
      processedAt: Date.now(),
    })
  },
})

export const registerApproval = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    token: v.string(),
    callId: v.string(),
    toolName: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messagingApprovals")
      .withIndex("by_thread_and_call", (q) =>
        q.eq("threadId", args.threadId).eq("callId", args.callId)
      )
      .unique()
    if (existing) return existing
    const tokenOwner = await ctx.db
      .query("messagingApprovals")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()
    if (tokenOwner) throw new Error("Collision de jeton d'approbation.")
    const id = await ctx.db.insert("messagingApprovals", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    })
    return (await ctx.db.get(id))!
  },
})

export const claimApproval = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    token: v.string(),
    decision: v.union(v.literal("approve"), v.literal("reject")),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db
      .query("messagingApprovals")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()
    if (!approval || approval.threadId !== args.threadId) {
      throw new Error("Confirmation introuvable.")
    }
    if (approval.status === "resolved") {
      return { acquired: false, reason: "resolved" as const, approval }
    }
    if (approval.status === "processing") {
      return { acquired: false, reason: "processing" as const, approval }
    }
    if (approval.status !== "pending" || approval.expiresAt < Date.now()) {
      if (approval.status === "pending") {
        await ctx.db.patch(approval._id, { status: "expired" })
      }
      return { acquired: false, reason: "expired" as const, approval }
    }
    await ctx.db.patch(approval._id, {
      status: "processing",
      decision: args.decision,
      error: undefined,
    })
    return {
      acquired: true,
      reason: "acquired" as const,
      approval: {
        ...approval,
        status: "processing" as const,
        decision: args.decision,
      },
    }
  },
})

export const resolveApproval = internalMutation({
  args: {
    approvalId: v.id("messagingApprovals"),
    succeeded: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.approvalId, {
      status: args.succeeded ? "resolved" : "failed",
      error: args.error?.slice(0, 500),
      resolvedAt: Date.now(),
    })
  },
})

/**
 * Met en file un lot sortant : les textes dans l'ordre, les boutons sur le
 * dernier texte, puis les documents. Utilisable depuis toute mutation.
 */
export async function insertOutboxBundle(
  ctx: MutationCtx,
  args: {
    threadId: Id<"messagingThreads">
    sourceEventId?: Id<"messagingEvents">
    texts: string[]
    buttons?: OutboundButton[]
    documents?: Array<{ url: string; filename: string; caption?: string }>
  }
): Promise<number> {
  let enqueued = 0
  const now = Date.now()
  for (const [index, text] of args.texts.entries()) {
    await ctx.db.insert("messagingOutbox", {
      threadId: args.threadId,
      sourceEventId: args.sourceEventId,
      kind: "text",
      text,
      buttons: index === args.texts.length - 1 ? args.buttons : undefined,
      status: "pending",
      attempts: 0,
      createdAt: now + index,
    })
    enqueued += 1
  }
  for (const [index, document] of (args.documents ?? []).entries()) {
    await ctx.db.insert("messagingOutbox", {
      threadId: args.threadId,
      sourceEventId: args.sourceEventId,
      kind: "document",
      text: document.caption,
      documentUrl: document.url,
      filename: document.filename,
      status: "pending",
      attempts: 0,
      createdAt: now + args.texts.length + index,
    })
    enqueued += 1
  }
  return enqueued
}

export const enqueueBundle = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    sourceEventId: v.optional(v.id("messagingEvents")),
    texts: v.array(v.string()),
    buttons: v.optional(v.array(messagingButton)),
    documents: v.optional(
      v.array(
        v.object({
          url: v.string(),
          filename: v.string(),
          caption: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    if (args.sourceEventId) {
      const existing = await ctx.db
        .query("messagingOutbox")
        .withIndex("by_source_event", (q) =>
          q.eq("sourceEventId", args.sourceEventId)
        )
        .first()
      if (existing) return { enqueued: 0, duplicate: true }
    }
    const enqueued = await insertOutboxBundle(ctx, args)
    return { enqueued, duplicate: false }
  },
})

export const claimNextOutbox = internalMutation({
  args: { threadId: v.id("messagingThreads") },
  handler: async (ctx, args) => {
    const now = Date.now()
    const message = await ctx.db
      .query("messagingOutbox")
      .withIndex("by_thread_and_status", (q) =>
        q.eq("threadId", args.threadId).eq("status", "pending")
      )
      .order("asc")
      .first()
    if (!message || (message.nextAttemptAt ?? 0) > now) return null
    await ctx.db.patch(message._id, {
      status: "sending",
      attempts: message.attempts + 1,
      error: undefined,
    })
    return {
      ...message,
      status: "sending" as const,
      attempts: message.attempts + 1,
    }
  },
})

export const markOutboxSent = internalMutation({
  args: {
    outboxId: v.id("messagingOutbox"),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId)
    if (!outbox) return
    const now = Date.now()
    await ctx.db.patch(outbox._id, {
      status: "sent",
      providerMessageId: args.providerMessageId,
      sentAt: now,
      nextAttemptAt: undefined,
      error: undefined,
    })
    await ctx.db.patch(outbox.threadId, { lastOutboundAt: now })
  },
})

export const markOutboxFailed = internalMutation({
  args: {
    outboxId: v.id("messagingOutbox"),
    error: v.string(),
    nextAttemptAt: v.number(),
  },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId)
    if (!outbox || outbox.status === "sent") return { retry: false }
    const retry = outbox.attempts < 5
    await ctx.db.patch(outbox._id, {
      status: retry ? "pending" : "failed",
      error: args.error.slice(0, 500),
      nextAttemptAt: retry ? args.nextAttemptAt : undefined,
    })
    return { retry }
  },
})
