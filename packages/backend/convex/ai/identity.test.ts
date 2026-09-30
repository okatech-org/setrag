/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import { safetyIdentifierFor } from "./conversations"
import {
  reponseOpenAI,
  texteEntree,
  type CorpsOpenAI,
} from "./fournisseurs.test-utils"

/**
 * Identité portée par la conversation.
 *
 * L'acteur d'une conversation est résolu une fois, par `accessContext`, puis
 * transmis aux outils. Ces tests vérifient les refus croisés (invité,
 * compte, fil de messagerie), le rattachement `claim`, l'outil
 * `request_sign_in` et les compléments du tour web (`pageContext`,
 * `listTurns`).
 */

const GUEST_KEY = "guest-session-key-0123456789-abcdef"
const OTHER_KEY = "other-session-key-0123456789-abcdef"

/** Réponse OpenAI en flux, décrite comme l'ancienne réponse JSON. */
function openAIResponse(body: CorpsOpenAI) {
  return reponseOpenAI(body)
}

function openAIRequests(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(
    ([, init]) =>
      JSON.parse((init as RequestInit).body as string) as {
        instructions: string
        input: Array<{
          role?: string
          type?: string
          output?: string
          content?: string | Array<{ type?: string; text?: string }>
        }>
        safety_identifier?: string
        tools: Array<{ name: string }>
      }
  )
}

async function insertTraveler(
  t: ReturnType<typeof convexTest>,
  authId: string,
  fields: { firstName?: string; phone?: string } = {}
): Promise<Id<"users">> {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: fields.firstName,
      phone: fields.phone,
      role: "voyageur",
      identitySource: "local",
      isActive: true,
    })
  )
}

