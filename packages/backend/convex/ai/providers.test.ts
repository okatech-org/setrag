import { afterEach, describe, expect, it, vi } from "vitest"
import { ASSISTANT_TOOLS } from "./contracts"
import {
  corpsEnvoyes,
  reponseAnthropic,
  reponseGemini,
  reponseOpenAI,
} from "./fournisseurs.test-utils"
import {
  createProviderSession,
  publicProviderConfig,
  resolveTextProviderConfig,
  toModelMessages,
} from "./providers"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type CorpsResponses = {
  instructions?: string
  store?: boolean
  safety_identifier?: string
  stream?: boolean
  input: Array<{
    role?: string
    type?: string
    call_id?: string
    name?: string
    arguments?: string
    output?: string
    content?: unknown
  }>
  tools: Array<{ name: string; strict?: boolean }>
}

const LIST_STATIONS = ASSISTANT_TOOLS[0]!

describe("configuration des fournisseurs texte", () => {
  it("résout le fournisseur, le modèle et la clé propres à chaque assistant", () => {
    vi.stubEnv("AI_TEXT_PROVIDER", "google")
    vi.stubEnv("AI_BOOKING_PROVIDER", "anthropic")
    vi.stubEnv("AI_BOOKING_MODEL", "claude-booking-test")
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key")

    const config = resolveTextProviderConfig("booking")
    expect(config).toEqual({
      provider: "anthropic",
      model: "claude-booking-test",
      apiKey: "anthropic-test-key",
    })
    expect(publicProviderConfig(config)).toEqual({
      provider: "anthropic",
      model: "claude-booking-test",
      configured: true,
    })
  })

  it("garde les modèles par défaut et les clés de nos variables", () => {
    vi.stubEnv("AI_TEXT_PROVIDER", "")
    vi.stubEnv("GEMINI_API_KEY", "gemini-key")
    vi.stubEnv("OPENAI_API_KEY", "openai-key")
    expect(resolveTextProviderConfig("concierge", "google")).toEqual({
      provider: "google",
      model: "gemini-3.5-flash",
      apiKey: "gemini-key",
    })
    expect(resolveTextProviderConfig("concierge", "openai")).toMatchObject({
      model: "gpt-5.6-luna",
      apiKey: "openai-key",
    })
  })

  it("refuse un fournisseur inconnu et une clé absente", () => {
    vi.stubEnv("AI_ACCOUNT_PROVIDER", "provider-inconnu")
    expect(() => resolveTextProviderConfig("account")).toThrow(
      /Fournisseur texte non supporté/
    )

    vi.stubEnv("AI_ACCOUNT_PROVIDER", "openai")
    vi.stubEnv("OPENAI_API_KEY", "")
    const config = resolveTextProviderConfig("account")
    expect(publicProviderConfig(config).configured).toBe(false)
    expect(() =>
      createProviderSession({
        config,
        instructions: "Test",
        messages: [],
        tools: [],
        safetyIdentifier: "safe-user",
      })
    ).toThrow(/OPENAI_API_KEY n'est pas configurée/)
  })
})

describe("OpenAI Responses par le SDK", () => {
  it("diffuse le texte par morceaux et compte les jetons", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reponseOpenAI({
        output_text: "Bonjour Ariane, où souhaitez-vous aller demain ?",
        usage: { input_tokens: 12, output_tokens: 9 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Consignes de test",
      messages: [{ role: "user", content: "Bonjour" }],
      tools: [LIST_STATIONS],
      safetyIdentifier: "safe-user",
    })

    const morceaux: string[] = []
    const reponse = await session.next(undefined, (delta) => {
      morceaux.push(delta)
    })
    expect(reponse.text).toBe("Bonjour Ariane, où souhaitez-vous aller demain ?")
    expect(morceaux.length).toBeGreaterThan(1)
    expect(morceaux.join("")).toBe(reponse.text)
    expect(reponse).toMatchObject({
      toolCalls: [],
      inputTokens: 12,
      outputTokens: 9,
    })

    // Même requête qu'avant le SDK : consignes en `instructions`, rien de
    // conservé chez OpenAI, identifiant de sécurité opaque, schémas stricts.
    const [requete] = corpsEnvoyes<CorpsResponses>(fetchMock.mock.calls)
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.openai.com/v1/responses"
    )
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >
    expect(headers.authorization ?? headers.Authorization).toBe("Bearer secret")
    expect(requete).toMatchObject({
      instructions: "Consignes de test",
      store: false,
      safety_identifier: "safe-user",
      stream: true,
    })
    expect(requete!.tools[0]).toMatchObject({
      name: "list_stations",
      strict: true,
    })
  })

  it("enchaîne un function_call avec son résultat, apparié par call_id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseOpenAI({
          output: [
            {
              type: "function_call",
              call_id: "call-1",
              name: "list_stations",
              arguments: "{}",
            },
          ],
          usage: { input_tokens: 10, output_tokens: 4 },
        })
      )
      .mockResolvedValueOnce(
        reponseOpenAI({ output_text: "Voici les gares disponibles." })
      )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Quelles gares ?" }],
      tools: [LIST_STATIONS],
    })

    const first = await session.next()
    expect(first.toolCalls).toEqual([
      { callId: "call-1", name: "list_stations", input: {} },
    ])
    const second = await session.next([
      { ...first.toolCalls[0]!, output: [{ id: "station-1", name: "Owendo" }] },
    ])
    expect(second.text).toContain("gares")

    const [, suite] = corpsEnvoyes<CorpsResponses>(fetchMock.mock.calls)
    expect(suite!.input).toContainEqual(
      expect.objectContaining({
        type: "function_call",
        call_id: "call-1",
        name: "list_stations",
      })
    )
    const sortie = suite!.input.find(
      (item) => item.type === "function_call_output"
    )
    expect(sortie?.call_id).toBe("call-1")
    expect(JSON.parse(sortie!.output!)).toEqual([
      { id: "station-1", name: "Owendo" },
    ])
  })

  it("passe au dispatcher l'appel d'un outil inconnu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reponseOpenAI({
          output: [
            {
              type: "function_call",
              call_id: "call-inconnu",
              name: "outil_inconnu",
              arguments: "{}",
            },
          ],
        })
      )
    )
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Test" }],
      tools: [LIST_STATIONS],
    })
    await expect(session.next()).resolves.toMatchObject({
      toolCalls: [{ callId: "call-inconnu", name: "outil_inconnu", input: {} }],
    })
  })

  it("rejette des arguments illisibles et un appel incomplet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        reponseOpenAI({
          output: [
            {
              type: "function_call",
              call_id: "call-invalid",
              name: "list_stations",
              arguments: "{",
            },
          ],
        })
      )
    )
    const invalide = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Test" }],
      tools: [LIST_STATIONS],
    })
    await expect(invalide.next()).rejects.toThrow(
      /arguments d'outil invalides/
    )

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        reponseOpenAI({
          output: [
            { type: "function_call", call_id: "call-incomplete", arguments: "{}" },
          ],
        })
      )
    )
    const incomplet = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Test" }],
      tools: [LIST_STATIONS],
    })
    await expect(incomplet.next()).rejects.toThrow(/^OpenAI/)
  })

  it("remonte une erreur HTTP avec un corps borné, sans nouvel essai", async () => {
    const longBody = "x".repeat(1_500)
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(longBody, { status: 429 }))
      )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Test" }],
      tools: [],
    })

    let error: unknown
    try {
      await session.next()
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("OpenAI (429)")
    expect((error as Error).message).toContain("x".repeat(1_000))
    expect((error as Error).message).not.toContain("x".repeat(1_001))
    expect((error as { status?: number }).status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejoue un échange d'outils passé : appel et résultat appariés par callId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reponseOpenAI({ output_text: "Toujours à 07:40." }))
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [
        { role: "user", content: "Des trains demain ?" },
        {
          role: "tools",
          calls: [
            {
              callId: "search-1",
              name: "search_trips",
              input: { originStationId: "a", destinationStationId: "b" },
              output: { trips: [{ trainNumber: "201", departureTime: "07:40" }] },
            },
          ],
        },
        { role: "assistant", content: "L'Express 201 part à 07:40." },
        { role: "user", content: "À quelle heure déjà ?" },
      ],
      tools: [],
    })
    await session.next()

    const [requete] = corpsEnvoyes<CorpsResponses>(fetchMock.mock.calls)
    const types = requete!.input.map((item) => item.type ?? item.role)
    expect(types).toEqual([
      "user",
      "function_call",
      "function_call_output",
      "assistant",
      "user",
    ])
    const appel = requete!.input.find((item) => item.type === "function_call")
    const resultat = requete!.input.find(
      (item) => item.type === "function_call_output"
    )
    expect(appel).toMatchObject({ call_id: "search-1", name: "search_trips" })
    // Rejoué sans identifiant d'élément : OpenAI n'attend pas de raisonnement.
    expect(appel).not.toHaveProperty("id")
    expect(resultat?.call_id).toBe("search-1")
    expect(JSON.parse(resultat!.output!)).toEqual({
      trips: [{ trainNumber: "201", departureTime: "07:40" }],
    })
  })
})

