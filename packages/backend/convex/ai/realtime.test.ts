/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import { canonicalToolInput } from "./tools"

const GUEST_KEY = "guest-session-key-0123456789-abcdef"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sessions vocales OpenAI Realtime", () => {
  it("signale explicitement une fonctionnalité désactivée sans appeler OpenAI", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "false")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    const result = await t.action(api.ai.realtime.mintVoiceToken, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
    })

    expect(result).toEqual({ available: false, reason: "disabled" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("ne démarre aucune session lorsqu'aucune clé Realtime ou OpenAI n'est configurée", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "true")
    vi.stubEnv("AI_REALTIME_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    const result = await t.action(api.ai.realtime.mintVoiceToken, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
    })

    expect(result).toEqual({ available: false, reason: "not_configured" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("crée un secret éphémère, transmet les outils autorisés et journalise la session", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "true")
    vi.stubEnv("AI_REALTIME_API_KEY", "sk-test-realtime")
    vi.stubEnv("AI_REALTIME_MODEL", "gpt-realtime-test")
    vi.stubEnv("AI_REALTIME_VOICE", "coral")
    vi.stubEnv("AI_REALTIME_VAD", "semantic_vad")
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: "ek_test_ephemeral",
        expires_at: 1_900_000_000,
        session: { id: "sess_test_1", model: "gpt-realtime-active" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })
    const result = await t.action(api.ai.realtime.mintVoiceToken, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      voice: "voix-inconnue",
    })

    expect(result).toMatchObject({
      available: true,
      provider: "openai",
      transport: "webrtc",
      model: "gpt-realtime-active",
      voice: "coral",
      token: "ek_test_ephemeral",
      expiresAt: 1_900_000_000_000,
      sessionId: "sess_test_1",
    })
    if (!result.available) throw new Error("Session vocale attendue.")
    expect(result.tools.some((tool) => tool.name === "search_trips")).toBe(true)
    expect(
      result.tools.some((tool) => tool.name === "confirm_pending_action")
    ).toBe(false)
    const createBooking = result.tools.find(
      (tool) => tool.name === "create_booking"
    )
    expect(createBooking?.requiresApproval).toBe(false)
    expect(createBooking?.parameters.required).toContain("voiceAuthorization")
    expect(result.tools.some((tool) => tool.name === "list_my_tickets")).toBe(
      false
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets")
    expect(init.headers.Authorization).toBe("Bearer sk-test-realtime")
    expect(init.headers["OpenAI-Safety-Identifier"]).toMatch(/^[a-f0-9]{64}$/)
    const request = JSON.parse(init.body as string)
    expect(request).toMatchObject({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: "gpt-realtime-test",
        output_modalities: ["audio"],
        max_output_tokens: 180,
        audio: {
          input: {
            transcription: { language: "fr" },
            turn_detection: {
              type: "semantic_vad",
              interrupt_response: true,
            },
          },
          output: { voice: "coral" },
        },
      },
    })
    expect(request.session.instructions).toContain("# Parcours de réservation")
    expect(request.session.instructions).toContain(
      "Ne demande jamais une deuxième confirmation"
    )

    const sessions = await t.run((ctx) =>
      ctx.db.query("assistantVoiceSessions").collect()
    )
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      conversationId: conversation.conversationId,
      provider: "openai",
      providerSessionId: "sess_test_1",
      status: "created",
    })
  })

  it("transmet automatiquement le profil connecté dans les instructions Realtime", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "true")
    vi.stubEnv("AI_REALTIME_API_KEY", "sk-test-realtime")
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: "ek_test_ephemeral",
        session: { id: "sess_profile", model: "gpt-realtime-test" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-profile",
        firstName: "Paul",
        lastName: "Mba",
        phone: "+241060000000",
        email: "paul@example.ga",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    const traveler = t.withIdentity({ subject: "traveler-profile" })
    const conversation = await traveler.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })

    const result = await traveler.action(api.ai.realtime.mintVoiceToken, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
    })

    expect(result.available).toBe(true)
    const [, init] = fetchMock.mock.calls[0]!
    const request = JSON.parse(init.body as string)
    expect(request.session.instructions).toContain(
      "Contexte voyageur authentifié"
    )
    expect(request.session.instructions).toContain("+241060000000")
    expect(request.session.instructions).toContain(
      "Ne redemande jamais une information déjà présente"
    )
  })

  it("refuse une réponse OpenAI en erreur et ne persiste pas de session", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "true")
    vi.stubEnv("AI_REALTIME_API_KEY", "sk-test-realtime")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("service unavailable", {
          status: 503,
        })
      )
    )

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await expect(
      t.action(api.ai.realtime.mintVoiceToken, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
      })
    ).rejects.toThrow(/OpenAI Realtime \(503\).*service unavailable/)

    const sessions = await t.run((ctx) =>
      ctx.db.query("assistantVoiceSessions").collect()
    )
    expect(sessions).toEqual([])
  })

  it("refuse une réponse réussie qui ne contient pas de secret éphémère", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "true")
    vi.stubEnv("AI_REALTIME_API_KEY", "sk-test-realtime")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ session: { id: "sess-1" } }))
    )

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    await expect(
      t.action(api.ai.realtime.mintVoiceToken, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
      })
    ).rejects.toThrow(/n'a pas renvoyé de secret éphémère/)
  })

  it("applique la limite de démarrages vocaux", async () => {
    vi.stubEnv("AI_REALTIME_ENABLED", "true")
    vi.stubEnv("AI_REALTIME_API_KEY", "sk-test-realtime")
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          value: "ek_test_ephemeral",
          session: { id: "sess-rate" },
        })
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    for (let index = 0; index < 3; index += 1) {
      const grant = await t.action(api.ai.realtime.mintVoiceToken, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
      })
      expect(grant.available).toBe(true)
    }
    await expect(
      t.action(api.ai.realtime.mintVoiceToken, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
      })
    ).rejects.toThrow(/Trop de démarrages vocaux/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("met à jour uniquement une session appartenant à la conversation autorisée", async () => {
    const t = convexTest(schema, modules)
    const first = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const secondGuestKey = "other-session-key-0123456789-abcdef"
    const second = await t.mutation(api.ai.conversations.create, {
      guestKey: secondGuestKey,
    })
    const voiceSessionId = await t.mutation(
      internal.ai.realtime.recordVoiceSession,
      {
        conversationId: first.conversationId,
        model: "gpt-realtime-test",
      }
    )

    await expect(
      t.action(api.ai.realtime.updateVoiceSession, {
        conversationId: second.conversationId,
        guestKey: secondGuestKey,
        voiceSessionId,
        status: "connected",
      })
    ).rejects.toThrow(/Session vocale inaccessible/)

    await t.action(api.ai.realtime.updateVoiceSession, {
      conversationId: first.conversationId,
      guestKey: GUEST_KEY,
      voiceSessionId,
      status: "connected",
    })
    await t.action(api.ai.realtime.updateVoiceSession, {
      conversationId: first.conversationId,
      guestKey: GUEST_KEY,
      voiceSessionId,
      status: "ended",
    })
    const session = await t.run((ctx) => ctx.db.get(voiceSessionId))
    expect(session).toMatchObject({
      status: "ended",
      endedAt: expect.any(Number),
    })
  })

  it("exige une autorisation vocale puis consomme l'approbation en un seul appel", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })

    const missingAuthorization = await t.action(
      api.ai.realtime.executeVoiceTool,
      {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        callId: "voice-booking-without-authorization",
        name: "create_booking",
        input: {
          tripId: "trip-1",
          originStationId: "station-1",
          destinationStationId: "station-2",
          serviceClass: "DEUXIEME",
          passengers: [],
          contactPhone: "077000000",
        },
      }
    )
    expect(missingAuthorization).toEqual({
      status: "error",
      message:
        "La réservation attend encore l'autorisation vocale explicite du voyageur.",
    })
    expect(
      await t.query(internal.ai.tools.getExecution, {
        conversationId: conversation.conversationId,
        callId: "voice-booking-without-authorization",
      })
    ).toBeNull()

    const confirmed = await t.action(api.ai.realtime.executeVoiceTool, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      callId: "voice-booking-confirmed",
      name: "create_booking",
      input: {
        tripId: "trip-1",
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceClass: "DEUXIEME",
        passengers: [],
        contactPhone: "077000000",
        voiceAuthorization: "confirmed",
      },
    })
    expect(confirmed).toMatchObject({
      status: "error",
      message: "Au moins un voyageur est obligatoire.",
    })
    const execution = await t.query(internal.ai.tools.getExecution, {
      conversationId: conversation.conversationId,
      callId: "voice-booking-confirmed",
    })
    expect(execution).toMatchObject({
      status: "failed",
      approvedAt: expect.any(Number),
    })
  })

  it("ne rejoue pas une réservation vocale identique déjà réussie", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })
    const input = {
      tripId: "trip-1",
      originStationId: "station-1",
      destinationStationId: "station-2",
      serviceClass: "DEUXIEME",
      passengers: [
        {
          firstName: "Ariane",
          lastName: "Moussavou",
          gender: "F",
          discountCode: null,
        },
      ],
      contactPhone: "077000000",
      voiceAuthorization: "confirmed",
    }
    const prepared = await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: conversation.conversationId,
      callId: "voice-booking-original",
      toolName: "create_booking",
      inputJson: canonicalToolInput(input),
      requiresApproval: false,
      approved: false,
    })
    await t.mutation(internal.ai.tools.completeExecution, {
      executionId: prepared.execution._id,
      succeeded: true,
      outputJson: '{"reference":"SET-VOICE-1"}',
    })

    const replay = await t.action(api.ai.realtime.executeVoiceTool, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      callId: "voice-booking-replayed-with-new-call-id",
      name: "create_booking",
      input,
    })

    expect(replay).toMatchObject({
      status: "ok",
      cached: true,
      output: { reference: "SET-VOICE-1" },
    })
    expect(
      await t.query(internal.ai.tools.getExecution, {
        conversationId: conversation.conversationId,
        callId: "voice-booking-replayed-with-new-call-id",
      })
    ).toBeNull()
  })

  it("exécute les outils vocaux ordinaires par le même point sécurisé", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    await t.run((ctx) =>
      ctx.db.insert("stations", {
        code: "OWE",
        name: "Owendo",
        province: "Estuaire",
        kilometerPoint: 0,
        isEquipped: true,
        isActive: true,
      })
    )
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    const result = await t.action(api.ai.realtime.executeVoiceTool, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      callId: "voice-list-stations",
      name: "list_stations",
      input: {},
    })
    expect(result).toMatchObject({
      status: "ok",
      cached: false,
      output: [expect.objectContaining({ code: "OWE", name: "Owendo" })],
    })
  })
})
