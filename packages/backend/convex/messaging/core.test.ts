/// <reference types="vite/client" />

import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"

const GUEST_KEY = "channel-guest-key-0123456789-abcdef"

describe("socle de messagerie multicanale", () => {
  it("déduplique un événement fournisseur", async () => {
    const t = convexTest(schema, modules)
    const args = {
      channel: "telegram" as const,
      externalEventId: "update-1",
      externalThreadId: "chat-1",
      externalUserId: "user-1",
      type: "text" as const,
      text: "Bonjour",
    }
    const first = await t.mutation(internal.messaging.core.ingestEvent, args)
    const replay = await t.mutation(internal.messaging.core.ingestEvent, args)

    expect(first.duplicate).toBe(false)
    expect(replay).toEqual({ eventId: first.eventId, duplicate: true })
  })

  it("associe durablement un thread à une conversation Ruban", async () => {
    const t = convexTest(schema, modules)
    const args = {
      channel: "telegram" as const,
      externalThreadId: "chat-1",
      externalUserId: "user-1",
      displayName: "Ada",
      locale: "fr",
      guestKey: GUEST_KEY,
    }
    const first = await t.mutation(internal.messaging.core.ensureThread, args)
    const replay = await t.mutation(internal.messaging.core.ensureThread, args)

    expect(replay._id).toBe(first._id)
    expect(replay.conversationId).toBe(first.conversationId)
    const conversation = await t.run((ctx) => ctx.db.get(first.conversationId))
    expect(conversation?.assistantId).toBe("concierge")
  })

  it("donne au fil d'une identité reliée une conversation de ce compte", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-thread",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    const args = {
      channel: "telegram" as const,
      externalThreadId: "chat-linked",
      externalUserId: "user-linked",
      guestKey: GUEST_KEY,
    }
    const first = await t.mutation(internal.messaging.core.ensureThread, args)
    await t.run((ctx) => ctx.db.patch(first.identityId, { userId }))

    // L'identité vient d'être reliée alors que la conversation est invitée :
    // le fil repart sur une conversation du compte.
    const linked = await t.mutation(internal.messaging.core.ensureThread, args)
    expect(linked.conversationId).not.toBe(first.conversationId)
    const conversation = await t.run((ctx) =>
      ctx.db.get(linked.conversationId)
    )
    expect(conversation?.userId).toBe(userId)
    expect((await t.run((ctx) => ctx.db.get(first.conversationId)))?.status).toBe(
      "closed"
    )

    // `/nouveau` garde le compte ; une conversation cohérente est conservée.
    const reset = await t.mutation(internal.messaging.core.resetThread, {
      threadId: linked._id,
      guestKey: GUEST_KEY,
    })
    const fresh = await t.run((ctx) => ctx.db.get(reset.conversationId))
    expect(fresh?.userId).toBe(userId)
    const stable = await t.mutation(internal.messaging.core.ensureThread, args)
    expect(stable.conversationId).toBe(reset.conversationId)
  })

  it("ne résout une approbation qu'une seule fois", async () => {
    const t = convexTest(schema, modules)
    const thread = await t.mutation(internal.messaging.core.ensureThread, {
      channel: "telegram",
      externalThreadId: "chat-approval",
      externalUserId: "user-approval",
      guestKey: GUEST_KEY,
    })
    const approval = await t.mutation(
      internal.messaging.core.registerApproval,
      {
        threadId: thread._id,
        token: "opaque-token",
        callId: "call-1",
        toolName: "create_booking",
        expiresAt: Date.now() + 60_000,
      }
    )
    const claimed = await t.mutation(internal.messaging.core.claimApproval, {
      threadId: thread._id,
      token: approval.token,
      decision: "approve",
    })
    expect(claimed.acquired).toBe(true)
    await t.mutation(internal.messaging.core.resolveApproval, {
      approvalId: approval._id,
      succeeded: true,
    })
    const replay = await t.mutation(internal.messaging.core.claimApproval, {
      threadId: thread._id,
      token: approval.token,
      decision: "approve",
    })
    expect(replay).toMatchObject({
      acquired: false,
      reason: "resolved",
    })
  })

  it("sérialise deux événements d'une même conversation", async () => {
    const t = convexTest(schema, modules)
    const thread = await t.mutation(internal.messaging.core.ensureThread, {
      channel: "telegram",
      externalThreadId: "chat-queue",
      externalUserId: "user-queue",
      guestKey: GUEST_KEY,
    })
    const first = await t.mutation(internal.messaging.core.ingestEvent, {
      channel: "telegram",
      externalEventId: "queue-1",
      externalThreadId: "chat-queue",
      externalUserId: "user-queue",
      type: "text",
      text: "Premier",
    })
    const second = await t.mutation(internal.messaging.core.ingestEvent, {
      channel: "telegram",
      externalEventId: "queue-2",
      externalThreadId: "chat-queue",
      externalUserId: "user-queue",
      type: "text",
      text: "Second",
    })

    expect(
      await t.mutation(internal.messaging.core.claimThread, {
        threadId: thread._id,
        eventId: first.eventId,
      })
    ).toEqual({ acquired: true })
    expect(
      await t.mutation(internal.messaging.core.claimThread, {
        threadId: thread._id,
        eventId: second.eventId,
      })
    ).toEqual({ acquired: false })
    await t.mutation(internal.messaging.core.releaseThread, {
      threadId: thread._id,
      eventId: first.eventId,
    })
    expect(
      await t.mutation(internal.messaging.core.claimThread, {
        threadId: thread._id,
        eventId: second.eventId,
      })
    ).toEqual({ acquired: false })
    await t.mutation(internal.messaging.core.completeEvent, {
      eventId: first.eventId,
    })
    expect(
      await t.mutation(internal.messaging.core.claimThread, {
        threadId: thread._id,
        eventId: second.eventId,
      })
    ).toEqual({ acquired: true })
  })

  it("ne dépasse pas un envoi sortant en attente de retry", async () => {
    const t = convexTest(schema, modules)
    const thread = await t.mutation(internal.messaging.core.ensureThread, {
      channel: "telegram",
      externalThreadId: "chat-outbox",
      externalUserId: "user-outbox",
      guestKey: GUEST_KEY,
    })
    await t.mutation(internal.messaging.core.enqueueBundle, {
      threadId: thread._id,
      texts: ["Premier", "Second"],
    })

    const first = await t.mutation(internal.messaging.core.claimNextOutbox, {
      threadId: thread._id,
    })
    expect(first?.text).toBe("Premier")
    await t.mutation(internal.messaging.core.markOutboxFailed, {
      outboxId: first!._id,
      error: "Telegram indisponible",
      nextAttemptAt: Date.now() + 60_000,
    })

    expect(
      await t.mutation(internal.messaging.core.claimNextOutbox, {
        threadId: thread._id,
      })
    ).toBeNull()
  })
})
