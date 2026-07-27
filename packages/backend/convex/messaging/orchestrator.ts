import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import { internalAction, type ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { toolResolutionMessage } from "../ai/chat"
import {
  CHANNEL_CAPABILITIES,
  deriveApprovalToken,
  deriveChannelSecret,
  splitMessage,
  type OutboundButton,
} from "./contracts"

function safeError(error: unknown): string {
  return (
    error instanceof Error
      ? error.message
      : "Le traitement du message a échoué."
  )
    .replace(/\s+/g, " ")
    .slice(0, 500)
}

function extractDocuments(
  actions: Array<{ type: string; payload: unknown }>
): Array<{ url: string; filename: string; caption?: string }> {
  const documents: Array<{
    url: string
    filename: string
    caption?: string
  }> = []
  for (const action of actions) {
    if (
      action.type !== "download_ticket" ||
      !action.payload ||
      typeof action.payload !== "object" ||
      Array.isArray(action.payload)
    ) {
      continue
    }
    const url = (action.payload as Record<string, unknown>).url
    if (typeof url === "string" && url.startsWith("https://")) {
      documents.push({
        url,
        filename: "billet-setrag.pdf",
        caption: "Votre billet SETRAG",
      })
    }
  }
  return documents
}

async function enqueueText(
  ctx: ActionCtx,
  args: {
    channel: "telegram" | "whatsapp" | "messenger" | "apple_messages"
    threadId: Id<"messagingThreads">
    sourceEventId: Id<"messagingEvents">
    text: string
    buttons?: OutboundButton[]
    documents?: Array<{ url: string; filename: string; caption?: string }>
  }
) {
  const texts = splitMessage(
    args.text,
    CHANNEL_CAPABILITIES[args.channel].maxTextLength
  )
  await ctx.runMutation(internal.messaging.core.enqueueBundle, {
    threadId: args.threadId,
    sourceEventId: args.sourceEventId,
    texts,
    buttons: args.buttons,
    documents: args.documents,
  })
}

async function processApprovalAction(
  ctx: ActionCtx,
  args: {
    threadId: Id<"messagingThreads">
    conversationId: Id<"assistantConversations">
    guestKey: string
    actionToken: string
  }
): Promise<string> {
  const separator = args.actionToken.indexOf(":")
  const rawDecision = args.actionToken.slice(0, separator)
  const token = args.actionToken.slice(separator + 1)
  const decision =
    rawDecision === "approve"
      ? ("approve" as const)
      : rawDecision === "reject"
        ? ("reject" as const)
        : null
  if (!decision || !token) return "Cette action n’est pas reconnue."

  const claimed = await ctx.runMutation(internal.messaging.core.claimApproval, {
    threadId: args.threadId,
    token,
    decision,
  })
  if (!claimed.acquired) {
    if (claimed.reason === "resolved") {
      return "Cette action a déjà été traitée."
    }
    if (claimed.reason === "processing") {
      return "Cette action est déjà en cours de traitement."
    }
    return "Cette demande de confirmation a expiré."
  }

  try {
    if (decision === "reject") {
      const rejected = await ctx.runAction(api.ai.chat.rejectToolCall, {
        conversationId: args.conversationId,
        guestKey: args.guestKey,
        callId: claimed.approval.callId,
      })
      await ctx.runMutation(internal.messaging.core.resolveApproval, {
        approvalId: claimed.approval._id,
        succeeded: true,
      })
      return rejected.message
    }

    const approved = await ctx.runAction(api.ai.chat.approveToolCall, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
      callId: claimed.approval.callId,
    })
    if (approved.status !== "ok") {
      throw new Error(
        approved.status === "error"
          ? approved.message
          : "Cette action attend toujours une confirmation."
      )
    }
    await ctx.runMutation(internal.messaging.core.resolveApproval, {
      approvalId: claimed.approval._id,
      succeeded: true,
    })
    return toolResolutionMessage(claimed.approval.toolName, approved.output)
  } catch (error) {
    const message = safeError(error)
    await ctx.runMutation(internal.messaging.core.resolveApproval, {
      approvalId: claimed.approval._id,
      succeeded: false,
      error: message,
    })
    throw error
  }
}

