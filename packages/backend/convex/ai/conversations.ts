import { hmac } from "@noble/hashes/hmac"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex } from "@noble/hashes/utils"
import { v } from "convex/values"
import { internal } from "../_generated/api"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { assertActiveUser, audit, getUser, requireUser } from "../lib/auth"
import {
  ASSISTANT_PROFILES,
  type AssistantId,
  type AssistantTravelerContext,
  type TextProviderName,
} from "./contracts"
import { civiliteDuTitulaire, manquesDuTitulaire } from "../model/titulaire"
import { assistantToolCallRecord } from "../schema"
import { notesPourContexte } from "./memory"
import { publicProviderConfig, resolveTextProviderConfig } from "./providers"
import { construireHistorique, type EtatExecution } from "./rejeu"

const assistantIdValidator = v.union(
  v.literal("concierge"),
  v.literal("booking"),
  v.literal("tickets"),
  v.literal("account")
)

const providerValidator = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("google")
)

export function hashGuestKey(guestKey: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(guestKey)))
}

/**
 * Identifiant de sécurité transmis au fournisseur IA (en-tête
 * `OpenAI-Safety-Identifier`) : une empreinte HMAC-SHA256 de la clé de
 * limitation (`userId` ou empreinte du secret invité), avec un secret serveur.
 *
 * Le fournisseur peut ainsi rapprocher les requêtes d'une même personne sans
 * jamais recevoir un identifiant de la base, ni pouvoir le retrouver : sans
 * le secret, l'empreinte n'est pas réversible. Sans secret configuré, aucun
 * identifiant n'est transmis plutôt qu'un identifiant brut.
 */
export function safetyIdentifierFor(rateLimitKey: string): string | undefined {
  const secret =
    process.env.MESSAGING_SESSION_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) return undefined
  const material = new TextEncoder().encode(`safety-identifier:${rateLimitKey}`)
  return bytesToHex(hmac(sha256, new TextEncoder().encode(secret), material))
}

function assertGuestKey(guestKey: string): void {
  if (guestKey.length < 32 || guestKey.length > 256) {
    throw new Error(
      "Le secret de session doit contenir entre 32 et 256 caractères."
    )
  }
}

/*
 * Identité d'une conversation
 * ───────────────────────────
 * L'identité est portée par la conversation (`userId`), et résolue une seule
 * fois, ici, à la frontière :
 *
 * - une conversation rattachée à un compte n'est accessible qu'à ce compte,
 *   soit par son jeton de session (web, application), soit — depuis du code
 *   serveur interne uniquement — par le fil de messagerie dont l'identité est
 *   reliée à ce même compte ;
 * - une conversation invitée n'est accessible qu'avec son secret (web) ou par
 *   son fil de messagerie (interne), et n'a pas d'acteur, même si l'appelant
 *   web est connecté : il doit d'abord la rattacher avec `claim`.
 *
 * L'acteur résolu est ensuite transmis tel quel aux outils. Aucune fonction
 * publique n'accepte un identifiant de compte ni un fil de messagerie venus du
 * client.
 */

export type ConversationActor = {
  userId: Id<"users">
  /** Voie par laquelle l'acteur a été établi. */
  source: "session" | "messaging"
}

type AccessRequest = {
  guestKey?: string
  /** Réservé au code serveur : jamais accepté d'une fonction publique. */
  messagingThreadId?: Id<"messagingThreads">
}

const INACCESSIBLE = "Conversation inaccessible."

