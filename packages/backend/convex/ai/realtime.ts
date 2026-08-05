import { v } from "convex/values"
import { internal } from "../_generated/api"
import { action, internalMutation, type ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import {
  buildAssistantInstructions,
  getAssistantTools,
  type AssistantToolDefinition,
} from "./contracts"
import { hashGuestKey } from "./conversations"
import { assistantRateLimiter } from "./rateLimiter"
import {
  canonicalToolInput,
  executeAssistantTool,
  type ToolExecutionResult,
} from "./tools"

const SUPPORTED_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const

type VoiceName = (typeof SUPPORTED_VOICES)[number]

type VoiceToolExecutionResult = ToolExecutionResult & {
  uiAction?: {
    type: "navigate"
    payload: { route: "/paiement" }
  }
}

type VoiceGrant =
  | {
      available: false
      reason: "not_configured" | "disabled"
    }
  | {
      available: true
      provider: "openai"
      transport: "webrtc"
      model: string
      voice: VoiceName
      token: string
      expiresAt: number | null
      url: string
      sessionId: string | null
      voiceSessionId: Id<"assistantVoiceSessions">
      tools: Array<{
        name: string
        label: string
        description: string
        parameters: Record<string, unknown>
        requiresApproval: boolean
      }>
    }

function resolveRealtimeConfig(requestedVoice?: string) {
  const enabled = process.env.AI_REALTIME_ENABLED !== "false"
  const apiKey =
    process.env.AI_REALTIME_API_KEY ?? process.env.OPENAI_API_KEY ?? ""
  const model = process.env.AI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini"
  const voice = SUPPORTED_VOICES.includes(requestedVoice as VoiceName)
    ? (requestedVoice as VoiceName)
    : SUPPORTED_VOICES.includes(process.env.AI_REALTIME_VOICE as VoiceName)
      ? (process.env.AI_REALTIME_VOICE as VoiceName)
      : "marin"
  return { enabled, apiKey, model, voice }
}

function turnDetection() {
  if (process.env.AI_REALTIME_VAD === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness: "auto",
      interrupt_response: true,
      create_response: true,
    }
  }
  return {
    type: "server_vad",
    threshold: 0.7,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
    interrupt_response: true,
    create_response: true,
  }
}

function voiceTool(tool: AssistantToolDefinition): AssistantToolDefinition {
  if (tool.name !== "create_booking") return tool
  return {
    ...tool,
    description:
      "Crée immédiatement la réservation après une autorisation vocale explicite. N'appelle cet outil qu'une seule fois, dans le même tour que le oui ou l'ordre clair de réserver.",
    // Dans le canal vocal, l'appel de l'outil après l'accord du voyageur est
    // la preuve d'intention. Le marqueur d'audit est ajouté côté serveur : le
    // modèle ne doit pas fabriquer un champ technique fragile.
    requiresApproval: false,
  }
}

export const recordVoiceSession = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    model: v.string(),
    providerSessionId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db.insert("assistantVoiceSessions", {
      conversationId: args.conversationId,
      provider: "openai",
      model: args.model,
      providerSessionId: args.providerSessionId,
      status: "created",
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    }),
})

export const setVoiceSessionStatus = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    voiceSessionId: v.id("assistantVoiceSessions"),
    status: v.union(
      v.literal("connected"),
      v.literal("ended"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.voiceSessionId)
    if (!session) throw new Error("Session vocale introuvable.")
    if (session.conversationId !== args.conversationId) {
      throw new Error("Session vocale inaccessible.")
    }
    await ctx.db.patch(session._id, {
      status: args.status,
      endedAt:
        args.status === "ended" || args.status === "failed"
          ? Date.now()
          : undefined,
    })
  },
})

/**
 * Crée un secret éphémère OpenAI. La clé API standard ne quitte jamais le
 * backend ; le navigateur/mobile reçoit uniquement le secret lié à la session.
 */
