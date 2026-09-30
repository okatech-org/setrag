import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction, type ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { toolResolutionMessage } from "../ai/chat"
import {
  APPROVAL_TTL_MS,
  CHANNEL_CAPABILITIES,
  commandFromText,
  deriveApprovalToken,
  deriveChannelSecret,
  linkSettingsUrl,
  splitMessage,
  type MessagingChannel,
  type OutboundButton,
} from "./contracts"
import type { LinkFromStartResult } from "./linking"

/*
 * Tous les appels à l'assistant passent par ses variantes internes
 * `…FromThread` : c'est le fil, et l'identité qui lui est reliée, qui
 * établissent l'acteur. Un fil non relié reste invité ; un fil relié agit
 * pour le compte qui a émis le lien de liaison depuis le site.
 *
 * Le fil ne produit jamais de jeton de liaison : il explique comment relier
 * le compte depuis le site, et le site renvoie ici avec `/start <jeton>`.
 */

const START_TEXT =
  "Mbolo ! Je suis Ruban, l’assistant de la SETRAG. Je peux rechercher un train, calculer un prix et préparer une réservation. Pour retrouver vos billets, envoyez /connexion. Où souhaitez-vous aller ?"
const HELP_TEXT =
  "Je peux rechercher un trajet, calculer un devis, réserver des places et retrouver un billet. Écrivez simplement votre demande, par exemple : « Je veux aller de Libreville à Franceville vendredi ».\n\n/connexion — relier votre compte SETRAG pour retrouver vos billets\n/deconnexion — délier votre compte\n/nouveau — commencer une nouvelle conversation"
const HOW_TO_LINK_TEXT =
  "Pour relier cette conversation à votre compte SETRAG, connectez-vous sur le site, ouvrez « Messageries reliées » dans votre compte et appuyez sur « Relier Telegram ». Dans Telegram, appuyez ensuite sur Démarrer."
const ALREADY_LINKED_TEXT =
  "Votre compte SETRAG est déjà relié à cette conversation. Envoyez /deconnexion pour le délier."
const LINK_BUTTON_LABEL = "Relier depuis le site"

const LINK_RESULT_TEXT: Record<
  Exclude<LinkFromStartResult["statut"], "relie">,
  string
> = {
  deja_relie: ALREADY_LINKED_TEXT,
  invalide:
    "Ce lien de liaison n’est pas valable ou a déjà servi. Sur le site, dans « Messageries reliées », appuyez de nouveau sur « Relier Telegram ».",
  expire:
    "Ce lien de liaison a expiré. Sur le site, dans « Messageries reliées », appuyez de nouveau sur « Relier Telegram ».",
  relie_ailleurs:
    "Cette conversation est déjà reliée à un autre compte SETRAG. Envoyez /deconnexion, puis ouvrez de nouveau le lien du site.",
}

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
    channel: MessagingChannel
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
    buttons: args.buttons && args.buttons.length > 0 ? args.buttons : undefined,
    documents: args.documents,
  })
}

/**
 * Le lien vers la page du site où l'on relie une messagerie, sans jeton. Il
 * devient un bouton si le canal sait l'afficher (et si l'adresse est en
 * HTTPS, exigence des boutons Telegram) ; sinon il est écrit dans le texte.
 */
function withLinkSettings(
  channel: MessagingChannel,
  text: string
): { text: string; buttons: OutboundButton[] } {
  const url = linkSettingsUrl()
  if (CHANNEL_CAPABILITIES[channel].urlButtons && url.startsWith("https://")) {
    return { text, buttons: [{ label: LINK_BUTTON_LABEL, url }] }
  }
  return { text: `${text}\n\n${url}`, buttons: [] }
}

/**
 * Explique comment relier le fil à un compte, ou rappelle qu'il l'est déjà.
 * `text` précède l'explication (réponse du modèle à `request_sign_in`).
 */
async function explainLinking(
  ctx: ActionCtx,
  args: {
    channel: MessagingChannel
    threadId: Id<"messagingThreads">
    text?: string
  }
): Promise<{ text: string; buttons: OutboundButton[] }> {
  const state = await ctx.runQuery(internal.messaging.linking.threadLinkState, {
    threadId: args.threadId,
  })
  if (state.relie) return { text: ALREADY_LINKED_TEXT, buttons: [] }
  return withLinkSettings(
    args.channel,
    args.text ? `${args.text}\n\n${HOW_TO_LINK_TEXT}` : HOW_TO_LINK_TEXT
  )
}

