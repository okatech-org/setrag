/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import { toolResolutionMessage } from "./chat"
import {
  corpsEnvoyes,
  evenementsOpenAI,
  reponseOpenAI,
  texteEntree,
  type CorpsOpenAI,
} from "./fournisseurs.test-utils"

const GUEST_KEY = "guest-session-key-0123456789-abcdef"

/** Réponse OpenAI en flux, décrite comme l'ancienne réponse JSON. */
function openAIResponse(body: CorpsOpenAI) {
  return reponseOpenAI(body)
}

type EntreeResponses = {
  role?: string
  type?: string
  call_id?: string
  name?: string
  arguments?: string
  output?: string
  content?: string | Array<{ type?: string; text?: string }>
}

function requetes(fetchMock: ReturnType<typeof vi.fn>) {
  return corpsEnvoyes<{ input: EntreeResponses[]; store?: boolean }>(
    fetchMock.mock.calls
  )
}

/**
 * Flux piloté par le test : chaque événement part quand le test le décide,
 * pour observer la réponse pendant qu'elle s'écrit.
 */
function fluxPilote() {
  const encodeur = new TextEncoder()
  let controleur!: ReadableStreamDefaultController<Uint8Array>
  const corps = new ReadableStream<Uint8Array>({
    start(controller) {
      controleur = controller
    },
  })
  return {
    reponse: new Response(corps, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    envoyer(evenements: unknown[]) {
      for (const evenement of evenements) {
        controleur.enqueue(
          encodeur.encode(`data: ${JSON.stringify(evenement)}\n\n`)
        )
      }
    },
    fermer() {
      controleur.close()
    },
    couper(erreur: Error) {
      controleur.error(erreur)
    },
  }
}

/** Attend qu'une condition soit vraie, en laissant tourner l'action. */
async function attendre(condition: () => Promise<boolean>) {
  for (let essai = 0; essai < 200; essai += 1) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("Condition jamais atteinte.")
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
    ).toBe(
      "Réservation SET-2026-001 créée : vos places sont tenues 15 minutes. Prochaine étape : le paiement."
    )
    // La civilité donnée pour le titulaire complète son profil : on le dit.
    expect(
      toolResolutionMessage("create_booking", {
        reference: "SET-2026-001",
        civiliteEnregistree: "M",
      })
    ).toContain("Votre civilité est désormais enregistrée dans votre profil.")
    expect(
      toolResolutionMessage("pay_booking", {
        reference: "SET-2026-001",
        amountTtc: 25_000,
      })
    ).toBe(
      "Paiement de la réservation SET-2026-001 confirmé. Montant : 25 000 FCFA. Vos billets sont émis."
    )
    // Aucune confirmation ne redemande le feu vert qu'elle vient de recevoir.
    for (const tool of ["create_booking", "pay_booking", "cancel_booking"]) {
      expect(toolResolutionMessage(tool, { reference: "SET-1" })).not.toMatch(
        /\?|voulez-vous|souhaitez-vous/i
      )
    }
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

    const [request] = requetes(fetchMock)
    expect(request!.store).toBe(false)
    expect(
      request!.input.some(
        (item) =>
          item.role === "user" &&
          texteEntree(item) === "Je voudrais acheter un billet."
      )
    ).toBe(true)

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

describe("réponse écrite au fil du flux", () => {
  const TEXTE = "L'Express 201 part demain à 07:40 d'Owendo, arrivée 19:10."

  async function preparer() {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-flux")
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const conversation = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const args = {
      conversationId: conversation.conversationId,
      guestKey: GUEST_KEY,
      requestId: "flux-1",
      content: "Un train pour Franceville demain ?",
    }
    const lire = () =>
      t.query(api.ai.conversations.getReply, {
        conversationId: conversation.conversationId,
        guestKey: GUEST_KEY,
        requestId: "flux-1",
      })
    const reponsesDeRuban = async () =>
      (
        await t.query(api.ai.conversations.listMessages, {
          conversationId: conversation.conversationId,
          guestKey: GUEST_KEY,
        })
      ).filter((message) => message.role === "assistant")
    return { t, args, lire, reponsesDeRuban }
  }

  it("rend le texte visible pendant qu'il s'écrit, puis le termine dans le même message", async () => {
    const flux = fluxPilote()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(flux.reponse))
    const { t, args, lire, reponsesDeRuban } = await preparer()
    const evenements = evenementsOpenAI({
      output_text: TEXTE,
      usage: { input_tokens: 30, output_tokens: 14 },
    }) as Array<{ type: string }>
    const premierMorceau = evenements.findIndex(
      (evenement) => evenement.type === "response.output_text.delta"
    )

    const tour = t.action(api.ai.chat.sendMessage, args)
    flux.envoyer(evenements.slice(0, premierMorceau + 1))
    await attendre(async () => ((await lire())?.content ?? "") !== "")

    // Le premier morceau est écrit tout de suite, le reste pas encore.
    const partiel = await lire()
    expect(partiel).toMatchObject({ status: "en_cours", error: null })
    expect(TEXTE.startsWith(partiel!.content)).toBe(true)
    expect(partiel!.content.length).toBeLessThan(TEXTE.length)

    flux.envoyer(evenements.slice(premierMorceau + 1))
    flux.fermer()
    const resultat = await tour
    expect(resultat).toMatchObject({
      message: TEXTE,
      usage: { inputTokens: 30, outputTokens: 14 },
    })
    await expect(lire()).resolves.toEqual({
      content: TEXTE,
      status: "termine",
      error: null,
    })
    // Un seul message de Ruban pour le tour : celui qui s'est écrit.
    expect(await reponsesDeRuban()).toHaveLength(1)
  })

  it("garde le texte partiel et un libellé clair si le fournisseur coupe, puis relance dans le même message", async () => {
    const flux = fluxPilote()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(flux.reponse)
      .mockResolvedValueOnce(openAIResponse({ output_text: TEXTE }))
    vi.stubGlobal("fetch", fetchMock)
    const { t, args, lire, reponsesDeRuban } = await preparer()
    const evenements = evenementsOpenAI({ output_text: TEXTE }) as Array<{
      type: string
    }>
    const premierMorceau = evenements.findIndex(
      (evenement) => evenement.type === "response.output_text.delta"
    )

    const tour = t.action(api.ai.chat.sendMessage, args)
    flux.envoyer(evenements.slice(0, premierMorceau + 2))
    await attendre(async () => ((await lire())?.content ?? "") !== "")
    flux.couper(new Error("connexion perdue"))
    await expect(tour).rejects.toThrow(/OpenAI/)

    const interrompue = await lire()
    expect(interrompue).toMatchObject({
      status: "erreur",
      error: "La réponse de Ruban a été interrompue. Relancez votre question.",
    })
    // Tout ce qui a été reçu reste affiché, rien de plus.
    expect(interrompue!.content.length).toBeGreaterThan(0)
    expect(TEXTE.startsWith(interrompue!.content)).toBe(true)
    const [tourEchoue] = await t.run((ctx) =>
      ctx.db.query("assistantTurns").collect()
    )
    expect(tourEchoue).toMatchObject({ status: "failed" })
    // Le détail technique reste sur le tour, jamais à l'écran.
    expect(tourEchoue!.error).toContain("OpenAI")

    // Relance : même question, même message, texte réécrit depuis le début.
    const relance = await t.action(api.ai.chat.sendMessage, args)
    expect(relance.message).toBe(TEXTE)
    await expect(lire()).resolves.toEqual({
      content: TEXTE,
      status: "termine",
      error: null,
    })
    expect(await reponsesDeRuban()).toHaveLength(1)
    // L'historique du second essai ne contient pas la réponse interrompue.
    const [, second] = requetes(fetchMock)
    expect(
      second!.input.filter((item) => item.role === "assistant")
    ).toHaveLength(0)
  })

  it("ne montre rien de la réponse à un autre visiteur, sans lever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(openAIResponse({ output_text: "Bonjour." }))
    )
    const { t, args } = await preparer()
    await t.action(api.ai.chat.sendMessage, args)
    // Le site s'y abonne depuis la coquille : une conversation devenue
    // inaccessible rend `null` plutôt que de faire tomber la page.
    await expect(
      t.query(api.ai.conversations.getReply, {
        conversationId: args.conversationId,
        guestKey: "other-session-key-0123456789-abcdef",
        requestId: args.requestId,
      })
    ).resolves.toBeNull()
  })

  it("dans une messagerie, n'écrit rien en route et n'envoie que la conclusion", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-fil")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openAIResponse({
          output_text: "Je regarde les gares.",
          output: [
            {
              type: "function_call",
              call_id: "stations-fil",
              name: "list_stations",
              arguments: "{}",
            },
          ],
        })
      )
      .mockResolvedValueOnce(openAIResponse({ output_text: "Owendo est ouverte." }))
    vi.stubGlobal("fetch", fetchMock)
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const thread = await t.mutation(internal.messaging.core.ensureThread, {
      channel: "telegram",
      externalThreadId: "5501",
      externalUserId: "5501",
      guestKey: "channel-key-5501-0123456789-abcdef",
    })
    const lectures: string[] = []
    const lire = async () => {
      const messages = await t.run((ctx) =>
        ctx.db.query("assistantMessages").collect()
      )
      for (const message of messages.filter((m) => m.role === "assistant")) {
        lectures.push(`${message.status}:${message.content}`)
      }
    }
    const resultat = await t.action(internal.ai.chat.sendMessageFromThread, {
      conversationId: thread.conversationId,
      threadId: thread._id,
      requestId: "telegram:5501-1",
      content: "Quelles gares ?",
    })
    await lire()
    // Comme avant le flux : la seule conclusion part vers le fil.
    expect(resultat.message).toBe("Owendo est ouverte.")
    expect(lectures).toEqual(["termine:Owendo est ouverte."])
  })
})

