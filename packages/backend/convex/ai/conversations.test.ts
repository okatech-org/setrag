/// <reference types="vite/client" />

import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"

const GUEST_KEY = "guest-session-key-0123456789-abcdef"

describe("conversations IA", () => {
  it("publie les assistants disponibles sans exposer les clés", async () => {
    const t = convexTest(schema, modules)
    const configuration = await t.query(
      api.ai.conversations.getConfiguration,
      {}
    )
    expect(configuration.authenticated).toBe(false)
    expect(configuration.assistants.map((assistant) => assistant.id)).toEqual([
      "concierge",
      "booking",
      "tickets",
      "account",
    ])
    for (const assistant of configuration.assistants) {
      expect(assistant).toMatchObject({
        name: expect.any(String),
        provider: expect.stringMatching(/^(openai|anthropic|google)$/),
        model: expect.any(String),
        configured: expect.any(Boolean),
      })
      expect(assistant).not.toHaveProperty("apiKey")
    }
  })

  it("impose un secret invité suffisamment long", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.ai.conversations.create, {
        guestKey: "trop-court",
      })
    ).rejects.toThrow(/entre 32 et 256 caractères/)
    await expect(
      t.mutation(api.ai.conversations.create, {
        guestKey: "x".repeat(257),
      })
    ).rejects.toThrow(/entre 32 et 256 caractères/)
  })

  it("protège une conversation invitée par son secret", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })

    const conversation = await t.query(api.ai.conversations.get, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    expect(conversation?.assistantId).toBe("booking")
    await expect(
      t.query(api.ai.conversations.get, {
        conversationId: created.conversationId,
        guestKey: "wrong-session-key-0123456789-abcdef",
      })
    ).rejects.toThrow(/inaccessible/)
  })

  it("attache la conversation au compte connecté", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-1",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    const traveler = t.withIdentity({ subject: "traveler-1" })
    const created = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "account",
    })
    const conversation = await traveler.query(api.ai.conversations.get, {
      conversationId: created.conversationId,
    })
    expect(conversation?.userId).toBe(userId)

    await expect(
      t.query(api.ai.conversations.get, {
        conversationId: created.conversationId,
        guestKey: GUEST_KEY,
      })
    ).rejects.toThrow(/inaccessible/)

    const mine = await traveler.query(api.ai.conversations.listMine, {})
    expect(mine.map((item) => item._id)).toEqual([created.conversationId])
    await expect(t.query(api.ai.conversations.listMine, {})).rejects.toThrow(
      /Non authentifié/
    )
  })

  it("précharge le profil et les voyageurs enregistrés dans le contexte", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-context",
        firstName: "Paul",
        lastName: "Mba",
        phone: "+241060000000",
        email: "paul@example.ga",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    await t.run((ctx) =>
      ctx.db.insert("savedPassengers", {
        userId,
        firstName: "Alice",
        lastName: "Mba",
        gender: "F",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    )
    const traveler = t.withIdentity({ subject: "traveler-context" })
    const created = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })

    const access = await traveler.query(
      internal.ai.conversations.accessContext,
      { conversationId: created.conversationId }
    )

    expect(access.travelerContext).toEqual({
      profile: {
        firstName: "Paul",
        lastName: "Mba",
        phone: "+241060000000",
        email: "paul@example.ga",
      },
      savedPassengers: [
        {
          firstName: "Alice",
          lastName: "Mba",
          gender: "F",
          phone: null,
        },
      ],
    })
  })

  it("mémorise un tour avec une clé d'idempotence", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await t.mutation(internal.ai.conversations.appendMessage, {
      conversationId: created.conversationId,
      role: "user",
      requestId: "message-1",
      content: "Je veux aller à Ndendé",
    })
    await t.mutation(internal.ai.conversations.appendMessage, {
      conversationId: created.conversationId,
      role: "assistant",
      requestId: "message-1",
      content: "Quel jour souhaitez-vous partir ?",
      provider: "openai",
      model: "test-model",
    })

    const turn = await t.query(internal.ai.conversations.messagesForRequest, {
      conversationId: created.conversationId,
      requestId: "message-1",
    })
    expect(turn.user?.content).toContain("Ndendé")
    expect(turn.assistant?.content).toContain("Quel jour")
  })

  it("reprend un tour échoué et ressert son résultat structuré", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const first = await t.mutation(internal.ai.conversations.beginTurn, {
      conversationId: created.conversationId,
      requestId: "message-retry",
    })
    expect(first.acquired).toBe(true)
    await t.mutation(internal.ai.conversations.failTurn, {
      conversationId: created.conversationId,
      requestId: "message-retry",
      error: "Réseau indisponible",
    })
    const retry = await t.mutation(internal.ai.conversations.beginTurn, {
      conversationId: created.conversationId,
      requestId: "message-retry",
    })
    expect(retry.acquired).toBe(true)

    const resultJson = JSON.stringify({
      message: "Réponse",
      pendingApprovals: [{ callId: "call-1" }],
    })
    await t.mutation(internal.ai.conversations.completeTurn, {
      conversationId: created.conversationId,
      requestId: "message-retry",
      resultJson,
    })
    const replay = await t.mutation(internal.ai.conversations.beginTurn, {
      conversationId: created.conversationId,
      requestId: "message-retry",
    })
    expect(replay).toEqual({
      acquired: false,
      state: "completed",
      resultJson,
    })
  })

  it("empêche deux traitements simultanés du même tour", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const first = await t.mutation(internal.ai.conversations.beginTurn, {
      conversationId: created.conversationId,
      requestId: "message-concurrent",
    })
    const concurrent = await t.mutation(internal.ai.conversations.beginTurn, {
      conversationId: created.conversationId,
      requestId: "message-concurrent",
    })
    expect(first).toMatchObject({ acquired: true, state: "running" })
    expect(concurrent).toEqual({
      acquired: false,
      state: "running",
      resultJson: undefined,
    })
  })

  it("interdit tout nouveau traitement après fermeture", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await t.mutation(api.ai.conversations.close, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })

    await expect(
      t.query(internal.ai.conversations.accessContext, {
        conversationId: created.conversationId,
        guestKey: GUEST_KEY,
      })
    ).rejects.toThrow(/conversation est terminée/)
  })
})