export const mintVoiceToken = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    voice: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VoiceGrant> => {
    const access = await ctx.runQuery(internal.ai.conversations.accessContext, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
    })
    const cfg = resolveRealtimeConfig(args.voice)
    if (!cfg.enabled) return { available: false, reason: "disabled" }
    if (!cfg.apiKey) return { available: false, reason: "not_configured" }

    const rate = await assistantRateLimiter.limit(ctx, "voiceSession", {
      key: access.rateLimitKey,
    })
    if (!rate.ok) {
      throw new Error(
        `Trop de démarrages vocaux. Réessayez dans ${Math.ceil((rate.retryAfter ?? 0) / 1_000)} seconde(s).`
      )
    }

    const tools = getAssistantTools(
      access.conversation.assistantId,
      access.isAuthenticated
    ).map(voiceTool)
    const instructions = `${buildAssistantInstructions(
      access.conversation.assistantId,
      new Date().toISOString(),
      access.travelerContext
    )}

# Rôle vocal
Conduis le voyageur jusqu'à une réservation prête à payer, avec le moins de paroles possible.

# Verbosité
- Réponse directe : une phrase courte.
- Question : une seule question courte à la fois.
- Résultat d'outil : donne uniquement le résultat utile et la prochaine question.
- Ne reformule pas tout ce que le voyageur vient de dire.
- Pas de préambule pour une recherche rapide, une correction, un refus ou une confirmation.
- L'interface affiche les horaires, le prix et le voyageur : ne récite pas toutes ces données oralement.

# Parcours de réservation
1. Recueille seulement le départ, l'arrivée, la date et le nombre de voyageurs manquants.
2. Recherche les trains et propose au maximum trois choix avec heure et prix utile.
3. Une fois le train, la classe, les voyageurs et le téléphone connus, calcule le devis.
4. Résume en une phrase le trajet et le montant, puis demande exactement une fois : « Je réserve ? »
5. Un « oui », « je confirme », « vas-y », « réserve », « fais la réservation » ou équivalent autorise la réservation. Si l'utilisateur avait déjà donné cet ordre après le récapitulatif, considère l'autorisation comme acquise.
6. Dès cette autorisation, appelle create_booking dans le même tour. Ne demande jamais une deuxième confirmation et ne parle jamais de confirmation dans l'interface.
7. Après le succès, annonce seulement que la réservation est créée et invite le voyageur à payer dans l'interface.

# Limites
- N'appelle jamais create_booking avant une autorisation vocale explicite.
- Une autorisation vaut uniquement pour la réservation récapitulée. Si les informations changent ensuite, demande une nouvelle autorisation.
- Ne propose et n'effectue jamais le paiement : le voyageur paie lui-même dans l'interface.`
    console.info("[ai.realtime] contexte voyageur préparé", {
      assistantId: access.conversation.assistantId,
      authenticated: access.isAuthenticated,
      profileHydrated: access.travelerContext !== null,
      hasPhone: Boolean(access.travelerContext?.profile.phone),
      savedPassengerCount: access.travelerContext?.savedPassengers.length ?? 0,
    })
    const realtimeTools = tools
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": hashGuestKey(access.rateLimitKey),
        },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: 600 },
          session: {
            type: "realtime",
            model: cfg.model,
            instructions,
            output_modalities: ["audio"],
            // Pas de max_output_tokens : un plafond coupe la voix en pleine
            // phrase. La brièveté est portée par les instructions.
            tool_choice: "auto",
            tools: realtimeTools.map((tool) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            })),
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24_000 },
                transcription: {
                  model: "gpt-4o-mini-transcribe",
                  language: "fr",
                  prompt:
                    "SETRAG, Transgabonais, Owendo, Franceville, Ndendé, Booué, Lastoursville.",
                },
                turn_detection: turnDetection(),
              },
              output: {
                format: { type: "audio/pcm", rate: 24_000 },
                voice: cfg.voice,
              },
            },
          },
        }),
      }
    )
    const body = await response.text()
    if (!response.ok) {
      throw new Error(
        `OpenAI Realtime (${response.status}) : ${body.slice(0, 1_000)}`
      )
    }
    const data = JSON.parse(body) as {
      value?: string
      expires_at?: number
      session?: { id?: string; model?: string }
    }
    if (!data.value) {
      throw new Error("OpenAI Realtime n'a pas renvoyé de secret éphémère.")
    }
    const expiresAt = data.expires_at ? data.expires_at * 1_000 : undefined
    const activeModel = data.session?.model ?? cfg.model
    const voiceSessionId = await ctx.runMutation(
      internal.ai.realtime.recordVoiceSession,
      {
        conversationId: args.conversationId,
        model: activeModel,
        providerSessionId: data.session?.id,
        expiresAt,
      }
    )
    return {
      available: true,
      provider: "openai",
      transport: "webrtc",
      model: activeModel,
      voice: cfg.voice,
      token: data.value,
      expiresAt: expiresAt ?? null,
      url: "https://api.openai.com/v1/realtime/calls",
      sessionId: data.session?.id ?? null,
      voiceSessionId,
      tools: realtimeTools.map((tool) => ({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        requiresApproval: tool.requiresApproval,
      })),
    }
  },
})

