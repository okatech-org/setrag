import { v } from "convex/values"
import { internal } from "../_generated/api"
import { action } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import { buildAssistantInstructions, getAssistantTools } from "./contracts"
import {
  createProviderSession,
  resolveTextProviderConfig,
  type ProviderToolResult,
} from "./providers"
import { assistantRateLimiter } from "./rateLimiter"
import { executeAssistantTool, type ToolExecutionResult } from "./tools"

type PendingApproval = {
  executionId: string
  callId: string
  toolName: string
  label: string
  input: unknown
}

type ChatResult = {
  message: string
  provider: string
  model: string
  pendingApprovals: PendingApproval[]
  clientActions: Array<{ type: string; payload: unknown }>
  usage: { inputTokens: number; outputTokens: number }
  cached: boolean
}

type RejectedToolCall = {
  status: "rejected"
  executionId: string
  callId: string
  message: string
}

const MAX_TOOL_STEPS = 6

function validateMessage(content: string): string {
  const clean = content.trim()
  if (!clean) throw new Error("Le message ne peut pas être vide.")
  if (clean.length > 8_000) {
    throw new Error("Le message dépasse la limite de 8 000 caractères.")
  }
  return clean
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Phrase stable utilisée par les interfaces après une confirmation différée. */
export function toolResolutionMessage(
  toolName: string,
  output: unknown
): string {
  const data = recordOf(output)
  const reference =
    typeof data.reference === "string" ? data.reference : undefined
  const amount =
    typeof data.amountTtc === "number"
      ? `${new Intl.NumberFormat("fr-FR").format(data.amountTtc)} FCFA`
      : undefined

  switch (toolName) {
    case "create_booking":
      return reference
        ? `Réservation ${reference} créée. Les places sont maintenant bloquées en attente du paiement.`
        : "La réservation a été créée."
    case "pay_booking":
      return [
        reference
          ? `Paiement de la réservation ${reference} confirmé.`
          : "Paiement confirmé.",
        amount ? `Montant : ${amount}.` : "",
      ]
        .filter(Boolean)
        .join(" ")
    case "cancel_booking":
      return reference
        ? `La réservation ${reference} a été annulée.`
        : "La réservation a été annulée."
    case "update_my_profile":
      return "Votre profil a été mis à jour."
    case "grant_consent":
      return "Votre consentement a été enregistré."
    case "revoke_consent":
      return "Votre consentement a été révoqué."
    default:
      return "L’action a bien été confirmée."
  }
}

export const sendMessage = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    requestId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args): Promise<ChatResult> => {
    if (!args.requestId || args.requestId.length > 200) {
      throw new Error("Identifiant de message invalide.")
    }
    const access = await ctx.runQuery(internal.ai.conversations.accessContext, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
    })
    const turn = await ctx.runMutation(internal.ai.conversations.beginTurn, {
      conversationId: args.conversationId,
      requestId: args.requestId,
    })
    if (turn.state === "completed" && turn.resultJson) {
      return {
        ...(JSON.parse(turn.resultJson) as ChatResult),
        cached: true,
      }
    }
    if (!turn.acquired) {
      throw new Error("Ce message est déjà en cours de traitement.")
    }

    try {
      const existing = await ctx.runQuery(
        internal.ai.conversations.messagesForRequest,
        {
          conversationId: args.conversationId,
          requestId: args.requestId,
        }
      )
      if (existing.assistant) {
        const legacyResult: ChatResult = {
          message: existing.assistant.content,
          provider: existing.assistant.provider ?? access.conversation.provider,
          model: existing.assistant.model ?? access.conversation.model,
          pendingApprovals: [],
          clientActions: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          cached: true,
        }
        await ctx.runMutation(internal.ai.conversations.completeTurn, {
          conversationId: args.conversationId,
          requestId: args.requestId,
          resultJson: JSON.stringify(legacyResult),
        })
        return legacyResult
      }

      const limit = await assistantRateLimiter.limit(ctx, "textMessage", {
        key: access.rateLimitKey,
      })
      if (!limit.ok) {
        throw new Error(
          `Trop de messages successifs. Réessayez dans ${Math.ceil((limit.retryAfter ?? 0) / 1_000)} seconde(s).`
        )
      }

      const content = validateMessage(args.content)
      if (!existing.user) {
        await ctx.runMutation(internal.ai.conversations.appendMessage, {
          conversationId: args.conversationId,
          role: "user",
          requestId: args.requestId,
          content,
        })
      }
      const storedHistory: Array<{ role: string; content: string }> =
        await ctx.runQuery(internal.ai.conversations.history, {
          conversationId: args.conversationId,
          limit: 30,
        })
      const messages = storedHistory
        .filter(
          (message) => message.role === "user" || message.role === "assistant"
        )
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        }))

      const resolved = resolveTextProviderConfig(
        access.conversation.assistantId,
        access.conversation.provider
      )
      const config = { ...resolved, model: access.conversation.model }
      const tools = getAssistantTools(
        access.conversation.assistantId,
        access.isAuthenticated
      )
      const session = createProviderSession({
        config,
        instructions: buildAssistantInstructions(
          access.conversation.assistantId,
          new Date().toISOString()
        ),
        messages,
        tools,
        safetyIdentifier: access.rateLimitKey,
      })

      const pendingApprovals: PendingApproval[] = []
      const clientActions: Array<{ type: string; payload: unknown }> = []
      let inputTokens = 0
      let outputTokens = 0
      let toolResults: ProviderToolResult[] | undefined
      let finalText = ""

      for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
        const response = await session.next(toolResults)
        inputTokens += response.inputTokens ?? 0
        outputTokens += response.outputTokens ?? 0
        if (response.toolCalls.length === 0) {
          finalText = response.text.trim()
          break
        }

        toolResults = []
        for (const call of response.toolCalls) {
          const result = await executeAssistantTool(ctx, {
            conversationId: args.conversationId,
            guestKey: args.guestKey,
            callId: call.callId,
            name: call.name,
            input: call.input,
          })
          if (result.status === "ok") {
            toolResults.push({ ...call, output: result.output })
            if (result.clientAction) {
              clientActions.push({
                type: result.clientAction,
                payload: result.output,
              })
            }
          } else if (result.status === "approval_required") {
            const approval = {
              executionId: result.executionId,
              callId: result.callId,
              toolName: result.toolName,
              label: result.label,
              input: result.input,
            }
            pendingApprovals.push(approval)
            toolResults.push({
              ...call,
              output: {
                status: "approval_required",
                message:
                  "Demande à l'utilisateur une confirmation explicite. L'interface affichera aussi une carte de confirmation.",
                approval,
              },
            })
          } else {
            toolResults.push({
              ...call,
              output: { status: "error", message: result.message },
            })
          }
        }
      }

      if (!finalText) {
        finalText =
          pendingApprovals.length > 0
            ? "J’ai besoin de votre confirmation avant de poursuivre."
            : "Je n’ai pas pu terminer cette demande. Pouvez-vous la reformuler ?"
      }
      await ctx.runMutation(internal.ai.conversations.appendMessage, {
        conversationId: args.conversationId,
        role: "assistant",
        requestId: args.requestId,
        content: finalText,
        provider: config.provider,
        model: config.model,
      })
      const result: ChatResult = {
        message: finalText,
        provider: config.provider,
        model: config.model,
        pendingApprovals,
        clientActions,
        usage: { inputTokens, outputTokens },
        cached: false,
      }
      await ctx.runMutation(internal.ai.conversations.completeTurn, {
        conversationId: args.conversationId,
        requestId: args.requestId,
        resultJson: JSON.stringify(result),
      })
      return result
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.replace(/\s+/g, " ").slice(0, 500)
          : "Échec du traitement du message."
      await ctx.runMutation(internal.ai.conversations.failTurn, {
        conversationId: args.conversationId,
        requestId: args.requestId,
        error: message,
      })
      throw error
    }
  },
})