describe("résultats d'outils rejoués d'un tour à l'autre", () => {
  const bookingInput = {
    tripId: "trip-1",
    originStationId: "station-owendo",
    destinationStationId: "station-franceville",
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

  async function preparer() {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-rejeu")
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
    return { t, conversationId: conversation.conversationId }
  }

  function appelsEtSorties(input: EntreeResponses[]) {
    return {
      appels: input
        .filter((item) => item.type === "function_call")
        .map((item) => ({ callId: item.call_id, name: item.name })),
      sorties: Object.fromEntries(
        input
          .filter((item) => item.type === "function_call_output")
          .map((item) => [item.call_id, JSON.parse(item.output!)])
      ),
    }
  }

  it("rejoue l'appel et sa sortie projetée, et le modèle n'a pas à relancer l'outil", async () => {
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
          ],
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({ output_text: "La gare d’Owendo est ouverte." })
      )
      .mockResolvedValueOnce(openAIResponse({ output_text: "Oui, Owendo." }))
    vi.stubGlobal("fetch", fetchMock)
    const { t, conversationId } = await preparer()

    await t.action(api.ai.chat.sendMessage, {
      conversationId,
      guestKey: GUEST_KEY,
      requestId: "rejeu-1",
      content: "Quelles gares ?",
    })
    await t.action(api.ai.chat.sendMessage, {
      conversationId,
      guestKey: GUEST_KEY,
      requestId: "rejeu-2",
      content: "Owendo, c'est bien Libreville ?",
    })

    const [, , deuxiemeTour] = requetes(fetchMock)
    expect(
      deuxiemeTour!.input.map((item) => item.type ?? item.role)
    ).toEqual([
      "user",
      "function_call",
      "function_call_output",
      "assistant",
      "user",
    ])
    const { appels, sorties } = appelsEtSorties(deuxiemeTour!.input)
    expect(appels).toEqual([{ callId: "stations-call", name: "list_stations" }])
    expect(sorties["stations-call"]).toEqual([
      expect.objectContaining({ code: "OWE", name: "Owendo" }),
    ])

    const tours = await t.run((ctx) =>
      ctx.db.query("assistantTurns").collect()
    )
    const premier = tours.find((tour) => tour.requestId === "rejeu-1")
    expect(premier!.toolCalls).toEqual([
      expect.objectContaining({
        callId: "stations-call",
        toolName: "list_stations",
        status: "ok",
        actorKey: "invite",
      }),
    ])
  })

  it("garde ouverte la carte pendant une autre question, puis ne rejoue au compte que les données publiques", async () => {
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
              call_id: "booking-call",
              name: "create_booking",
              arguments: JSON.stringify(bookingInput),
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        openAIResponse({ output_text: "Confirmez sur la carte." })
      )
      .mockImplementation(() =>
        Promise.resolve(openAIResponse({ output_text: "Bien sûr." }))
      )
    vi.stubGlobal("fetch", fetchMock)
    const { t, conversationId } = await preparer()

    const premier = await t.action(api.ai.chat.sendMessage, {
      conversationId,
      guestKey: GUEST_KEY,
      requestId: "carte-1",
      content: "Réserve pour Ariane.",
    })
    expect(premier.pendingApprovals).toHaveLength(1)

    // Une question pendant que la carte est ouverte : le modèle relit la
    // confirmation comme toujours ouverte, et elle le reste.
    await t.action(api.ai.chat.sendMessage, {
      conversationId,
      guestKey: GUEST_KEY,
      requestId: "carte-2",
      content: "Le train a-t-il une voiture-bar ?",
    })
    const [, , pendantLaCarte] = requetes(fetchMock)
    const rejeu = appelsEtSorties(pendantLaCarte!.input)
    expect(rejeu.appels.map((appel) => appel.callId)).toEqual([
      "stations-call",
      "booking-call",
    ])
    expect(rejeu.sorties["booking-call"]).toMatchObject({
      status: "approval_required",
    })
    const tours = await t.query(api.ai.conversations.listTurns, {
      conversationId,
      guestKey: GUEST_KEY,
    })
    expect(tours[0]!.pendingApprovals[0]).toMatchObject({
      callId: "booking-call",
      status: "approval_required",
    })

    // Le visiteur se connecte et rattache la conversation : le compte relit
    // les gares, pas la réservation préparée par l'invité.
    await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "traveler-rejeu",
        firstName: "Ariane",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      })
    )
    const ariane = t.withIdentity({ subject: "traveler-rejeu" })
    await ariane.mutation(api.ai.conversations.claim, {
      conversationId,
      guestKey: GUEST_KEY,
    })
    await ariane.action(api.ai.chat.sendMessage, {
      conversationId,
      requestId: "carte-3",
      content: "Et maintenant ?",
    })
    const [, , , apresRattachement] = requetes(fetchMock)
    const rejeuCompte = appelsEtSorties(apresRattachement!.input)
    expect(rejeuCompte.appels.map((appel) => appel.callId)).toEqual([
      "stations-call",
    ])
    expect(JSON.stringify(apresRattachement!.input)).not.toContain(
      "Moussavou"
    )
  })
})
