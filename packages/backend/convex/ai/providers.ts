/**
 * Fournisseurs de modèles texte de Ruban, via le Vercel AI SDK (v7).
 *
 * Le SDK ne sert qu'à parler aux fournisseurs (OpenAI Responses, Anthropic
 * Messages, Google Gemini) et à lire leurs flux. Un appel à `next()` est UNE
 * étape : `streamText` reçoit des outils sans `execute`, il s'arrête donc dès
 * que le modèle demande un outil. La boucle d'outils, le registre, le
 * dispatcher (idempotence par `callId`), les approbations et les contrôles
 * d'accès restent les nôtres (`chat.ts`, `tools.ts`) : le SDK ne décide
 * jamais d'exécuter quoi que ce soit.
 *
 * Tourne dans le runtime Convex par défaut (pas de "use node") : le SDK
 * n'utilise que `fetch` et les flux Web.
 */

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import {
  APICallError,
  InvalidToolInputError,
  jsonSchema,
  streamText,
  tool,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai"
import type {
  AssistantId,
  AssistantToolDefinition,
  TextProviderName,
} from "./contracts"

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

/** Un appel d'outil d'un tour passé, avec la sortie projetée déjà vue par le modèle. */
export type ReplayedToolCall = {
  callId: string
  name: string
  input: unknown
  output: unknown
}

/**
 * Appels d'outils d'un tour passé, rejoués avant la réponse de ce tour :
 * appel et résultat appariés par `callId` (voir `rejeu.ts`).
 */
export type ReplayedToolExchange = {
  role: "tools"
  calls: ReplayedToolCall[]
}

export type HistoryEntry = ChatMessage | ReplayedToolExchange

export type ProviderToolCall = {
  callId: string
  name: string
  input: unknown
}

export type ProviderToolResult = ProviderToolCall & {
  output: unknown
}

export type ProviderResponse = {
  /** Texte de cette étape (celui qui a été passé morceau par morceau à `onText`). */
  text: string
  toolCalls: ProviderToolCall[]
  inputTokens?: number
  outputTokens?: number
}

export type ProviderSession = {
  /**
   * Lance l'étape suivante. `results` porte les sorties des outils demandés à
   * l'étape précédente ; `onText` reçoit le texte au fil du flux.
   */
  next: (
    results?: ProviderToolResult[],
    onText?: (delta: string) => void | Promise<void>
  ) => Promise<ProviderResponse>
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

const PROVIDER_LABELS: Record<TextProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
}

/** Plafond de sortie d'Anthropic, qui l'exige à chaque appel. */
const ANTHROPIC_MAX_OUTPUT_TOKENS = 2_048

/**
 * Délais d'une étape. Un flux figé chez le fournisseur échoue au lieu de
 * tenir l'action jusqu'à sa limite de 10 minutes (qui laisserait la réponse
 * « en cours » sans erreur) : 60 s pour le premier contenu, 30 s entre deux
 * morceaux, 90 s en tout. Six étapes tiennent dans la limite de l'action.
 */
const DELAIS_ETAPE = { totalMs: 90_000, firstChunkMs: 60_000, chunkMs: 30_000 }

export function resolveTextProviderConfig(
  assistantId: AssistantId,
  requestedProvider?: TextProviderName
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

/**
 * Le modèle du fournisseur. La clé est toujours passée explicitement : le SDK
 * ne va jamais chercher lui-même une variable d'environnement (ses noms par
 * défaut, `GOOGLE_GENERATIVE_AI_API_KEY` par exemple, ne sont pas les nôtres).
 */
function createLanguageModel(config: TextProviderConfig): LanguageModel {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey }).responses(config.model)
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(config.model)
    case "google":
      return createGoogle({ apiKey: config.apiKey })(config.model)
  }
}

/**
 * Nos définitions d'outils, sans `execute` : le SDK transmet les schémas au
 * modèle et rend les appels, c'est tout. Le mode strict d'OpenAI est conservé.
 */