/** Fil de messagerie dont l'identité est reliée à `userId`. */
async function linkedThread(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  externalId: string
) {
  const thread = await t.mutation(internal.messaging.core.ensureThread, {
    channel: "telegram",
    externalThreadId: externalId,
    externalUserId: externalId,
    guestKey: `channel-key-${externalId}-0123456789-abcdef`,
  })
  await t.run(async (ctx) => {
    await ctx.db.patch(thread.identityId, { userId, linkedAt: Date.now() })
    await ctx.db.patch(thread.conversationId, { userId })
  })
  return thread
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("accès aux conversations selon l'acteur", () => {
  it("n'accorde aucun acteur à une conversation invitée, même à un appelant connecté", async () => {
    const t = convexTest(schema, modules)
    await insertTraveler(t, "traveler-guest-view")
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const traveler = t.withIdentity({ subject: "traveler-guest-view" })

    const access = await traveler.query(
      internal.ai.conversations.accessContext,
      { conversationId: created.conversationId, guestKey: GUEST_KEY }
    )
    expect(access).toMatchObject({
      acteur: null,
      isAuthenticated: false,
      travelerContext: null,
    })
    await expect(
      traveler.query(internal.ai.conversations.accessContext, {
        conversationId: created.conversationId,
        guestKey: OTHER_KEY,
      })
    ).rejects.toThrow(/inaccessible/)
  })

  it("réserve une conversation de compte à ce compte", async () => {
    const t = convexTest(schema, modules)
    const ownerId = await insertTraveler(t, "traveler-owner")
    await insertTraveler(t, "traveler-intruder")
    const owner = t.withIdentity({ subject: "traveler-owner" })
    const intruder = t.withIdentity({ subject: "traveler-intruder" })
    const created = await owner.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    const access = await owner.query(internal.ai.conversations.accessContext, {
      conversationId: created.conversationId,
    })
    expect(access.acteur).toEqual({ userId: ownerId, source: "session" })
    expect(access.rateLimitKey).toBe(ownerId)

    for (const caller of [intruder, t]) {
      await expect(
        caller.query(internal.ai.conversations.accessContext, {
          conversationId: created.conversationId,
          guestKey: GUEST_KEY,
        })
      ).rejects.toThrow(/inaccessible/)
      await expect(
        caller.query(api.ai.conversations.listMessages, {
          conversationId: created.conversationId,
          guestKey: GUEST_KEY,
        })
      ).rejects.toThrow(/inaccessible/)
    }

    // Un fil de messagerie qui ne porte pas cette conversation ne l'ouvre pas.
    const foreign = await linkedThread(t, ownerId, "9001")
    await expect(
      t.query(internal.ai.conversations.accessContext, {
        conversationId: created.conversationId,
        messagingThreadId: foreign._id,
      })
    ).rejects.toThrow(/inaccessible/)
  })

  it("fait agir un fil relié pour son compte, et pour lui seul", async () => {
    const t = convexTest(schema, modules)
    const aliceId = await insertTraveler(t, "traveler-alice", {
      firstName: "Alice",
    })
    const bobId = await insertTraveler(t, "traveler-bob")
    const thread = await linkedThread(t, aliceId, "9101")

    const viaThread = await t.query(internal.ai.conversations.accessContext, {
      conversationId: thread.conversationId,
      messagingThreadId: thread._id,
    })
    expect(viaThread.acteur).toEqual({ userId: aliceId, source: "messaging" })
    expect(viaThread.travelerContext?.profile.firstName).toBe("Alice")

    // Le même compte la retrouve sur le web ; un autre compte, non.
    const alice = t.withIdentity({ subject: "traveler-alice" })
    const bob = t.withIdentity({ subject: "traveler-bob" })
    await expect(
      alice.query(api.ai.conversations.get, {
        conversationId: thread.conversationId,
      })
    ).resolves.toMatchObject({ userId: aliceId })
    await expect(
      bob.query(api.ai.conversations.get, {
        conversationId: thread.conversationId,
      })
    ).rejects.toThrow(/inaccessible/)

    // Le fil d'un autre compte ne l'ouvre pas…
    const bobThread = await linkedThread(t, bobId, "9102")
    await expect(
      t.query(internal.ai.conversations.accessContext, {
        conversationId: thread.conversationId,
        messagingThreadId: bobThread._id,
      })
    ).rejects.toThrow(/inaccessible/)

    // …et une identité reliée depuis à un autre compte non plus.
    await t.run((ctx) => ctx.db.patch(thread.identityId, { userId: bobId }))
    await expect(
      t.query(internal.ai.conversations.accessContext, {
        conversationId: thread.conversationId,
        messagingThreadId: thread._id,
      })
    ).rejects.toThrow(/inaccessible/)
  })

  it("laisse invité un fil non relié", async () => {
    const t = convexTest(schema, modules)
    const thread = await t.mutation(internal.messaging.core.ensureThread, {
      channel: "telegram",
      externalThreadId: "9201",
      externalUserId: "9201",
      guestKey: "channel-key-9201-0123456789-abcdef",
    })
    const access = await t.query(internal.ai.conversations.accessContext, {
      conversationId: thread.conversationId,
      messagingThreadId: thread._id,
    })
    expect(access).toMatchObject({ acteur: null, isAuthenticated: false })
  })
})

describe("comptes désactivés", () => {
  it("refuse la conversation d'un compte désactivé, comme requireUser", async () => {
    const t = convexTest(schema, modules)
    const userId = await insertTraveler(t, "traveler-disabled")
    const traveler = t.withIdentity({ subject: "traveler-disabled" })
    const created = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const thread = await linkedThread(t, userId, "9301")
    await t.run((ctx) => ctx.db.patch(userId, { isActive: false }))

    await expect(
      traveler.query(internal.ai.conversations.accessContext, {
        conversationId: created.conversationId,
      })
    ).rejects.toThrow(/Compte désactivé/)
    await expect(
      traveler.query(api.ai.conversations.listMessages, {
        conversationId: created.conversationId,
      })
    ).rejects.toThrow(/Compte désactivé/)
    await expect(
      t.query(internal.ai.conversations.accessContext, {
        conversationId: thread.conversationId,
        messagingThreadId: thread._id,
      })
    ).rejects.toThrow(/Compte désactivé/)
  })

  it("refuse un acteur désactivé dans les variantes internes (loadActor)", async () => {
    const t = convexTest(schema, modules)
    const userId = await insertTraveler(t, "traveler-disabled-actor")
    await t.run((ctx) => ctx.db.patch(userId, { isActive: false }))
    await expect(
      t.query(internal.functions.bookings.getByReferenceForActor, {
        userId,
        reference: "V-QUELCONQUE",
      })
    ).rejects.toThrow(/Compte désactivé/)
    await expect(
      t.mutation(internal.functions.bookings.cancelHoldForActor, {
        userId,
        reference: "V-QUELCONQUE",
      })
    ).rejects.toThrow(/Compte désactivé/)
  })
})

describe("identifiant de sécurité transmis au fournisseur", () => {
  it("envoie une empreinte HMAC du compte, jamais son identifiant", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-safety")
    vi.stubEnv("BETTER_AUTH_SECRET", "better-auth-secret-de-test-0123456789")
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(openAIResponse({ output_text: "Bonjour.", output: [] }))
    )
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const userId = await insertTraveler(t, "traveler-safety")
    const traveler = t.withIdentity({ subject: "traveler-safety" })
    const created = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await traveler.action(api.ai.chat.sendMessage, {
      conversationId: created.conversationId,
      requestId: "safety-1",
      content: "Bonjour",
    })

    // Le SDK le transmet dans le corps (`safety_identifier`), comme le
    // documente l'API Responses.
    const [request] = openAIRequests(fetchMock)
    const sent = request!.safety_identifier
    expect(sent).toBe(safetyIdentifierFor(userId))
    expect(sent).toMatch(/^[a-f0-9]{64}$/)
    expect(sent).not.toContain(userId)
  })

  it("ne transmet rien plutôt qu'un identifiant brut sans secret serveur", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "")
    vi.stubEnv("MESSAGING_SESSION_SECRET", "")
    expect(safetyIdentifierFor("user-1")).toBeUndefined()
    vi.stubEnv("MESSAGING_SESSION_SECRET", "messaging-secret-de-test-0123456789")
    const withMessaging = safetyIdentifierFor("user-1")
    vi.stubEnv("MESSAGING_SESSION_SECRET", "autre-secret-de-test-0123456789-abcdef")
    // Le secret fait l'empreinte : sans lui, elle ne se recalcule pas.
    expect(safetyIdentifierFor("user-1")).not.toBe(withMessaging)
  })
})