async function processApprovalAction(
  ctx: ActionCtx,
  args: {
    threadId: Id<"messagingThreads">
    conversationId: Id<"assistantConversations">
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
      const rejected = await ctx.runAction(
        internal.ai.chat.rejectToolCallFromThread,
        {
          conversationId: args.conversationId,
          threadId: args.threadId,
          callId: claimed.approval.callId,
        }
      )
      await ctx.runMutation(internal.messaging.core.resolveApproval, {
        approvalId: claimed.approval._id,
        succeeded: true,
      })
      return rejected.message
    }

    const approved = await ctx.runAction(
      internal.ai.chat.approveToolCallFromThread,
      {
        conversationId: args.conversationId,
        threadId: args.threadId,
        callId: claimed.approval.callId,
      }
    )
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

      const command =
        event.type === "command"
          ? event.text
          : event.type === "text" && event.text
            ? commandFromText(event.text)
            : undefined

      if (command !== undefined) {
        switch (command) {
          case "/nouveau":
            thread = await ctx.runMutation(
              internal.messaging.core.resetThread,
              { threadId: thread._id, guestKey }
            )
            responseText =
              "Une nouvelle conversation vient de commencer. Où souhaitez-vous voyager ?"
            break
          case "/aide":
            responseText = HELP_TEXT
            break
          case "/connexion": {
            const offer = await explainLinking(ctx, {
              channel: event.channel,
              threadId: thread._id,
            })
            responseText = offer.text
            buttons = offer.buttons
            break
          }
          case "/deconnexion": {
            const unlinked = await ctx.runMutation(
              internal.messaging.linking.unlinkThread,
              { threadId: thread._id, guestKey }
            )
            responseText = unlinked.unlinked
              ? "Votre compte SETRAG n’est plus relié à cette conversation. Une nouvelle conversation commence ; envoyez /connexion pour le relier à nouveau."
              : "Aucun compte SETRAG n’est relié à cette conversation. Envoyez /connexion pour savoir comment en relier un."
            break
          }
          case "/start": {
            // « Démarrer » depuis le lien du site : `/start <jeton>`. Le jeton
            // n'arrive ici que sous forme d'empreinte.
            if (!event.linkTokenHash) {
              responseText = START_TEXT
              break
            }
            const linked = await ctx.runMutation(
              internal.messaging.linking.linkFromStart,
              { threadId: thread._id, tokenHash: event.linkTokenHash }
            )
            responseText =
              linked.statut === "relie"
                ? linked.message
                : LINK_RESULT_TEXT[linked.statut]
            if (linked.statut === "invalide" || linked.statut === "expire") {
              const offer = withLinkSettings(event.channel, responseText)
              responseText = offer.text
              buttons = offer.buttons
            }
            break
          }
          default:
            responseText = START_TEXT
            break
        }
      } else if (event.type === "unsupported") {
        responseText =
          "Pour cette première version, envoyez-moi un message texte dans une conversation privée."
      } else if (event.type === "action" && event.actionToken) {
        responseText = await processApprovalAction(ctx, {
          threadId: thread._id,
          conversationId: thread.conversationId,
          actionToken: event.actionToken,
        })
      } else if (event.type === "text" && event.text) {
        const result = await ctx.runAction(
          internal.ai.chat.sendMessageFromThread,
          {
            conversationId: thread.conversationId,
            threadId: thread._id,
            requestId: `${event.channel}:${event.externalEventId}`,
            content: event.text,
          }
        )
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
              expiresAt: Date.now() + APPROVAL_TTL_MS,
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
        if (
          result.clientActions.some(
            (action) => action.type === "request_sign_in"
          )
        ) {
          // Dans un fil, « se connecter » veut dire relier le compte depuis
          // le site : aucun jeton ne part d'ici.
          const offer = await explainLinking(ctx, {
            channel: event.channel,
            threadId: thread._id,
            text: responseText,
          })
          responseText = offer.text
          buttons = [...(buttons ?? []), ...offer.buttons]
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