export const processEvent = internalAction({
  args: { eventId: v.id("messagingEvents") },
  handler: async (
    ctx,
    args
  ): Promise<{ processed: boolean; reason?: string; error?: string }> => {
    const claimed = await ctx.runMutation(
      internal.messaging.core.claimEvent,
      args
    )
    if (!claimed.acquired) return { processed: false, reason: claimed.reason }
    const event = claimed.event
    let lockedThreadId: Id<"messagingThreads"> | undefined

    try {
      const sessionSecret = process.env.MESSAGING_SESSION_SECRET ?? ""
      const guestKey = deriveChannelSecret(
        sessionSecret,
        event.channel,
        event.externalThreadId
      )
      let thread = await ctx.runMutation(internal.messaging.core.ensureThread, {
        channel: event.channel,
        externalThreadId: event.externalThreadId,
        externalUserId: event.externalUserId,
        displayName: event.displayName,
        locale: event.locale,
        guestKey,
      })
      await ctx.runMutation(internal.messaging.core.attachEventToThread, {
        eventId: event._id,
        threadId: thread._id,
      })
      const threadLock = await ctx.runMutation(
        internal.messaging.core.claimThread,
        {
          threadId: thread._id,
          eventId: event._id,
        }
      )
      if (!threadLock.acquired) {
        await ctx.runMutation(internal.messaging.core.deferEvent, {
          eventId: event._id,
        })
        await ctx.scheduler.runAfter(
          1_000,
          internal.messaging.orchestrator.processEvent,
          { eventId: event._id }
        )
        return { processed: false, reason: "thread_busy" }
      }
      lockedThreadId = thread._id

      let responseText: string
      let buttons: OutboundButton[] | undefined
      let documents:
        Array<{ url: string; filename: string; caption?: string }> | undefined

      if (event.type === "command") {
        switch (event.text) {
          case "/nouveau":
            thread = await ctx.runMutation(
              internal.messaging.core.resetThread,
              { threadId: thread._id, guestKey }
            )
            responseText =
              "Une nouvelle conversation vient de commencer. Où souhaitez-vous voyager ?"
            break
          case "/aide":
            responseText =
              "Je peux rechercher un trajet, calculer un devis, réserver des places et retrouver un billet. Écrivez simplement votre demande, par exemple : « Je veux aller de Libreville à Franceville vendredi »."
            break
          case "/start":
          default:
            responseText =
              "Mbolo 👋 Je suis l’assistant voyageur SETRAG. Je peux vous aider à rechercher un train, obtenir un prix et préparer une réservation. Où souhaitez-vous aller ?"
            break
        }
      } else if (event.type === "unsupported") {
        responseText =
          "Pour cette première version, envoyez-moi un message texte dans une conversation privée."
      } else if (event.type === "action" && event.actionToken) {
        responseText = await processApprovalAction(ctx, {
          threadId: thread._id,
          conversationId: thread.conversationId,
          guestKey,
          actionToken: event.actionToken,
        })
      } else if (event.type === "text" && event.text) {
        const result = await ctx.runAction(api.ai.chat.sendMessage, {
          conversationId: thread.conversationId,
          guestKey,
          requestId: `${event.channel}:${event.externalEventId}`,
          content: event.text,
        })
        responseText = result.message
        documents = extractDocuments(result.clientActions)
        if (result.pendingApprovals.length > 0) {
          buttons = []
          for (const approval of result.pendingApprovals) {
            const token = deriveApprovalToken(
              sessionSecret,
              thread._id,
              approval.callId
            )
            await ctx.runMutation(internal.messaging.core.registerApproval, {
              threadId: thread._id,
              token,
              callId: approval.callId,
              toolName: approval.toolName,
              expiresAt: Date.now() + 15 * 60 * 1_000,
            })
            buttons.push(
              {
                label: `Confirmer — ${approval.label}`,
                data: `approve:${token}`,
              },
              { label: "Annuler", data: `reject:${token}` }
            )
          }
        }
      } else {
        responseText = "Je n’ai pas compris ce message."
      }

      await enqueueText(ctx, {
        channel: event.channel,
        threadId: thread._id,
        sourceEventId: event._id,
        text: responseText,
        buttons,
        documents,
      })
      await ctx.runMutation(internal.messaging.core.completeEvent, {
        eventId: event._id,
      })
      await ctx.runMutation(internal.messaging.core.releaseThread, {
        threadId: thread._id,
        eventId: event._id,
      })
      lockedThreadId = undefined
      await ctx.scheduler.runAfter(0, internal.messaging.dispatch.flushThread, {
        threadId: thread._id,
      })
      return { processed: true }
    } catch (error) {
      const message = safeError(error)
      if (lockedThreadId) {
        await ctx.runMutation(internal.messaging.core.releaseThread, {
          threadId: lockedThreadId,
          eventId: event._id,
        })
      }
      await ctx.runMutation(internal.messaging.core.failEvent, {
        eventId: event._id,
        error: message,
      })
      if (event.attempts < 5) {
        const delay = Math.min(60_000, 1_000 * 2 ** event.attempts)
        await ctx.scheduler.runAfter(
          delay,
          internal.messaging.orchestrator.processEvent,
          { eventId: event._id }
        )
      }
      return { processed: false, error: message }
    }
  },
})
