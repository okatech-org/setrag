import { v } from "convex/values"
import { internal } from "../_generated/api"
import { action, internalAction, type ActionCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import {
  MAX_PAGE_CONTEXT_LENGTH,
  buildAssistantInstructions,
  getAssistantTools,
} from "./contracts"
import {
  ProviderError,
  createProviderSession,
  resolveTextProviderConfig,
  type HistoryEntry,
  type ProviderToolResult,
} from "./providers"
import { APPROVAL_TTL_MS } from "../messaging/contracts"
import { safetyIdentifierFor } from "./conversations"
import { RegroupeurFlux } from "./flux"
import { assistantRateLimiter } from "./rateLimiter"
import { appelAEnregistrer, cleActeur, type AppelEnregistre } from "./rejeu"
import { executeAssistantTool, type ToolExecutionResult } from "./tools"

type PendingApproval = {
  executionId: string
  callId: string
  toolName: string
  label: string
  input: unknown
}

export type ChatResult = {
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

const REPONSE_CONFIRMATION =
  "J’ai besoin de votre confirmation avant de poursuivre."
const REPONSE_INACHEVEE =
  "Je n’ai pas pu terminer cette demande. Pouvez-vous la reformuler ?"

/**
 * Le libellé montré au voyageur quand sa réponse s'interrompt. Le détail
 * technique (corps d'erreur du fournisseur) reste sur le tour, jamais à
 * l'écran.
 */
export function libelleErreurReponse(error: unknown): string {
  if (error instanceof ProviderError && error.status === 429) {
    return "Ruban est très sollicité en ce moment. Relancez votre question dans un instant."
  }
  return "La réponse de Ruban a été interrompue. Relancez votre question."
}

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

  // Chaque confirmation annonce l'étape suivante, sans la demander : le
  // voyageur vient de donner son feu vert, on ne le lui redemande pas.
  switch (toolName) {
    case "create_booking":
      return [
        reference
          ? `Réservation ${reference} créée : vos places sont tenues 15 minutes.`
          : "La réservation est créée : vos places sont tenues 15 minutes.",
        data.civiliteEnregistree === "M" || data.civiliteEnregistree === "F"
          ? "Votre civilité est désormais enregistrée dans votre profil."
          : "",
        "Prochaine étape : le paiement.",
      ]
        .filter(Boolean)
        .join(" ")
    case "pay_booking":
      return [
        reference
          ? `Paiement de la réservation ${reference} confirmé.`
          : "Paiement confirmé.",
        amount ? `Montant : ${amount}.` : "",
        "Vos billets sont émis.",
      ]
        .filter(Boolean)
        .join(" ")
    case "cancel_booking":
      return reference
        ? `La réservation ${reference} est annulée : les places sont libérées.`
        : "La réservation est annulée : les places sont libérées."
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

/**
 * Désigne la conversation et la preuve d'accès de l'appelant. Les fonctions
 * publiques ne fournissent que `guestKey` (et le jeton de session implicite) ;
 * `messagingThreadId` n'est posé que par les variantes internes appelées par
 * l'orchestrateur de messagerie.
 */
type ConversationAccessRequest = {
  conversationId: Id<"assistantConversations">
  guestKey?: string
  messagingThreadId?: Id<"messagingThreads">
}

function validatePageContext(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const clean = value.trim()
  if (!clean) return undefined
  if (clean.length > MAX_PAGE_CONTEXT_LENGTH) {
    throw new Error(
      `Le contexte de page dépasse ${MAX_PAGE_CONTEXT_LENGTH} caractères.`
    )
  }
  return clean
}

async function runChatTurn(
  ctx: ActionCtx,
  request: ConversationAccessRequest,
  args: { requestId: string; content: string; pageContext?: string }
): Promise<ChatResult> {
  if (!args.requestId || args.requestId.length > 200) {
    throw new Error("Identifiant de message invalide.")
  }
  const access = await ctx.runQuery(internal.ai.conversations.accessContext, {
    conversationId: request.conversationId,
    guestKey: request.guestKey,
    messagingThreadId: request.messagingThreadId,
  })
  const conversationId = request.conversationId
  const turn = await ctx.runMutation(internal.ai.conversations.beginTurn, {
    conversationId,
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

  let replyId: Id<"assistantMessages"> | null = null
  let flux: RegroupeurFlux | null = null
  try {
    const existing = await ctx.runQuery(
      internal.ai.conversations.messagesForRequest,
      {
        conversationId,
        requestId: args.requestId,
      }
    )
    // Réponse déjà terminée (tour d'avant le flux, ou bail perdu après
    // l'écriture) : on la ressert. Une réponse en cours ou en erreur, elle,
    // se réécrit.
    if (existing.assistant && (existing.assistant.status ?? "termine") === "termine") {
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
        conversationId,
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
    // Le contexte de page n'est jamais stocké comme message : il ne vaut que
    // pour ce tour, et n'entre dans les instructions qu'en tant que donnée.
    const pageContext = validatePageContext(args.pageContext)
    if (!existing.user) {
      await ctx.runMutation(internal.ai.conversations.appendMessage, {
        conversationId,
        role: "user",
        requestId: args.requestId,
        content,
      })
    }

    const resolved = resolveTextProviderConfig(
      access.conversation.assistantId,
      access.conversation.provider
    )
    const config = { ...resolved, model: access.conversation.model }
    const tools = getAssistantTools(
      access.conversation.assistantId,
      access.isAuthenticated
    )
    const actorKey = cleActeur(access.acteur)
    const messagerie = request.messagingThreadId !== undefined
    // L'historique rejoue les appels d'outils récents, pour cet acteur et
    // les outils qui lui sont ouverts : le modèle ne relance pas ce qu'il a.
    // Dans une messagerie, les boutons de confirmation expirent.
    const history = JSON.parse(
      await ctx.runQuery(internal.ai.conversations.modelHistory, {
        conversationId,
        actorKey,
        availableTools: tools.map((tool) => tool.name),
        approvalTtlMs: messagerie ? APPROVAL_TTL_MS : undefined,
        limit: 30,
      })
    ) as HistoryEntry[]
    const session = createProviderSession({
      config,
      instructions: buildAssistantInstructions(
        access.conversation.assistantId,
        new Date().toISOString(),
        access.travelerContext,
        pageContext,
        request.messagingThreadId ? "texte" : "cartes"
      ),
      messages: history,
      tools,
      safetyIdentifier: safetyIdentifierFor(access.rateLimitKey),
    })

    // La réponse s'écrit au fil du flux dans son message ; le site la lit
    // par la query réactive `getReply`. Une messagerie n'envoie que le
    // message final : rien ne s'écrit en route, le message naît terminé.
    const messageId = messagerie
      ? null
      : await ctx.runMutation(internal.ai.conversations.beginReply, {
          conversationId,
          requestId: args.requestId,
        })
    replyId = messageId
    const regroupeur = new RegroupeurFlux({
      // Une écriture intermédiaire manquée ne coûte qu'un rafraîchissement :
      // la suivante porte le texte entier, et le texte final part avec le
      // tour. Elle ne fait donc jamais échouer la réponse.
      ecrire: (texte) =>
        messageId
          ? ctx
              .runMutation(internal.ai.conversations.writeReply, {
                messageId,
                content: texte,
              })
              .catch((error: unknown) => {
                console.warn("[ai.chat] écriture du flux manquée", {
                  message:
                    error instanceof Error ? error.message : String(error),
                })
              })
          : Promise.resolve(),
      diffuser: !messagerie,
    })
    flux = regroupeur

    const pendingApprovals: PendingApproval[] = []
    const clientActions: Array<{ type: string; payload: unknown }> = []
    const toolCalls: AppelEnregistre[] = []
    let inputTokens = 0
    let outputTokens = 0
    let toolResults: ProviderToolResult[] | undefined
    let finished = false
    let lastStepText = ""

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      if (step > 0) {
        regroupeur.nouvelleEtape()
        // Une étape de plus : le bail du tour est prolongé, une relance du
        // même message ne le reprend pas en parallèle.
        await ctx.runMutation(internal.ai.conversations.renewTurn, {
          conversationId,
          requestId: args.requestId,
        })
      }
      const response = await session.next(toolResults, (delta) =>
        regroupeur.ajouter(delta)
      )
      inputTokens += response.inputTokens ?? 0
      outputTokens += response.outputTokens ?? 0
      if (response.toolCalls.length === 0) {
        finished = true
        lastStepText = response.text
        break
      }
      // Ce que le modèle a dit avant d'appeler l'outil s'affiche pendant
      // que l'outil travaille.
      await regroupeur.vider()

      toolResults = []
      for (const call of response.toolCalls) {
        const result = await executeAssistantTool(ctx, {
          ...request,
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
          const record = appelAEnregistrer({
            callId: call.callId,
            toolName: call.name,
            input: call.input,
            result: { status: "ok", output: result.output },
            actorKey,
          })
          if (record) toolCalls.push(record)
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
          const record = appelAEnregistrer({
            callId: call.callId,
            toolName: call.name,
            input: call.input,
            result: { status: "approval_required" },
            actorKey,
          })
          if (record) toolCalls.push(record)
        } else {
          toolResults.push({
            ...call,
            output: { status: "error", message: result.message },
          })
        }
      }
    }

    // Sur le site, le message est tout ce que le modèle a écrit au fil des
    // étapes — le texte affiché pendant le flux. Une messagerie, qui n'a rien
    // montré en route, garde comme avant la seule conclusion. Une phrase de
    // repli complète une réponse qui n'a rien conclu.
    let finalText = messagerie
      ? lastStepText.trim()
      : regroupeur.texte().trim()
    if (!finalText) {
      finalText =
        pendingApprovals.length > 0 ? REPONSE_CONFIRMATION : REPONSE_INACHEVEE
    } else if (!finished && pendingApprovals.length === 0) {
      finalText = `${finalText}\n\n${REPONSE_INACHEVEE}`
    }
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
      conversationId,
      requestId: args.requestId,
      resultJson: JSON.stringify(result),
      toolCalls,
      reply: {
        messageId: messageId ?? undefined,
        content: finalText,
        provider: config.provider,
        model: config.model,
      },
    })
    return result
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.replace(/\s+/g, " ").slice(0, 500)
        : "Échec du traitement du message."
    await ctx.runMutation(internal.ai.conversations.failTurn, {
      conversationId,
      requestId: args.requestId,
      error: message,
      // Le texte déjà reçu reste affiché, avec un libellé clair.
      reply: replyId
        ? {
            messageId: replyId,
            content: flux?.texte() ?? "",
            error: libelleErreurReponse(error),
          }
        : undefined,
    })
    throw error
  }
}

/**
 * Confirme et exécute exactement l'appel mémorisé : le client ne peut pas
 * substituer d'autres arguments au moment où l'utilisateur appuie sur Oui.
 */
async function runApproval(
  ctx: ActionCtx,
  request: ConversationAccessRequest,
  callId: string
): Promise<ToolExecutionResult> {
  await ctx.runQuery(internal.ai.conversations.accessContext, {
    conversationId: request.conversationId,
    guestKey: request.guestKey,
    messagingThreadId: request.messagingThreadId,
  })
  const execution: Doc<"assistantToolExecutions"> | null = await ctx.runQuery(
    internal.ai.tools.getExecution,
    {
      conversationId: request.conversationId,
      callId,
    }
  )
  if (!execution) throw new Error("Confirmation introuvable.")
  const result = await executeAssistantTool(ctx, {
    ...request,
    callId: execution.callId,
    name: execution.toolName,
    input: JSON.parse(execution.inputJson),
    approved: true,
  })
  if (result.status === "ok") {
    await ctx.runMutation(internal.ai.conversations.appendMessageOnce, {
      conversationId: request.conversationId,
      role: "assistant",
      requestId: `approval:${execution.callId}`,
      content: toolResolutionMessage(execution.toolName, result.output),
    })
  }
  return result
}

async function runRejection(
  ctx: ActionCtx,
  request: ConversationAccessRequest,
  callId: string
): Promise<RejectedToolCall> {
  await ctx.runQuery(internal.ai.conversations.accessContext, {
    conversationId: request.conversationId,
    guestKey: request.guestKey,
    messagingThreadId: request.messagingThreadId,
  })
  const execution: Doc<"assistantToolExecutions"> | null = await ctx.runQuery(
    internal.ai.tools.getExecution,
    {
      conversationId: request.conversationId,
      callId,
    }
  )
  if (!execution) throw new Error("Confirmation introuvable.")
  await ctx.runMutation(internal.ai.tools.rejectExecution, {
    conversationId: request.conversationId,
    callId,
  })
  const message = "Action annulée à votre demande."
  await ctx.runMutation(internal.ai.conversations.appendMessageOnce, {
    conversationId: request.conversationId,
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
}

/* ─────────────────────────── Fonctions publiques ─────────────────────────── */

export const sendMessage = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    requestId: v.string(),
    content: v.string(),
    /**
     * Description courte de l'écran affiché (≤ 600 caractères). Injectée
     * dans les instructions du tour comme donnée non fiable, jamais stockée.
     */
    pageContext: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ChatResult> =>
    runChatTurn(
      ctx,
      { conversationId: args.conversationId, guestKey: args.guestKey },
      {
        requestId: args.requestId,
        content: args.content,
        pageContext: args.pageContext,
      }
    ),
})

export const approveToolCall = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<ToolExecutionResult> =>
    runApproval(
      ctx,
      { conversationId: args.conversationId, guestKey: args.guestKey },
      args.callId
    ),
})

export const rejectToolCall = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<RejectedToolCall> =>
    runRejection(
      ctx,
      { conversationId: args.conversationId, guestKey: args.guestKey },
      args.callId
    ),
})