async function resolveConversationActor(
  ctx: QueryCtx | MutationCtx,
  conversation: Doc<"assistantConversations">,
  request: AccessRequest
): Promise<{ user: Doc<"users">; actor: ConversationActor } | null> {
  if (request.messagingThreadId !== undefined) {
    const thread = await ctx.db.get(request.messagingThreadId)
    if (!thread || thread.conversationId !== conversation._id) {
      throw new Error(INACCESSIBLE)
    }
    if (!conversation.userId) return null
    const identity = await ctx.db.get(thread.identityId)
    if (!identity || identity.userId !== conversation.userId) {
      throw new Error(INACCESSIBLE)
    }
    const user = await ctx.db.get(conversation.userId)
    if (!user) throw new Error(INACCESSIBLE)
    // Même refus qu'un appel web pour un compte désactivé ; et une messagerie
    // n'agit que pour un voyageur, jamais pour un compte interne.
    assertActiveUser(user)
    if (user.role !== "voyageur") {
      throw new Error(
        `Accès refusé : le rôle ${user.role} n'est pas autorisé depuis une messagerie`
      )
    }
    return { user, actor: { userId: user._id, source: "messaging" } }
  }

  if (conversation.userId) {
    const user = await getUser(ctx)
    if (!user || user._id !== conversation.userId) {
      throw new Error(INACCESSIBLE)
    }
    assertActiveUser(user)
    return { user, actor: { userId: user._id, source: "session" } }
  }
  if (
    !request.guestKey ||
    hashGuestKey(request.guestKey) !== conversation.guestKeyHash
  ) {
    throw new Error(INACCESSIBLE)
  }
  return null
}

/** Contrôle d'accès des fonctions publiques : jeton de session ou secret. */
async function assertConversationAccess(
  ctx: QueryCtx | MutationCtx,
  conversation: Doc<"assistantConversations">,
  guestKey?: string
): Promise<void> {
  await resolveConversationActor(ctx, conversation, { guestKey })
}

/**
 * Ce que Ruban sait du voyageur connecté, relu à chaque tour : le titulaire
 * du compte (le voyageur « Moi », porté par le profil), les personnes avec
 * qui il voyage et ce que Ruban a retenu de lui. Vaut pour une session web
 * ou mobile comme pour un fil de messagerie relié : c'est le même compte.
 */