describe("Anthropic Messages par le SDK", () => {
  it("diffuse la réponse avec les consignes en système et un plafond de sortie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reponseAnthropic({
        text: "Quel jour partez-vous ?",
        usage: { input_tokens: 8, output_tokens: 6 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "anthropic", model: "test-anthropic", apiKey: "secret" },
      instructions: "Consignes Anthropic",
      messages: [{ role: "user", content: "Je veux voyager." }],
      tools: [LIST_STATIONS],
    })

    const morceaux: string[] = []
    const response = await session.next(undefined, (delta) => {
      morceaux.push(delta)
    })
    expect(response.text).toBe("Quel jour partez-vous ?")
    expect(morceaux.length).toBeGreaterThan(1)
    expect(response.inputTokens).toBe(8)
    expect(response.outputTokens).toBe(6)
    expect(response.toolCalls).toEqual([])

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.anthropic.com/v1/messages"
    )
    const [corps] = corpsEnvoyes<{
      system: Array<{ text: string }> | string
      max_tokens: number
    }>(fetchMock.mock.calls, "https://api.anthropic.com/")
    expect(JSON.stringify(corps!.system)).toContain("Consignes Anthropic")
    expect(corps!.max_tokens).toBe(2_048)
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >
    expect(headers["x-api-key"]).toBe("secret")
  })

  it("enchaîne un tool_use avec son tool_result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseAnthropic({
          toolUses: [{ id: "toolu-1", name: "list_stations", input: {} }],
        })
      )
      .mockResolvedValueOnce(reponseAnthropic({ text: "Owendo est disponible." }))
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "anthropic", model: "test-anthropic", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Liste les gares." }],
      tools: [LIST_STATIONS],
    })

    const first = await session.next()
    expect(first.toolCalls).toEqual([
      { callId: "toolu-1", name: "list_stations", input: {} },
    ])
    const second = await session.next([
      { ...first.toolCalls[0]!, output: [{ name: "Owendo" }] },
    ])
    expect(second.text).toContain("Owendo")

    const [, suite] = corpsEnvoyes<{
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }>(fetchMock.mock.calls, "https://api.anthropic.com/")
    const dernier = suite!.messages[suite!.messages.length - 1]!
    expect(dernier.role).toBe("user")
    expect(dernier.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu-1",
    })
    expect(JSON.stringify(dernier.content[0])).toContain("Owendo")
    expect(suite!.messages[suite!.messages.length - 2]!.content).toContainEqual(
      expect.objectContaining({ type: "tool_use", id: "toolu-1" })
    )
  })
})

