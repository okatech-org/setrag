/// <reference types="vite/client" />

import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vitest"
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
        gender: null,
        missingForTicket: ["gender"],
      },
      savedPassengers: [
        {
          firstName: "Alice",
          lastName: "Mba",
          gender: "F",
          phone: null,
        },
      ],
      memories: [],
    })
  })

  it("prend la civilité du titulaire au profil, sinon à sa propre fiche", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-own-card",
        firstName: "Berny",
        lastName: "ITOUTOU",
        phone: "+241077235494",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    // Compte ancien : pas de civilité au profil, mais une fiche à son nom.
    await t.run((ctx) =>
      ctx.db.insert("savedPassengers", {
        userId,
        firstName: "Berny",
        lastName: "Itoutou",
        gender: "M",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    )
    const traveler = t.withIdentity({ subject: "traveler-own-card" })
    const created = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    expect(created.attachedToAccount).toBe(true)
    const access = await traveler.query(
      internal.ai.conversations.accessContext,
      { conversationId: created.conversationId }
    )
    expect(access.travelerContext?.profile).toMatchObject({
      gender: "M",
      missingForTicket: [],
    })

    await t.run((ctx) => ctx.db.patch(userId, { gender: "F" }))
    const apres = await traveler.query(
      internal.ai.conversations.accessContext,
      { conversationId: created.conversationId }
    )
    expect(apres.travelerContext?.profile.gender).toBe("F")
  })

  it("dit à l'interface qu'une conversation née avant le profil reste à rattacher", async () => {
    const t = convexTest(schema, modules)
    // Session ouverte, profil applicatif pas encore créé (inscription en cours).
    const sansProfil = t.withIdentity({ subject: "traveler-not-yet" })
    const created = await sansProfil.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    expect(created.attachedToAccount).toBe(false)
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

describe("appels d'outils gardés pour le rejeu", () => {
  async function conversationDuCompte() {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-rejeu-rgpd",
        firstName: "Ariane",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    const ariane = t.withIdentity({ subject: "traveler-rejeu-rgpd" })
    const { conversationId } = await ariane.mutation(
      api.ai.conversations.create,
      { guestKey: GUEST_KEY }
    )
    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.insert("assistantMessages", {
        conversationId,
        role: "user",
        requestId: "rgpd-1",
        content: "Mes billets ?",
        createdAt: now,
      })
      await ctx.db.insert("assistantMessages", {
        conversationId,
        role: "assistant",
        requestId: "rgpd-1",
        content: "Vous avez un billet pour Franceville.",
        status: "termine",
        createdAt: now + 1,
      })
      await ctx.db.insert("assistantTurns", {
        conversationId,
        requestId: "rgpd-1",
        status: "completed",
        resultJson: "{}",
        toolCalls: [
          {
            callId: "tickets-1",
            toolName: "list_my_tickets",
            inputJson: "{}",
            outputJson: JSON.stringify([{ reference: "SET-2026-0042" }]),
            status: "ok",
            actorKey: `compte:${userId}`,
          },
        ],
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      })
    })
    return { t, ariane, userId, conversationId }
  }

  it("les rejoue au compte qui les a obtenus, et à lui seul", async () => {
    const { t, userId, conversationId } = await conversationDuCompte()
    const lire = async (actorKey: string) =>
      JSON.parse(
        await t.query(internal.ai.conversations.modelHistory, {
          conversationId,
          actorKey,
          availableTools: ["list_my_tickets"],
        })
      ) as Array<{ role: string; calls?: Array<{ callId: string }> }>

    const pourLeCompte = await lire(`compte:${userId}`)
    expect(pourLeCompte.map((entree) => entree.role)).toEqual([
      "user",
      "tools",
      "assistant",
    ])
    expect(pourLeCompte[1]!.calls![0]!.callId).toBe("tickets-1")
    expect((await lire("invite")).map((entree) => entree.role)).toEqual([
      "user",
      "assistant",
    ])
  })

  it("les exporte avec la conversation et les efface avec le compte", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const { t, ariane } = await conversationDuCompte()
      const exporte = await ariane.query(
        api.functions.customers.exportMyData,
        {}
      )
      expect(exporte.assistantConversations).toEqual([
        expect.objectContaining({
          messages: [
            expect.objectContaining({ role: "user", content: "Mes billets ?" }),
            expect.objectContaining({
              role: "assistant",
              content: "Vous avez un billet pour Franceville.",
            }),
          ],
          toolCalls: [
            expect.objectContaining({
              toolName: "list_my_tickets",
              output: JSON.stringify([{ reference: "SET-2026-0042" }]),
            }),
          ],
          truncated: false,
        }),
      ])

      await ariane.mutation(api.functions.customers.deleteMyAccount, {
        confirmation: "SUPPRIMER",
      })
      await t.finishAllScheduledFunctions(vi.runAllTimers)
      const restant = await t.run(async (ctx) => ({
        tours: await ctx.db.query("assistantTurns").collect(),
        messages: await ctx.db.query("assistantMessages").collect(),
        conversations: await ctx.db.query("assistantConversations").collect(),
      }))
      expect(restant).toEqual({ tours: [], messages: [], conversations: [] })
    } finally {
      vi.useRealTimers()
    }
  })
})