function toToolSet(
  tools: AssistantToolDefinition[],
  provider: TextProviderName
): ToolSet {
  return Object.fromEntries(
    tools.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema(
          definition.parameters as Parameters<typeof jsonSchema>[0]
        ),
        ...(provider === "openai" ? { strict: true } : {}),
      }),
    ])
  )
}

/** Valeur JSON pure, sans `undefined` ni prototype exotique. */
function jsonValue(value: unknown): JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JSONValue
}

function toolResultMessage(results: ProviderToolResult[]): ModelMessage {
  return {
    role: "tool",
    content: results.map((result) => ({
      type: "tool-result" as const,
      toolCallId: result.callId,
      toolName: result.name,
      output: { type: "json" as const, value: jsonValue(result.output) },
    })),
  }
}

/**
 * Gemini 3 exige une signature de pensée sur chaque appel d'outil rejoué ;
 * nos tours passés n'en gardent pas. Google documente cette valeur pour les
 * appels réinjectés par l'application. Les autres fournisseurs l'ignorent.
 */
const SIGNATURE_APPEL_REJOUE = {
  google: { thoughtSignature: "skip_thought_signature_validator" },
}

/**
 * L'historique stocké, au format du SDK. Un échange d'outils rejoué devient
 * un message assistant (les appels) suivi d'un message outil (les résultats),
 * appariés par `callId`.
 */
export function toModelMessages(history: HistoryEntry[]): ModelMessage[] {
  const messages: ModelMessage[] = []
  for (const entry of history) {
    if (entry.role === "tools") {
      if (entry.calls.length === 0) continue
      messages.push({
        role: "assistant",
        content: entry.calls.map((call) => ({
          type: "tool-call" as const,
          toolCallId: call.callId,
          toolName: call.name,
          input: jsonValue(call.input),
          providerOptions: SIGNATURE_APPEL_REJOUE,
        })),
      })
      messages.push(toolResultMessage(entry.calls))
      continue
    }
    messages.push({ role: entry.role, content: entry.content })
  }
  return messages
}

/** Enveloppe une erreur levée par `onText`, pour ne pas la confondre. */
class StreamWriteError extends Error {
  constructor(readonly cause: unknown) {
    super("Écriture du flux impossible.")
  }
}

/** Échec d'une étape chez le fournisseur, déjà mis en forme. */
export class ProviderError extends Error {
  /** Statut HTTP du fournisseur, quand il y en a un. */
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ProviderError"
    this.status = status
  }
}

/**
 * Une erreur de fournisseur, lisible et bornée : `OpenAI (429) : <corps>`.
 * Le corps est tronqué à 1 000 caractères, jamais la clé n'y figure.
 */
export function providerError(
  provider: TextProviderName,
  error: unknown
): ProviderError {
  if (error instanceof ProviderError) return error
  const label = PROVIDER_LABELS[provider]
  if (APICallError.isInstance(error)) {
    const body = (error.responseBody ?? error.message).slice(0, 1_000)
    return new ProviderError(
      `${label} (${error.statusCode ?? "?"}) : ${body}`,
      error.statusCode
    )
  }
  const message =
    error instanceof Error ? error.message : String(error ?? "erreur inconnue")
  return new ProviderError(`${label} : ${message.slice(0, 1_000)}`)
}

/** Réglages propres à chaque fournisseur, identiques aux appels écrits à la main. */
function callSettings(params: {
  config: TextProviderConfig
  instructions: string
  safetyIdentifier?: string
}) {
  switch (params.config.provider) {
    case "openai":
      // Les consignes restent le champ `instructions` de l'API Responses et
      // rien n'est conservé chez OpenAI (`store: false`). L'identifiant de
      // sécurité est une empreinte opaque (`safetyIdentifierFor`).
      return {
        providerOptions: {
          openai: {
            store: false,
            instructions: params.instructions,
            ...(params.safetyIdentifier
              ? { safetyIdentifier: params.safetyIdentifier }
              : {}),
          },
        },
      }
    case "anthropic":
      return {
        instructions: params.instructions,
        maxOutputTokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
      }
    case "google":
      return { instructions: params.instructions }
  }
}