describe("Google Gemini par le SDK", () => {
  it("diffuse la réponse et passe la clé dans l'en-tête", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reponseGemini({
        text: "Je recherche les horaires.",
        usage: { promptTokenCount: 7, candidatesTokenCount: 5 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "google", model: "test-google", apiKey: "secret" },
      instructions: "Consignes Gemini",
      messages: [{ role: "user", content: "Demain pour Ndendé." }],
      tools: [LIST_STATIONS],
    })

    const response = await session.next()
    expect(response.text).toBe("Je recherche les horaires.")
    expect(response.outputTokens).toBe(5)
    expect(response.toolCalls).toEqual([])

    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain("models/test-google:streamGenerateContent")
    expect(url).not.toContain("secret")
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >
    expect(headers["x-goog-api-key"]).toBe("secret")
    const [corps] = corpsEnvoyes<{ systemInstruction: unknown }>(
      fetchMock.mock.calls,
      "https://generativelanguage.googleapis.com/"
    )
    expect(JSON.stringify(corps!.systemInstruction)).toContain("Consignes Gemini")
  })

  it("enchaîne un functionCall avec sa functionResponse", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseGemini({ functionCalls: [{ name: "list_stations", args: {} }] })
      )
      .mockResolvedValueOnce(reponseGemini({ text: "Voici Owendo." }))
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "google", model: "test-google", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Liste les gares." }],
      tools: [LIST_STATIONS],
    })

    const first = await session.next()
    expect(first.toolCalls).toEqual([
      { callId: expect.any(String), name: "list_stations", input: {} },
    ])
    const second = await session.next([
      { ...first.toolCalls[0]!, output: [{ name: "Owendo" }] },
    ])
    expect(second.text).toBe("Voici Owendo.")

    const [, suite] = corpsEnvoyes<{
      contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>
    }>(fetchMock.mock.calls, "https://generativelanguage.googleapis.com/")
    const dernier = suite!.contents[suite!.contents.length - 1]!
    expect(dernier.role).toBe("user")
    expect(dernier.parts[0]).toMatchObject({
      functionResponse: { name: "list_stations" },
    })
    expect(JSON.stringify(dernier.parts[0])).toContain("Owendo")
  })
})

describe("historique au format du SDK", () => {
  it("rejoue un échange d'outils en appel puis résultat, avec la signature de rejeu de Gemini", () => {
    const messages = toModelMessages([
      { role: "user", content: "Des trains ?" },
      {
        role: "tools",
        calls: [
          { callId: "c-1", name: "list_stations", input: {}, output: [{ id: "s" }] },
        ],
      },
      { role: "assistant", content: "Voici." },
      { role: "tools", calls: [] },
    ])
    expect(messages).toEqual([
      { role: "user", content: "Des trains ?" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "c-1",
            toolName: "list_stations",
            input: {},
            providerOptions: {
              google: { thoughtSignature: "skip_thought_signature_validator" },
            },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c-1",
            toolName: "list_stations",
            output: { type: "json", value: [{ id: "s" }] },
          },
        ],
      },
      { role: "assistant", content: "Voici." },
    ])
  })
})