async function travelerContextFor(
  ctx: QueryCtx,
  user: Doc<"users">
): Promise<AssistantTravelerContext> {
  const [savedPassengers, memories] = await Promise.all([
    ctx.db
      .query("savedPassengers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect(),
    notesPourContexte(ctx, user._id),
  ])
  // Un compte ancien n'a pas de civilité au profil, mais souvent une fiche
  // créée pour lui-même : elle suffit à ne pas la redemander.
  const gender = civiliteDuTitulaire(user, savedPassengers)
  return {
    profile: {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      phone: user.phone ?? null,
      email: user.email ?? null,
      gender,
      missingForTicket: manquesDuTitulaire(user, gender),
    },
    savedPassengers: savedPassengers.map((passenger) => ({
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      gender: passenger.gender,
      phone: passenger.phone ?? null,
    })),
    memories,
  }
}

/**
 * Rattache une conversation invitée à un compte, historique compris.
 *
 * Point unique utilisé par `claim` (chat web) et par la liaison d'une
 * messagerie : les tours suivants voient les outils authentifiés et le
 * contexte voyageur. Idempotent pour le même compte ; refuse un autre compte.
 */
export async function attachConversationToUser(
  ctx: MutationCtx,
  conversation: Doc<"assistantConversations">,
  user: Doc<"users">,
  via: "web" | "messagerie"
): Promise<"claimed" | "already_claimed"> {
  if (conversation.userId === user._id) return "already_claimed"
  if (conversation.userId) throw new Error(INACCESSIBLE)
  if (conversation.status !== "active") {
    throw new Error("Cette conversation est terminée.")
  }
  await ctx.db.patch(conversation._id, { userId: user._id })
  await audit(ctx, {
    actorId: user._id,
    action: "assistant_conversation.rattacher",
    entityTable: "assistantConversations",
    entityId: conversation._id,
    after: { userId: user._id, via },
  })
  return "claimed"
}

export const getConfiguration = query({
  args: {},
  handler: async (ctx) => {
    const authenticated = (await getUser(ctx)) !== null
    return {
      assistants: Object.values(ASSISTANT_PROFILES).map((profile) => {
        const config = resolveTextProviderConfig(profile.id)
        return {
          id: profile.id,
          name: profile.name,
          description: profile.description,
          ...publicProviderConfig(config),
        }
      }),
      authenticated,
    }
  },
})

export const create = mutation({
  args: {
    guestKey: v.string(),
    assistantId: v.optional(assistantIdValidator),
    provider: v.optional(providerValidator),
  },
  handler: async (ctx, args) => {
    assertGuestKey(args.guestKey)
    const assistantId = (args.assistantId ?? "concierge") as AssistantId
    const config = resolveTextProviderConfig(
      assistantId,
      args.provider as TextProviderName | undefined
    )
    const user = await getUser(ctx)
    const now = Date.now()
    const conversationId = await ctx.db.insert("assistantConversations", {
      userId: user?._id,
      guestKeyHash: hashGuestKey(args.guestKey),
      assistantId,
      provider: config.provider,
      model: config.model,
      status: "active",
      createdAt: now,
      lastMessageAt: now,
    })
    return {
      conversationId,
      assistant: ASSISTANT_PROFILES[assistantId],
      /**
       * La conversation appartient-elle déjà au compte ? Une session web
       * peut être ouverte avant que son profil existe : la conversation naît
       * alors invitée, et l'interface doit la rattacher (`claim`) ensuite.
       */
      attachedToAccount: user !== null,
      ...publicProviderConfig(config),
    }
  },
})

/**
 * Rattache au compte connecté une conversation commencée en visiteur.
 *
 * Le secret invité prouve que l'appelant est bien celui qui a mené la
 * conversation ; la session prouve le compte. Idempotent pour le même compte,
 * refusé si la conversation appartient déjà à un autre.
 */
export const claim = mutation({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    if (conversation.userId === user._id) {
      return {
        conversationId: conversation._id,
        status: "already_claimed" as const,
      }
    }
    if (conversation.userId) throw new Error(INACCESSIBLE)
    assertGuestKey(args.guestKey)
    if (hashGuestKey(args.guestKey) !== conversation.guestKeyHash) {
      throw new Error(INACCESSIBLE)
    }
    const status = await attachConversationToUser(
      ctx,
      conversation,
      user,
      "web"
    )
    return { conversationId: conversation._id, status }
  },
})

export const get = query({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return null
    await assertConversationAccess(ctx, conversation, args.guestKey)
    return conversation
  },
})

export const listMessages = query({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    await assertConversationAccess(ctx, conversation, args.guestKey)
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)))
    const messages = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit)
    return messages.reverse()
  },
})

/**
 * La réponse de Ruban à une question (`requestId`), telle qu'elle s'écrit.
 * Le site s'y abonne pendant le tour : le texte grandit à chaque écriture
 * regroupée du flux, puis passe `termine` (ou `erreur`, texte partiel gardé).
 */
export const getReply = query({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    // Le site s'y abonne depuis la coquille, au-dessus de toute limite
    // d'erreur : une conversation devenue inaccessible (déconnexion dans un
    // autre onglet, compte désactivé, conversation effacée) rend `null`
    // plutôt que de lever, sans rien dire de plus.
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return null
    try {
      await assertConversationAccess(ctx, conversation, args.guestKey)
    } catch {
      return null
    }
    const message = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_request_id_and_role", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
          .eq("role", "assistant")
      )
      .first()
    if (!message) return null
    return {
      content: message.content,
      status: message.status ?? ("termine" as const),
      error: message.error ?? null,
    }
  },
})

type StoredTurnResult = {
  clientActions?: Array<{ type: string; payload: unknown }>
  pendingApprovals?: Array<{
    executionId: string
    callId: string
    toolName: string
    label: string
    input: unknown
  }>
}