export function createProviderSession(params: {
  config: TextProviderConfig
  instructions: string
  messages: HistoryEntry[]
  tools: AssistantToolDefinition[]
  /** Empreinte opaque de l'appelant (`safetyIdentifierFor`), jamais un identifiant brut. */
  safetyIdentifier?: string
}): ProviderSession {
  const { config } = params
  if (!config.apiKey) {
    throw new Error(
      `${PROVIDER_KEYS[config.provider]} n'est pas configurée sur le déploiement Convex.`
    )
  }
  const model = createLanguageModel(config)
  const tools = toToolSet(params.tools, config.provider)
  const settings = callSettings(params)
  const messages = toModelMessages(params.messages)
  // Réponse de l'étape précédente, telle que le SDK l'a reconstruite : elle
  // porte ce que le fournisseur exige de retrouver à l'étape suivante
  // (raisonnement chiffré d'OpenAI, signatures de pensée de Gemini…).
  let previousAssistant: ModelMessage[] = []

  return {
    async next(results, onText) {
      if (results) {
        messages.push(...previousAssistant, toolResultMessage(results))
        previousAssistant = []
      }
      const result = streamText({
        model,
        messages: [...messages],
        tools,
        toolChoice: "auto",
        // Une erreur remonte telle quelle : le voyageur relance, sans attente
        // silencieuse ni second appel facturé.
        maxRetries: 0,
        timeout: DELAIS_ETAPE,
        // Les erreurs sont lues dans le flux et levées ci-dessous.
        onError: () => undefined,
        ...settings,
      })

      let text = ""
      const toolCalls: ProviderToolCall[] = []
      let inputTokens: number | undefined
      let outputTokens: number | undefined
      try {
        for await (const part of result.stream) {
          switch (part.type) {
            case "text-delta":
              if (part.text) {
                text += part.text
                try {
                  await onText?.(part.text)
                } catch (cause) {
                  throw new StreamWriteError(cause)
                }
              }
              break
            case "tool-call":
              // Arguments illisibles : comme avant, le tour échoue plutôt que
              // d'exécuter une action sur une entrée devinée. Un outil
              // inconnu, lui, part au dispatcher, qui répond au modèle.
              if (
                part.invalid === true &&
                InvalidToolInputError.isInstance(part.error)
              ) {
                throw new ProviderError(
                  "Le modèle a produit des arguments d'outil invalides."
                )
              }
              toolCalls.push({
                callId: part.toolCallId,
                name: part.toolName,
                input: part.input ?? {},
              })
              break
            case "finish-step":
              inputTokens = (inputTokens ?? 0) + (part.usage.inputTokens ?? 0)
              outputTokens =
                (outputTokens ?? 0) + (part.usage.outputTokens ?? 0)
              break
            case "error":
              throw providerError(config.provider, part.error)
            case "abort":
              throw new ProviderError(
                `${PROVIDER_LABELS[config.provider]} : réponse interrompue.`
              )
          }
        }
      } catch (error) {
        // Une erreur de `onText` (écriture du flux) n'est pas celle du
        // fournisseur : elle remonte telle quelle.
        if (error instanceof StreamWriteError) throw error.cause
        throw providerError(config.provider, error)
      }

      const step = await result.finalStep
      // Seul le message assistant est repris : les résultats d'outils sont
      // toujours les nôtres, jamais ceux que le SDK aurait produits (par
      // exemple pour un outil inconnu).
      previousAssistant = step.response.messages.filter(
        (message) => message.role === "assistant"
      )
      return { text, toolCalls, inputTokens, outputTokens }
    },
  }
}