describe("rattachement d'une conversation invitée (claim)", () => {
  it("rattache la conversation au compte, conserve l'historique et journalise", async () => {
    const t = convexTest(schema, modules)
    const aliceId = await insertTraveler(t, "traveler-claim-alice")
    await insertTraveler(t, "traveler-claim-bob")
    const alice = t.withIdentity({ subject: "traveler-claim-alice" })
    const bob = t.withIdentity({ subject: "traveler-claim-bob" })
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await t.mutation(internal.ai.conversations.appendMessage, {
      conversationId: created.conversationId,
      role: "user",
      requestId: "before-sign-in",
      content: "Je cherche mes billets.",
    })
    const args = { conversationId: created.conversationId, guestKey: GUEST_KEY }

    await expect(t.mutation(api.ai.conversations.claim, args)).rejects.toThrow(
      /Non authentifié/
    )
    await expect(
      alice.mutation(api.ai.conversations.claim, {
        ...args,
        guestKey: OTHER_KEY,
      })
    ).rejects.toThrow(/inaccessible/)

    await expect(
      alice.mutation(api.ai.conversations.claim, args)
    ).resolves.toEqual({
      conversationId: created.conversationId,
      status: "claimed",
    })
    await expect(
      alice.mutation(api.ai.conversations.claim, args)
    ).resolves.toEqual({
      conversationId: created.conversationId,
      status: "already_claimed",
    })
    await expect(bob.mutation(api.ai.conversations.claim, args)).rejects.toThrow(
      /inaccessible/
    )

    // Le secret invité seul ne suffit plus ; le compte retrouve l'historique.
    await expect(
      t.query(api.ai.conversations.listMessages, args)
    ).rejects.toThrow(/inaccessible/)
    const messages = await alice.query(api.ai.conversations.listMessages, {
      conversationId: created.conversationId,
    })
    expect(messages.map((message) => message.content)).toEqual([
      "Je cherche mes billets.",
    ])
    const mine = await alice.query(api.ai.conversations.listMine, {})
    expect(mine.map((conversation) => conversation._id)).toEqual([
      created.conversationId,
    ])

    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("action"), "assistant_conversation.rattacher"))
        .collect()
    )
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      actorId: aliceId,
      entityId: created.conversationId,
    })
  })

  it("refuse une conversation close", async () => {
    const t = convexTest(schema, modules)
    await insertTraveler(t, "traveler-claim-closed")
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await t.mutation(api.ai.conversations.close, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    await expect(
      t
        .withIdentity({ subject: "traveler-claim-closed" })
        .mutation(api.ai.conversations.claim, {
          conversationId: created.conversationId,
          guestKey: GUEST_KEY,
        })
    ).rejects.toThrow(/terminée/)
  })

  it("ouvre les outils authentifiés et le contexte voyageur au tour suivant", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-claim")
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(openAIResponse({ output_text: "Bien sûr.", output: [] }))
    )
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    await insertTraveler(t, "traveler-claim-tools", {
      firstName: "Nadia",
      phone: "+241066000000",
    })
    const nadia = t.withIdentity({ subject: "traveler-claim-tools" })
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "tickets",
    })

    await nadia.action(api.ai.chat.sendMessage, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      requestId: "claim-before",
      content: "Où sont mes billets ?",
    })
    await nadia.mutation(api.ai.conversations.claim, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    await nadia.action(api.ai.chat.sendMessage, {
      conversationId: created.conversationId,
      requestId: "claim-after",
      content: "Et maintenant ?",
    })

    const [before, after] = openAIRequests(fetchMock)
    const beforeTools = before!.tools.map((tool) => tool.name)
    const afterTools = after!.tools.map((tool) => tool.name)
    expect(beforeTools).toContain("request_sign_in")
    expect(beforeTools).not.toContain("list_my_tickets")
    expect(afterTools).toContain("list_my_tickets")
    expect(afterTools).not.toContain("request_sign_in")
    expect(before!.instructions).not.toContain("Contexte voyageur authentifié")
    expect(after!.instructions).toContain("Contexte voyageur authentifié")
    expect(after!.instructions).toContain("+241066000000")
    // L'historique de la conversation invitée accompagne le tour connecté.
    expect(
      after!.input.some(
        (item) =>
          item.role === "user" && texteEntree(item) === "Où sont mes billets ?"
      )
    ).toBe(true)
  })
})