/**
 * Point d'exécution unique des appels de fonction reçus sur le DataChannel.
 * Le callId OpenAI sert de clé d'idempotence.
 */
export const executeVoiceTool = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    callId: v.string(),
    name: v.string(),
    input: v.any(),
    voiceSessionId: v.optional(v.id("assistantVoiceSessions")),
    approved: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<VoiceToolExecutionResult> => {
    const rawInput =
      args.input && typeof args.input === "object" && !Array.isArray(args.input)
        ? (args.input as Record<string, unknown>)
        : {}
    const executionArgs = { ...args, input: rawInput }

    if (args.name === "create_booking") {
      await ctx.runQuery(internal.ai.conversations.accessContext, {
        conversationId: args.conversationId,
        guestKey: args.guestKey,
      })
      const previous = await ctx.runQuery(
        internal.ai.tools.findSucceededExecution,
        {
          conversationId: args.conversationId,
          toolName: args.name,
          inputJson: canonicalToolInput(rawInput),
        }
      )
      if (previous) {
        return {
          status: "ok",
          executionId: previous._id,
          output: previous.outputJson ? JSON.parse(previous.outputJson) : null,
          clientAction: "show_booking",
          cached: true,
          uiAction: {
            type: "navigate",
            payload: { route: "/paiement" },
          },
        }
      }
    }

    const initial = await executeAssistantTool(ctx, executionArgs)
    if (args.name !== "create_booking") return initial
    if (initial.status === "ok") {
      return {
        ...initial,
        uiAction: {
          type: "navigate",
          payload: { route: "/paiement" },
        },
      }
    }
    if (initial.status !== "approval_required") return initial

    console.info("[ai.realtime] réservation vocale autorisée par l'appel d'outil", {
      conversationId: args.conversationId,
      callId: args.callId,
      toolName: args.name,
    })
    const result = await executeAssistantTool(ctx, {
      ...executionArgs,
      approved: true,
    })
    if (result.status !== "ok") return result
    return {
      ...result,
      uiAction: {
        type: "navigate",
        payload: { route: "/paiement" },
      },
    }
  },
})

export const updateVoiceSession = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    voiceSessionId: v.id("assistantVoiceSessions"),
    status: v.union(
      v.literal("connected"),
      v.literal("ended"),
      v.literal("failed")
    ),
  },
  handler: async (ctx: ActionCtx, args) => {
    await ctx.runQuery(internal.ai.conversations.accessContext, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
    })
    await ctx.runMutation(internal.ai.realtime.setVoiceSessionStatus, {
      conversationId: args.conversationId,
      voiceSessionId: args.voiceSessionId,
      status: args.status,
    })
    return { updated: true }
  },
})
