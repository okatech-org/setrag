import { afterEach, describe, expect, it, vi } from "vitest"
import { ASSISTANT_TOOLS } from "./contracts"
import {
  createProviderSession,
  publicProviderConfig,
  resolveTextProviderConfig,
} from "./providers"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("adaptateurs de fournisseurs texte", () => {
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

  it("enchaîne un function_call OpenAI avec son résultat", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                call_id: "call-1",
                name: "list_stations",
                arguments: "{}",
              },
            ],
            usage: { input_tokens: 10, output_tokens: 4 },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: "Voici les gares disponibles.",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Voici les gares disponibles.",
                  },
                ],
              },
            ],
          }),
          { status: 200 }
        )
      )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Quelles gares ?" }],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })

    const first = await session.next()
    expect(first.toolCalls).toEqual([
      { callId: "call-1", name: "list_stations", input: {} },
    ])
    const second = await session.next([
      {
        ...first.toolCalls[0]!,
        output: [{ id: "station-1", name: "Owendo" }],
      },
    ])
    expect(second.text).toContain("gares")

    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    expect(secondBody.input).toContainEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: JSON.stringify([{ id: "station-1", name: "Owendo" }]),
    })
    expect(secondBody.tools[0].strict).toBe(true)
  })

  it("rejette les arguments JSON invalides et les appels OpenAI incomplets", async () => {
    const invalidJson = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                call_id: "call-invalid",
                name: "list_stations",
                arguments: "{",
              },
            ],
          }),
          { status: 200 }
        )
      )
    )
    await expect(invalidJson.next()).rejects.toThrow(
      /arguments d'outil invalides/
    )

    const incomplete = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                call_id: "call-incomplete",
                arguments: "{}",
              },
            ],
          }),
          { status: 200 }
        )
      )
    )
    await expect(incomplete.next()).rejects.toThrow(
      /Appel d'outil OpenAI incomplet/
    )
  })

  it("recompose le texte OpenAI depuis les blocs de sortie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  { type: "output_text", text: "Bonjour " },
                  { type: "metadata", text: "ignoré" },
                  { type: "output_text", text: "Ariane." },
                ],
              },
            ],
          }),
          { status: 200 }
        )
      )
    )
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [],
      tools: [],
      safetyIdentifier: "safe-user",
    })
    await expect(session.next()).resolves.toMatchObject({
      text: "Bonjour Ariane.",
      toolCalls: [],
    })
  })

  it("remonte une erreur HTTP fournisseur avec un corps borné", async () => {
    const longBody = "x".repeat(1_500)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(longBody, { status: 429 }))
    )
    const session = createProviderSession({
      config: { provider: "openai", model: "test-openai", apiKey: "secret" },
      instructions: "Test",
      messages: [],
      tools: [],
      safetyIdentifier: "safe-user",
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
  })

  it("normalise une réponse Anthropic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Quel jour partez-vous ?" }],
            usage: { input_tokens: 8, output_tokens: 6 },
          }),
          { status: 200 }
        )
      )
    )
    const session = createProviderSession({
      config: {
        provider: "anthropic",
        model: "test-anthropic",
        apiKey: "secret",
      },
      instructions: "Test",
      messages: [{ role: "user", content: "Je veux voyager." }],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })

    const response = await session.next()
    expect(response.text).toBe("Quel jour partez-vous ?")
    expect(response.inputTokens).toBe(8)
    expect(response.toolCalls).toEqual([])
  })

  it("enchaîne un tool_use Anthropic avec un tool_result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "toolu-1",
                name: "list_stations",
                input: {},
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Owendo est disponible." }],
          }),
          { status: 200 }
        )
      )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: {
        provider: "anthropic",
        model: "test-anthropic",
        apiKey: "secret",
      },
      instructions: "Test",
      messages: [{ role: "user", content: "Liste les gares." }],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })

    const first = await session.next()
    expect(first.toolCalls).toEqual([
      { callId: "toolu-1", name: "list_stations", input: {} },
    ])
    const second = await session.next([
      { ...first.toolCalls[0]!, output: [{ name: "Owendo" }] },
    ])
    expect(second.text).toContain("Owendo")

    const body = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    expect(body.messages.at(-1)).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu-1",
          content: JSON.stringify([{ name: "Owendo" }]),
        },
      ],
    })
  })

  it("rejette un appel d'outil Anthropic incomplet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "toolu-incomplete",
                input: {},
              },
            ],
          }),
          { status: 200 }
        )
      )
    )
    const session = createProviderSession({
      config: {
        provider: "anthropic",
        model: "test-anthropic",
        apiKey: "secret",
      },
      instructions: "Test",
      messages: [],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })
    await expect(session.next()).rejects.toThrow(
      /Appel d'outil Anthropic incomplet/
    )
  })

  it("normalise une réponse Gemini", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Je recherche les horaires." }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 7,
              candidatesTokenCount: 5,
            },
          }),
          { status: 200 }
        )
      )
    )
    const session = createProviderSession({
      config: { provider: "google", model: "test-google", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Demain pour Ndendé." }],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })

    const response = await session.next()
    expect(response.text).toContain("horaires")
    expect(response.outputTokens).toBe(5)
    expect(response.toolCalls).toEqual([])
  })

  it("enchaîne un functionCall Gemini avec sa functionResponse", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    {
                      functionCall: { name: "list_stations", args: {} },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Voici Owendo." }],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    vi.stubGlobal("fetch", fetchMock)
    const session = createProviderSession({
      config: { provider: "google", model: "test-google", apiKey: "secret" },
      instructions: "Test",
      messages: [{ role: "user", content: "Liste les gares." }],
      tools: [ASSISTANT_TOOLS[0]!],
      safetyIdentifier: "safe-user",
    })

    const first = await session.next()
    expect(first.toolCalls).toEqual([
      {
        callId: "gemini_1700000000000_0_list_stations",
        name: "list_stations",
        input: {},
      },
    ])
    const second = await session.next([
      { ...first.toolCalls[0]!, output: [{ name: "Owendo" }] },
    ])
    expect(second.text).toBe("Voici Owendo.")

    const body = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    expect(body.contents.at(-1)).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "list_stations",
            response: { output: [{ name: "Owendo" }] },
          },
        },
      ],
    })
  })
})