/**
 * Tours terminés d'une conversation, avec leurs actions d'interface et l'état
 * courant de chaque confirmation. Permet de réafficher les cartes après un
 * rechargement et de savoir quelles confirmations sont encore ouvertes.
 */
export const listTurns = query({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    await assertConversationAccess(ctx, conversation, args.guestKey)
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)))
    const turns = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit)

    const result = []
    for (const turn of turns.reverse()) {
      if (turn.status !== "completed" || !turn.resultJson) continue
      let stored: StoredTurnResult
      try {
        stored = JSON.parse(turn.resultJson) as StoredTurnResult
      } catch {
        continue
      }
      const pendingApprovals = []
      for (const approval of stored.pendingApprovals ?? []) {
        const execution = await ctx.db
          .query("assistantToolExecutions")
          .withIndex("by_conversation_and_call_id", (q) =>
            q
              .eq("conversationId", args.conversationId)
              .eq("callId", approval.callId)
          )
          .unique()
        pendingApprovals.push({
          executionId: approval.executionId,
          callId: approval.callId,
          toolName: approval.toolName,
          label: approval.label,
          input: approval.input,
          status: execution?.status ?? ("failed" as const),
        })
      }
      result.push({
        requestId: turn.requestId,
        createdAt: turn.createdAt,
        clientActions: stored.clientActions ?? [],
        pendingApprovals,
      })
    }
    return result
  },
})

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)))
    const conversations = await ctx.db
      .query("assistantConversations")
      .withIndex("by_user_and_last_message_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit)
    // Une conversation menée depuis Telegram ou WhatsApp reste la sienne : le
    // canal permet au site de la présenter comme telle (ou de la filtrer).
    return await Promise.all(
      conversations.map(async (conversation) => {
        const fil = await ctx.db
          .query("messagingThreads")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .first()
        return { ...conversation, canal: fil?.channel ?? null }
      })
    )
  },
})

export const close = mutation({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    await assertConversationAccess(ctx, conversation, args.guestKey)
    await ctx.db.patch(conversation._id, { status: "closed" })
    return { closed: true }
  },
})

/**
 * Point d'entrée unique des actions de l'assistant : contrôle l'accès et
 * rend l'acteur de la conversation.
 *
 * `messagingThreadId` n'est fourni que par l'orchestrateur de messagerie
 * (fonctions internes) : c'est alors l'identité reliée au fil, et non un
 * jeton, qui établit l'acteur.
 */
export const accessContext = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    messagingThreadId: v.optional(v.id("messagingThreads")),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) throw new Error("Conversation introuvable.")
    const resolved = await resolveConversationActor(ctx, conversation, {
      guestKey: args.guestKey,
      messagingThreadId: args.messagingThreadId,
    })
    if (conversation.status !== "active") {
      throw new Error("Cette conversation est terminée.")
    }
    return {
      conversation,
      acteur: resolved?.actor ?? null,
      isAuthenticated: resolved !== null,
      rateLimitKey: resolved?.actor.userId ?? conversation.guestKeyHash,
      travelerContext: resolved
        ? await travelerContextFor(ctx, resolved.user)
        : null,
    }
  },
})

/** Tours relus pour trouver ceux dont les appels d'outils se rejouent. */
const TOURS_LUS_POUR_REJEU = 20

/**
 * L'historique envoyé au modèle, en JSON : les messages texte terminés et,
 * avant la réponse de chaque tour récent, ses appels d'outils rejouables pour
 * l'acteur courant (`rejeu.ts`). Les confirmations sont relues dans leur état
 * actuel (ouverte, confirmée, annulée).
 *
 * Rendu sérialisé : les sorties d'outils sont du JSON libre, pas des valeurs
 * Convex.
 */