/**
 * Confirme et exécute exactement l'appel mémorisé : le client ne peut pas
 * substituer d'autres arguments au moment où l'utilisateur appuie sur Oui.
 */
export const approveToolCall = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<ToolExecutionResult> => {
    await ctx.runQuery(internal.ai.conversations.accessContext, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
    })
    const execution: Doc<"assistantToolExecutions"> | null = await ctx.runQuery(
      internal.ai.tools.getExecution,
      {
        conversationId: args.conversationId,
        callId: args.callId,
      }
    )
    if (!execution) throw new Error("Confirmation introuvable.")
    const result = await executeAssistantTool(ctx, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
      callId: execution.callId,
      name: execution.toolName,
      input: JSON.parse(execution.inputJson),
      approved: true,
    })
    if (result.status === "ok") {
      await ctx.runMutation(internal.ai.conversations.appendMessageOnce, {
        conversationId: args.conversationId,
        role: "assistant",
        requestId: `approval:${execution.callId}`,
        content: toolResolutionMessage(execution.toolName, result.output),
      })
    }
    return result
  },
})

export const rejectToolCall = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<RejectedToolCall> => {
    await ctx.runQuery(internal.ai.conversations.accessContext, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
    })
    const execution: Doc<"assistantToolExecutions"> | null = await ctx.runQuery(
      internal.ai.tools.getExecution,
      {
        conversationId: args.conversationId,
        callId: args.callId,
      }
    )
    if (!execution) throw new Error("Confirmation introuvable.")
    await ctx.runMutation(internal.ai.tools.rejectExecution, {
      conversationId: args.conversationId,
      callId: args.callId,
    })
    const message = "Action annulée à votre demande."
    await ctx.runMutation(internal.ai.conversations.appendMessageOnce, {
      conversationId: args.conversationId,
      role: "assistant",
      requestId: `rejection:${execution.callId}`,
      content: message,
    })
    return {
      status: "rejected" as const,
      executionId: execution._id,
      callId: execution.callId,
      message,
    }
  },
})
