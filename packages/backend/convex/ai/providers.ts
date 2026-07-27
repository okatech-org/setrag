import type {
  AssistantId,
  AssistantToolDefinition,
  TextProviderName,
} from "./contracts"

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type ProviderToolCall = {
  callId: string
  name: string
  input: unknown
}

export type ProviderToolResult = ProviderToolCall & {
  output: unknown
}

export type ProviderResponse = {
  text: string
  toolCalls: ProviderToolCall[]
  inputTokens?: number
  outputTokens?: number
}

export type ProviderSession = {
  next: (results?: ProviderToolResult[]) => Promise<ProviderResponse>
}

export type TextProviderConfig = {
  provider: TextProviderName
  model: string
  apiKey: string
}

const DEFAULT_MODELS: Record<TextProviderName, string> = {
  openai: "gpt-5.6-luna",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-3.5-flash",
}

const PROVIDER_KEYS: Record<TextProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
}

export function resolveTextProviderConfig(
  assistantId: AssistantId,
  requestedProvider?: TextProviderName,
): TextProviderConfig {
  const assistantPrefix = `AI_${assistantId.toUpperCase()}`
  const rawProvider =
    requestedProvider ??
    process.env[`${assistantPrefix}_PROVIDER`] ??
    process.env.AI_TEXT_PROVIDER ??
    "openai"
  if (!["openai", "anthropic", "google"].includes(rawProvider)) {
    throw new Error(`Fournisseur texte non supporté : "${rawProvider}".`)
  }
  const provider = rawProvider as TextProviderName
  const model =
    process.env[`${assistantPrefix}_MODEL`] ??
    process.env[`AI_${provider.toUpperCase()}_MODEL`] ??
    process.env.AI_TEXT_MODEL ??
    DEFAULT_MODELS[provider]
  return {
    provider,
    model,
    apiKey: process.env[PROVIDER_KEYS[provider]] ?? "",
  }
}

export function publicProviderConfig(config: TextProviderConfig) {
  return {
    provider: config.provider,
    model: config.model,
    configured: config.apiKey.length > 0,
  }
}

function parseJsonArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error("Le modèle a produit des arguments d'outil invalides.")
  }
}

function errorBody(provider: string, response: Response, body: string): Error {
  const safeBody = body.slice(0, 1_000)
  return new Error(`${provider} (${response.status}) : ${safeBody}`)
}

export function createProviderSession(params: {
  config: TextProviderConfig
  instructions: string
  messages: ChatMessage[]
  tools: AssistantToolDefinition[]
  safetyIdentifier: string
}): ProviderSession {
  const { config } = params
  if (!config.apiKey) {
    throw new Error(
      `${PROVIDER_KEYS[config.provider]} n'est pas configurée sur le déploiement Convex.`,
    )
  }
  switch (config.provider) {
    case "openai":
      return createOpenAISession(params)
    case "anthropic":
      return createAnthropicSession(params)
    case "google":
      return createGoogleSession(params)
  }
}

function createOpenAISession(params: {
  config: TextProviderConfig
  instructions: string
  messages: ChatMessage[]
  tools: AssistantToolDefinition[]
  safetyIdentifier: string
}): ProviderSession {
  type OpenAIOutputItem = {
    type?: string
    call_id?: string
    name?: string
    arguments?: string
    content?: Array<{ type?: string; text?: string }>
  }
  const input: unknown[] = params.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
  let previousOutput: OpenAIOutputItem[] = []

  return {
    async next(results) {
      if (results) {
        input.push(...previousOutput)
        input.push(
          ...results.map((result) => ({
            type: "function_call_output",
            call_id: result.callId,
            output: JSON.stringify(result.output),
          })),
        )
      }
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.config.apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": params.safetyIdentifier,
        },
        body: JSON.stringify({
          model: params.config.model,
          instructions: params.instructions,
          input,
          store: false,
          tool_choice: "auto",
          tools: params.tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: true,
          })),
        }),
      })
      const body = await response.text()
      if (!response.ok) throw errorBody("OpenAI", response, body)
      const data = JSON.parse(body) as {
        output?: OpenAIOutputItem[]
        output_text?: string
        usage?: {
          input_tokens?: number
          output_tokens?: number
        }
      }
      previousOutput = data.output ?? []
      const text =
        data.output_text ??
        previousOutput
          .flatMap((item) => item.content ?? [])
          .filter((part) => part.type === "output_text")
          .map((part) => part.text ?? "")
          .join("")
      const toolCalls = previousOutput
        .filter((item) => item.type === "function_call")
        .map((item) => {
          if (!item.call_id || !item.name) {
            throw new Error("Appel d'outil OpenAI incomplet.")
          }
          return {
            callId: item.call_id,
            name: item.name,
            input: parseJsonArguments(item.arguments),
          }
        })
      return {
        text,
        toolCalls,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      }
    },
  }
}