describe("outils exécutés pour l'acteur de la conversation", () => {
  it("lit le profil et les voyageurs du compte relié, sans jeton de session", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-thread-tools")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openAIResponse({
          output: [
            {
              type: "function_call",
              call_id: "profile-1",
              name: "get_my_profile",
              arguments: "{}",
            },
            {
              type: "function_call",
              call_id: "passengers-1",
              name: "list_saved_passengers",
              arguments: "{}",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({ output_text: "Je vous connais.", output: [] })
      )
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const userId = await insertTraveler(t, "traveler-tools", {
      firstName: "Paul",
      phone: "+241060000001",
    })
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
    const thread = await linkedThread(t, userId, "9301")

    // Aucune identité sur l'appel : c'est le fil relié qui fournit l'acteur.
    await t.action(internal.ai.chat.sendMessageFromThread, {
      conversationId: thread.conversationId,
      threadId: thread._id,
      requestId: "telegram:9301-1",
      content: "Que savez-vous de moi ?",
    })
    const [, continuation] = openAIRequests(fetchMock)
    const outputs = continuation!.input
      .filter((item) => item.type === "function_call_output")
      .map((item) => JSON.parse(item.output!))
    expect(outputs[0]).toMatchObject({
      firstName: "Paul",
      phone: "+241060000001",
    })
    expect(outputs[1]).toEqual([
      expect.objectContaining({ firstName: "Alice", lastName: "Mba" }),
    ])
  })

  it("propose la connexion à un invité et la retire au compte connecté", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-sign-in")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openAIResponse({
          output: [
            {
              type: "function_call",
              call_id: "sign-in-1",
              name: "request_sign_in",
              arguments: JSON.stringify({ reason: "retrouver vos billets" }),
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({
          output_text: "Connectez-vous pour retrouver vos billets.",
          output: [],
        })
      )
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const guest = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "tickets",
    })

    const result = await t.action(api.ai.chat.sendMessage, {
      conversationId: guest.conversationId,
      guestKey: GUEST_KEY,
      requestId: "sign-in-turn",
      content: "Je veux voir mes billets.",
    })
    expect(result.pendingApprovals).toEqual([])
    expect(result.clientActions).toEqual([
      { type: "request_sign_in", payload: { reason: "retrouver vos billets" } },
    ])

    await insertTraveler(t, "traveler-sign-in")
    const traveler = t.withIdentity({ subject: "traveler-sign-in" })
    const owned = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "tickets",
    })
    await expect(
      traveler.action(api.ai.tools.execute, {
        conversationId: owned.conversationId,
        callId: "sign-in-connected",
        name: "request_sign_in",
        input: { reason: "retrouver vos billets" },
      })
    ).resolves.toEqual({
      status: "error",
      message:
        "L'action « request_sign_in » n'est pas disponible dans ce contexte.",
    })
  })
})