export const modelHistory = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    /** Clé de l'acteur courant (`rejeu.cleActeur`). */
    actorKey: v.string(),
    /** Outils ouverts à l'acteur courant : les autres ne se rejouent pas. */
    availableTools: v.array(v.string()),
    /** Validité des boutons de confirmation d'une messagerie. */
    approvalTtlMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string> => {
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 30)))
    // Les sorties d'outils ont aussi leur ligne (`role: "tool"`) : on lit plus
    // large pour garder `limit` messages de conversation.
    const [lus, turns] = await Promise.all([
      ctx.db
        .query("assistantMessages")
        .withIndex("by_conversation_and_created_at", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("desc")
        .take(limit * 4),
      ctx.db
        .query("assistantTurns")
        .withIndex("by_conversation_and_created_at", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("desc")
        .take(TOURS_LUS_POUR_REJEU),
    ])
    const executions: Record<string, EtatExecution> = {}
    for (const turn of turns) {
      for (const call of turn.toolCalls ?? []) {
        if (call.status !== "approval_required") continue
        const execution = await ctx.db
          .query("assistantToolExecutions")
          .withIndex("by_conversation_and_call_id", (q) =>
            q
              .eq("conversationId", args.conversationId)
              .eq("callId", call.callId)
          )
          .unique()
        if (execution) {
          executions[call.callId] = {
            status: execution.status,
            outputJson: execution.outputJson,
            error: execution.error,
          }
        }
      }
    }
    const messages = lus
      .filter((message) => message.role !== "tool")
      .slice(0, limit)
      .reverse()
    return JSON.stringify(
      construireHistorique({
        messages,
        tours: turns,
        executions,
        acteurCourant: args.actorKey,
        outilsDisponibles: new Set(args.availableTools),
        maintenant: Date.now(),
        expirationConfirmationMs: args.approvalTtlMs,
      })
    )
  },
})

/**
 * Ouvre la réponse de Ruban à une question, vide, en cours d'écriture. Une
 * relance de la même question (même `requestId`) rouvre le même message : le
 * site garde la même entrée dans le fil.
 */
export const beginReply = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"assistantMessages">> => {
    const existing = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_request_id_and_role", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
          .eq("role", "assistant")
      )
      .first()
    if (existing) {
      if (existing.status === "en_cours" || existing.status === "erreur") {
        await ctx.db.patch(existing._id, {
          content: "",
          status: "en_cours",
          error: undefined,
        })
      }
      return existing._id
    }
    return await ctx.db.insert("assistantMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      requestId: args.requestId,
      content: "",
      status: "en_cours",
      createdAt: Date.now(),
    })
  },
})

/**
 * Prolonge le bail d'un tour qui travaille encore (une étape de plus) : une
 * relance du même `requestId` ne le reprend pas en parallèle.
 */
export const renewTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()
    if (turn?.status === "running") {
      await ctx.db.patch(turn._id, { updatedAt: Date.now() })
    }
  },
})

/**
 * Écriture regroupée du flux : le texte entier reçu jusqu'ici. Sans effet
 * sur une réponse qui n'est plus en cours.
 */
export const writeReply = internalMutation({
  args: {
    messageId: v.id("assistantMessages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message || message.status !== "en_cours") return
    await ctx.db.patch(args.messageId, { content: args.content })
  },
})

export const appendMessage = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    content: v.string(),
    requestId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    provider: v.optional(providerValidator),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = await ctx.db.insert("assistantMessages", {
      ...args,
      createdAt: now,
    })
    await ctx.db.patch(args.conversationId, { lastMessageAt: now })
    return id
  },
})

/**
 * Ajoute un message déterministe une seule fois. Les confirmations différées
 * (bouton web, Telegram, voix) peuvent ainsi être rejouées sans dupliquer
 * l'historique visible par le modèle.
 */
export const appendMessageOnce = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    content: v.string(),
    requestId: v.string(),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    provider: v.optional(providerValidator),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation_and_request_id_and_role", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
          .eq("role", args.role)
      )
      .unique()
    if (existing) return existing._id

    const now = Date.now()
    const id = await ctx.db.insert("assistantMessages", {
      ...args,
      createdAt: now,
    })
    await ctx.db.patch(args.conversationId, { lastMessageAt: now })
    return id
  },
})