/* ──────────────── Variantes internes pour la messagerie ─────────────────── */

/*
 * L'orchestrateur de messagerie n'a pas de jeton de session : c'est le fil
 * (`threadId`) qui prouve l'accès, et l'identité reliée à ce fil qui fournit
 * l'acteur. Ces fonctions ne sont pas exposées aux clients.
 */

export const sendMessageFromThread = internalAction({
  args: {
    conversationId: v.id("assistantConversations"),
    threadId: v.id("messagingThreads"),
    requestId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args): Promise<ChatResult> =>
    runChatTurn(
      ctx,
      {
        conversationId: args.conversationId,
        messagingThreadId: args.threadId,
      },
      { requestId: args.requestId, content: args.content }
    ),
})

export const approveToolCallFromThread = internalAction({
  args: {
    conversationId: v.id("assistantConversations"),
    threadId: v.id("messagingThreads"),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<ToolExecutionResult> =>
    runApproval(
      ctx,
      {
        conversationId: args.conversationId,
        messagingThreadId: args.threadId,
      },
      args.callId
    ),
})

export const rejectToolCallFromThread = internalAction({
  args: {
    conversationId: v.id("assistantConversations"),
    threadId: v.id("messagingThreads"),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<RejectedToolCall> =>
    runRejection(
      ctx,
      {
        conversationId: args.conversationId,
        messagingThreadId: args.threadId,
      },
      args.callId
    ),
})
