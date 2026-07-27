/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import { toolResolutionMessage } from "./chat"

const GUEST_KEY = "guest-session-key-0123456789-abcdef"

function openAIResponse(body: unknown, status = 200) {
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

describe("orchestration du chat IA", () => {
  it("formule des confirmations déterministes sans dépendre du modèle", () => {
    expect(
      toolResolutionMessage("create_booking", { reference: "SET-2026-001" })
    ).toContain("Réservation SET-2026-001 créée")
    expect(
      toolResolutionMessage("pay_booking", {
        reference: "SET-2026-001",
        amountTtc: 25_000,
      })
    ).toBe(
      "Paiement de la réservation SET-2026-001 confirmé. Montant : 25 000 FCFA."
    )
    expect(toolResolutionMessage("revoke_consent", {})).toBe(
      "Votre consentement a été révoqué."
    )
  })

  it("mémorise une réponse et ressert le tour sans rappeler le fournisseur", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi.fn().mockResolvedValue(
      openAIResponse({
        output_text: "Bonjour, où souhaitez-vous aller ?",
        output: [],
        usage: { input_tokens: 12, output_tokens: 8 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "concierge",
    })
    const args = {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "chat-message-1",
      content: "  Je voudrais acheter un billet.  ",
    }

    const first = await t.action(api.ai.chat.sendMessage, args)
    const replay = await t.action(api.ai.chat.sendMessage, args)

    expect(first).toMatchObject({
      message: "Bonjour, où souhaitez-vous aller ?",
      provider: "openai",
      usage: { inputTokens: 12, outputTokens: 8 },
      cached: false,
    })
    expect(replay).toEqual({ ...first, cached: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(request.store).toBe(false)
    expect(request.input).toContainEqual({
      role: "user",
      content: "Je voudrais acheter un billet.",
    })

    const messages = await t.query(api.ai.conversations.listMessages, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ])
  })

  it("enchaîne un outil et renvoie une approbation structurée sans exécuter l'action", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const bookingInput = {
      tripId: "trip-1",
      originStationId: "station-owendo",
      destinationStationId: "station-ndende",
      serviceClass: "DEUXIEME",
      passengers: [
        {
          lastName: "Moussavou",
          firstName: "Ariane",
          gender: "F",
          phone: null,
          emergencyPhone: null,
          birthDate: null,
          nationality: null,
          documentNumber: null,
          discountCode: null,
          seatId: null,
        },
      ],
      contactPhone: "077000000",
      contactEmail: null,
      promoCode: null,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openAIResponse({
          output: [
            {
              type: "function_call",
              call_id: "booking-call-1",
              name: "create_booking",
              arguments: JSON.stringify(bookingInput),
            },
          ],
          usage: { input_tokens: 20, output_tokens: 5 },
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({
          output_text: "Confirmez-vous cette réservation ?",
          output: [],
          usage: { input_tokens: 25, output_tokens: 7 },
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })
    const result = await t.action(api.ai.chat.sendMessage, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "chat-booking-1",
      content: "Réserve ce trajet pour Ariane.",
    })

    expect(result.message).toBe("Confirmez-vous cette réservation ?")
    expect(result.pendingApprovals).toEqual([
      expect.objectContaining({
        callId: "booking-call-1",
        toolName: "create_booking",
        input: bookingInput,
      }),
    ])
    expect(result.usage).toEqual({ inputTokens: 45, outputTokens: 12 })

    const continuation = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    const toolResult = continuation.input.find(
      (item: { type?: string }) => item.type === "function_call_output"
    )
    expect(JSON.parse(toolResult.output)).toMatchObject({
      status: "approval_required",
      approval: { callId: "booking-call-1" },
    })

    const executions = await t.run((ctx) =>
      ctx.db.query("assistantToolExecutions").collect()
    )
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({
      callId: "booking-call-1",
      status: "approval_required",
    })
  })

  it("réinjecte les succès et erreurs d'outils dans le tour du fournisseur", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openAIResponse({
          output: [
            {
              type: "function_call",
              call_id: "stations-call",
              name: "list_stations",
              arguments: "{}",
            },
            {
              type: "function_call",
              call_id: "unknown-call",
              name: "outil_inconnu",
              arguments: "{}",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({
          output_text: "La gare d’Owendo est disponible.",
          output: [],
        })
      )
    vi.stubGlobal("fetch", fetchMock)

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
    const result = await t.action(api.ai.chat.sendMessage, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "chat-tools-mixed",
      content: "Quelles gares sont disponibles ?",
    })
    expect(result.message).toContain("Owendo")

    const continuation = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    const outputs = continuation.input
      .filter((item: { type?: string }) => item.type === "function_call_output")
      .map((item: { output: string }) => JSON.parse(item.output))
    expect(outputs[0]).toEqual([
      expect.objectContaining({ code: "OWE", name: "Owendo" }),
    ])
    expect(outputs[1]).toEqual({
      status: "error",
      message:
        "L'action « outil_inconnu » n'est pas disponible dans ce contexte.",
    })
  })

  it("retourne une réponse de repli lorsqu'une boucle d'outils n'aboutit pas", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi.fn()
    for (let step = 0; step < 6; step += 1) {
      fetchMock.mockResolvedValueOnce(
        openAIResponse({
          output: [
            {
              type: "function_call",
              call_id: `unknown-call-${step}`,
              name: "outil_inconnu",
              arguments: "{}",
            },
          ],
        })
      )
    }
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const result = await t.action(api.ai.chat.sendMessage, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "chat-tool-loop",
      content: "Fais quelque chose.",
    })

    expect(result.message).toBe(
      "Je n’ai pas pu terminer cette demande. Pouvez-vous la reformuler ?"
    )
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("refuse un tour déjà en cours et récupère un ancien message finalisé", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    await t.mutation(internal.ai.conversations.beginTurn, {
      conversationId: conversation.conversationId,
      requestId: "chat-running",
    })
    await expect(
      t.action(api.ai.chat.sendMessage, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: "chat-running",
        content: "Message concurrent",
      })
    ).rejects.toThrow(/déjà en cours de traitement/)

    await t.mutation(internal.ai.conversations.appendMessage, {
      conversationId: conversation.conversationId,
      role: "assistant",
      requestId: "chat-legacy",
      content: "Réponse historique",
      provider: "anthropic",
      model: "legacy-model",
    })
    const legacy = await t.action(api.ai.chat.sendMessage, {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "chat-legacy",
      content: "Message historique",
    })
    expect(legacy).toMatchObject({
      message: "Réponse historique",
      provider: "anthropic",
      model: "legacy-model",
      cached: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("applique la limite de messages successifs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        openAIResponse({
          output_text: "Réponse",
          output: [],
        })
      )
    )
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    for (let index = 0; index < 5; index += 1) {
      await t.action(api.ai.chat.sendMessage, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: `chat-rate-${index}`,
        content: `Message ${index}`,
      })
    }
    await expect(
      t.action(api.ai.chat.sendMessage, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: "chat-rate-blocked",
        content: "Encore un message",
      })
    ).rejects.toThrow(/Trop de messages successifs/)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it("refuse un message vide avant tout appel réseau et libère le tour pour un nouvel essai", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const args = {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "chat-empty-1",
      content: "   ",
    }

    await expect(t.action(api.ai.chat.sendMessage, args)).rejects.toThrow(
      /ne peut pas être vide/
    )
    await expect(t.action(api.ai.chat.sendMessage, args)).rejects.toThrow(
      /ne peut pas être vide/
    )
    expect(fetchMock).not.toHaveBeenCalled()

    const turns = await t.run((ctx) => ctx.db.query("assistantTurns").collect())
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      status: "failed",
      attempts: 2,
      error: "Le message ne peut pas être vide.",
    })
  })

  it("enregistre proprement l'échec lorsque la clé du fournisseur manque", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      provider: "openai",
    })

    await expect(
      t.action(api.ai.chat.sendMessage, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: "chat-no-key-1",
        content: "Quels trains partent demain ?",
      })
    ).rejects.toThrow(/OPENAI_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()

    const turns = await t.run((ctx) => ctx.db.query("assistantTurns").collect())
    expect(turns[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("OPENAI_API_KEY"),
    })
  })

  it("refuse les identifiants et messages hors limites", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-chat")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    await expect(
      t.action(api.ai.chat.sendMessage, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: "",
        content: "Bonjour",
      })
    ).rejects.toThrow(/Identifiant de message invalide/)
    await expect(
      t.action(api.ai.chat.sendMessage, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: "chat-too-long",
        content: "x".repeat(8_001),
      })
    ).rejects.toThrow(/limite de 8 000 caractères/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