const TURN_LEASE_MS = 2 * 60 * 1_000

/**
 * Prend un bail sur un tour. Le résultat structuré est conservé afin qu'un
 * webhook ou un client qui rejoue la même requête retrouve aussi les boutons
 * et actions, pas uniquement le texte final.
 */
export const beginTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()

    if (existing?.status === "completed") {
      return {
        acquired: false,
        state: "completed" as const,
        resultJson: existing.resultJson,
      }
    }
    if (
      existing?.status === "running" &&
      now - existing.updatedAt < TURN_LEASE_MS
    ) {
      return {
        acquired: false,
        state: "running" as const,
        resultJson: undefined,
      }
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "running",
        error: undefined,
        attempts: existing.attempts + 1,
        updatedAt: now,
      })
      return {
        acquired: true,
        state: "running" as const,
        resultJson: undefined,
      }
    }

    await ctx.db.insert("assistantTurns", {
      conversationId: args.conversationId,
      requestId: args.requestId,
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    })
    return {
      acquired: true,
      state: "running" as const,
      resultJson: undefined,
    }
  },
})

/**
 * Termine un tour : résultat structuré, appels d'outils à rejouer et, dans la
 * même transaction, le texte final de la réponse. Il n'existe donc jamais de
 * réponse terminée sur un tour encore ouvert, ni l'inverse.
 */
export const completeTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
    resultJson: v.string(),
    toolCalls: v.optional(v.array(assistantToolCallRecord)),
    reply: v.optional(
      v.object({
        /** Absent pour une messagerie : le message naît ici, terminé. */
        messageId: v.optional(v.id("assistantMessages")),
        content: v.string(),
        provider: providerValidator,
        model: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()
    if (!turn) throw new Error("Tour assistant introuvable.")
    const now = Date.now()
    await ctx.db.patch(turn._id, {
      status: "completed",
      resultJson: args.resultJson,
      ...(args.toolCalls ? { toolCalls: args.toolCalls } : {}),
      error: undefined,
      updatedAt: now,
    })
    if (args.reply) {
      const final = {
        content: args.reply.content,
        status: "termine" as const,
        error: undefined,
        provider: args.reply.provider,
        model: args.reply.model,
      }
      const messageId =
        args.reply.messageId ??
        (
          await ctx.db
            .query("assistantMessages")
            .withIndex("by_conversation_and_request_id_and_role", (q) =>
              q
                .eq("conversationId", args.conversationId)
                .eq("requestId", args.requestId)
                .eq("role", "assistant")
            )
            .first()
        )?._id
      if (messageId) {
        await ctx.db.patch(messageId, final)
      } else {
        await ctx.db.insert("assistantMessages", {
          conversationId: args.conversationId,
          role: "assistant",
          requestId: args.requestId,
          ...final,
          createdAt: now,
        })
      }
      await ctx.db.patch(args.conversationId, { lastMessageAt: now })
    }
  },
})

/**
 * Marque un tour en échec. Si sa réponse avait commencé à s'écrire, elle
 * passe en erreur avec le texte partiel reçu et un libellé pour le voyageur ;
 * le détail technique (`error`) ne reste que sur le tour.
 */
export const failTurn = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
    error: v.string(),
    reply: v.optional(
      v.object({
        messageId: v.id("assistantMessages"),
        content: v.string(),
        error: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("assistantTurns")
      .withIndex("by_conversation_and_request", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("requestId", args.requestId)
      )
      .unique()
    if (!turn || turn.status === "completed") return
    await ctx.db.patch(turn._id, {
      status: "failed",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    })
    if (args.reply) {
      const message = await ctx.db.get(args.reply.messageId)
      if (message && message.status === "en_cours") {
        await ctx.db.patch(message._id, {
          content: args.reply.content,
          status: "erreur",
          error: args.reply.error.slice(0, 300),
        })
      }
    }
  },
})