function createAnthropicSession(params: {
  config: TextProviderConfig
  instructions: string
  messages: ChatMessage[]
  tools: AssistantToolDefinition[]
  safetyIdentifier: string
}): ProviderSession {
  const messages: Array<{ role: "user" | "assistant"; content: unknown }> =
    params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))
  let previousContent: unknown[] = []

  return {
    async next(results) {
      if (results) {
        messages.push({ role: "assistant", content: previousContent })
        messages.push({
          role: "user",
          content: results.map((result) => ({
            type: "tool_result",
            tool_use_id: result.callId,
            content: JSON.stringify(result.output),
          })),
        })
      }
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": params.config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.config.model,
          max_tokens: 2_048,
          system: params.instructions,
          messages,
          tools: params.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          })),
        }),
      })
      const body = await response.text()
      if (!response.ok) throw errorBody("Anthropic", response, body)
      const data = JSON.parse(body) as {
        content?: Array<{
          type?: string
          text?: string
          id?: string
          name?: string
          input?: unknown
        }>
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      previousContent = data.content ?? []
      const text = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
      const toolCalls = (data.content ?? [])
        .filter((block) => block.type === "tool_use")
        .map((block) => {
          if (!block.id || !block.name) {
            throw new Error("Appel d'outil Anthropic incomplet.")
          }
          return {
            callId: block.id,
            name: block.name,
            input: block.input ?? {},
          }
        })
      return {
        text,
        toolCalls,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      }
    },
  }
}

function createGoogleSession(params: {
  config: TextProviderConfig
  instructions: string
  messages: ChatMessage[]
  tools: AssistantToolDefinition[]
  safetyIdentifier: string
}): ProviderSession {
  const contents: Array<{ role: string; parts: unknown[] }> =
    params.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }))
  let previousModelContent: { role: string; parts: unknown[] } | undefined

  return {
    async next(results) {
      if (results) {
        if (previousModelContent) contents.push(previousModelContent)
        contents.push({
          role: "user",
          parts: results.map((result) => ({
            functionResponse: {
              name: result.name,
              response: { output: result.output },
            },
          })),
        })
      }
      const model = encodeURIComponent(params.config.model)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(params.config.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: params.instructions }] },
            contents,
            tools: [
              {
                functionDeclarations: params.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                })),
              },
            ],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          }),
        },
      )
      const body = await response.text()
      if (!response.ok) throw errorBody("Google Gemini", response, body)
      const data = JSON.parse(body) as {
        candidates?: Array<{
          content?: {
            role?: string
            parts?: Array<{
              text?: string
              functionCall?: { name?: string; args?: unknown }
            }>
          }
        }>
        usageMetadata?: {
          promptTokenCount?: number
          candidatesTokenCount?: number
        }
      }
      const content = data.candidates?.[0]?.content
      const parts = content?.parts ?? []
      previousModelContent = {
        role: content?.role ?? "model",
        parts,
      }
      const text = parts.map((part) => part.text ?? "").join("")
      const toolCalls = parts
        .filter((part) => part.functionCall)
        .map((part, index) => {
          const name = part.functionCall?.name
          if (!name) throw new Error("Appel d'outil Gemini incomplet.")
          return {
            callId: `gemini_${Date.now()}_${index}_${name}`,
            name,
            input: part.functionCall?.args ?? {},
          }
        })
      return {
        text,
        toolCalls,
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      }
    },
  }
}