describe("compléments du tour web", () => {
  it("injecte pageContext dans les instructions sans le stocker", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-page")
    const fetchMock = vi
      .fn()
      .mockResolvedValue(openAIResponse({ output_text: "D'accord.", output: [] }))
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const pageContext =
      "Page : résultats. Recherche : Owendo → Franceville, vendredi 2 octobre, 2 voyageurs."

    await t.action(api.ai.chat.sendMessage, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      requestId: "page-1",
      content: "Lequel part le plus tôt ?",
      pageContext,
    })
    const [request] = openAIRequests(fetchMock)
    expect(request!.instructions).toContain(JSON.stringify(pageContext))
    expect(JSON.stringify(request!.input)).not.toContain("Page : résultats")

    const stored = await t.run((ctx) =>
      ctx.db.query("assistantMessages").collect()
    )
    expect(stored.some((message) => message.content.includes("Page :"))).toBe(
      false
    )

    await expect(
      t.action(api.ai.chat.sendMessage, {
        conversationId: created.conversationId,
        guestKey: GUEST_KEY,
        requestId: "page-too-long",
        content: "Bonjour",
        pageContext: "x".repeat(601),
      })
    ).rejects.toThrow(/600 caractères/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("liste les tours terminés avec l'état courant de leurs confirmations", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-turns")
    const bookingInput = {
      tripId: "trip-1",
      originStationId: "station-1",
      destinationStationId: "station-2",
      serviceClass: "DEUXIEME",
      passengers: [
        {
          lastName: "Moussavou",
          firstName: "Ariane",
          gender: "F",
          discountCode: null,
        },
      ],
      contactPhone: "077000000",
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openAIResponse({
          output: [
            {
              type: "function_call",
              call_id: "turns-booking-1",
              name: "create_booking",
              arguments: JSON.stringify(bookingInput),
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({ output_text: "Je réserve ?", output: [] })
      )
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })
    await t.action(api.ai.chat.sendMessage, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      requestId: "turns-1",
      content: "Réserve pour Ariane.",
    })

    const open = await t.query(api.ai.conversations.listTurns, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    expect(open).toEqual([
      {
        requestId: "turns-1",
        createdAt: expect.any(Number),
        clientActions: [],
        pendingApprovals: [
          expect.objectContaining({
            callId: "turns-booking-1",
            toolName: "create_booking",
            label: "Réserver les places",
            input: bookingInput,
            status: "approval_required",
          }),
        ],
      },
    ])

    await t.action(api.ai.chat.rejectToolCall, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "turns-booking-1",
    })
    const closed = await t.query(api.ai.conversations.listTurns, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    expect(closed[0]!.pendingApprovals[0]!.status).toBe("rejected")

    await expect(
      t.query(api.ai.conversations.listTurns, {
        conversationId: created.conversationId,
        guestKey: OTHER_KEY,
      })
    ).rejects.toThrow(/inaccessible/)
  })
})