export const messagesForRequest = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const [user, assistant] = await Promise.all([
      ctx.db
        .query("assistantMessages")
        .withIndex("by_conversation_and_request_id_and_role", (q) =>
          q
            .eq("conversationId", args.conversationId)
            .eq("requestId", args.requestId)
            .eq("role", "user")
        )
        .unique(),
      ctx.db
        .query("assistantMessages")
        .withIndex("by_conversation_and_request_id_and_role", (q) =>
          q
            .eq("conversationId", args.conversationId)
            .eq("requestId", args.requestId)
            .eq("role", "assistant")
        )
        .unique(),
    ])
    return { user, assistant }
  },
})

/* ─────────────────────── Effacement d'un compte ─────────────────────────── */

/** Documents supprimés au plus par exécution de la purge. */
const PURGE_BATCH = 200

/**
 * Supprime au plus `budget` documents rattachés à une conversation, dans
 * l'ordre messages, tours (avec leurs appels d'outils gardés pour le rejeu),
 * exécutions d'outils, sessions vocales. Rend le nombre supprimé : moins que
 * le budget signifie qu'il n'en reste plus.
 */
async function purgeConversationChildren(
  ctx: MutationCtx,
  conversationId: Id<"assistantConversations">,
  budget: number
): Promise<number> {
  let deleted = 0
  const lots = [
    () =>
      ctx.db
        .query("assistantMessages")
        .withIndex("by_conversation_and_created_at", (q) =>
          q.eq("conversationId", conversationId)
        )
        .take(budget - deleted),
    () =>
      ctx.db
        .query("assistantTurns")
        .withIndex("by_conversation_and_created_at", (q) =>
          q.eq("conversationId", conversationId)
        )
        .take(budget - deleted),
    () =>
      ctx.db
        .query("assistantToolExecutions")
        .withIndex("by_conversation_and_call_id", (q) =>
          q.eq("conversationId", conversationId)
        )
        .take(budget - deleted),
    () =>
      ctx.db
        .query("assistantVoiceSessions")
        .withIndex("by_conversation_and_created_at", (q) =>
          q.eq("conversationId", conversationId)
        )
        .take(budget - deleted),
  ]
  for (const lot of lots) {
    if (deleted >= budget) break
    for (const row of await lot()) {
      await ctx.db.delete(row._id)
      deleted += 1
    }
  }
  return deleted
}

/**
 * Efface les conversations d'assistant d'un compte supprimé, avec leurs
 * messages, tours (appels d'outils rejoués compris), exécutions d'outils et
 * sessions vocales.
 *
 * Planifiée par `customers.deleteMyAccount`. Une conversation peut compter des
 * centaines de messages : la purge avance par lots bornés et se replanifie
 * tant qu'il reste quelque chose, pour ne jamais dépasser les limites d'une
 * transaction.
 */
export const purgeUserData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ done: boolean; deleted: number }> => {
    let budget = PURGE_BATCH
    let deleted = 0
    while (budget > 0) {
      const conversation = await ctx.db
        .query("assistantConversations")
        .withIndex("by_user_and_last_message_at", (q) =>
          q.eq("userId", args.userId)
        )
        .first()
      if (!conversation) return { done: true, deleted }
      const children = await purgeConversationChildren(
        ctx,
        conversation._id,
        budget
      )
      budget -= children
      deleted += children
      if (budget > 0) {
        // Moins que le budget : plus aucun document rattaché.
        await ctx.db.delete(conversation._id)
        budget -= 1
        deleted += 1
      }
    }
    await ctx.scheduler.runAfter(0, internal.ai.conversations.purgeUserData, {
      userId: args.userId,
    })
    return { done: false, deleted }
  },
})

export type ConversationAccessContext = {
  conversation: Doc<"assistantConversations">
  acteur: ConversationActor | null
  isAuthenticated: boolean
  rateLimitKey: string
}

export type ConversationId = Id<"assistantConversations">
