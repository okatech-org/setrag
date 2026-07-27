import { v } from "convex/values"
import { internal } from "../_generated/api"
import { action, internalMutation, type ActionCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { buildAssistantInstructions, getAssistantTools } from "./contracts"
import { hashGuestKey } from "./conversations"
import { assistantRateLimiter } from "./rateLimiter"
import { executeAssistantTool, type ToolExecutionResult } from "./tools"

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
    )
    const instructions = `${buildAssistantInstructions(
      access.conversation.assistantId,
      new Date().toISOString()
    )}

Règles vocales :
- lorsqu'un outil renvoie approval_required, demande oralement confirmation ;
- si l'utilisateur confirme clairement, appelle confirm_pending_action avec le callId indiqué par ce résultat ;
- ne réappelle pas l'outil métier avec de nouveaux arguments ;
- pour une réservation, recueille les informations manquantes une par une, calcule le devis, puis arrête-toi après create_booking ;
- le voyageur effectue toujours lui-même le paiement dans l'interface.`
    const confirmTool = {
      name: "confirm_pending_action",
      label: "Confirmer l'action en attente",
      description:
        "Confirme exactement une action en attente après un oui explicite de l'utilisateur.",
      parameters: {
        type: "object" as const,
        properties: {
          callId: {
            type: "string",
            description:
              "callId exact renvoyé dans le résultat approval_required.",
          },
        },
        required: ["callId"],
        additionalProperties: false as const,
      },
      requiresApproval: false,
    }
    const realtimeTools = [...tools, confirmTool]
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
    approved: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ToolExecutionResult> => {
    if (args.name !== "confirm_pending_action") {
      return executeAssistantTool(ctx, args)
    }
    await ctx.runQuery(internal.ai.conversations.accessContext, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
    })
    const input =
      args.input && typeof args.input === "object" && !Array.isArray(args.input)
        ? (args.input as Record<string, unknown>)
        : {}
    const pendingCallId = input.callId
    if (typeof pendingCallId !== "string" || !pendingCallId) {
      return {
        status: "error",
        message: "Identifiant de confirmation invalide.",
      }
    }
    const execution: Doc<"assistantToolExecutions"> | null = await ctx.runQuery(
      internal.ai.tools.getExecution,
      {
        conversationId: args.conversationId,
        callId: pendingCallId,
      }
    )
    if (!execution) {
      return { status: "error", message: "Action en attente introuvable." }
    }
    return executeAssistantTool(ctx, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
      callId: execution.callId,
      name: execution.toolName,
      input: JSON.parse(execution.inputJson),
      approved: true,
    })
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
