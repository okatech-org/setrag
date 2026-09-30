import { hmac } from "@noble/hashes/hmac"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex } from "@noble/hashes/utils"
import { v } from "convex/values"
import { internal } from "../_generated/api"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { hashGuestKey } from "../ai/conversations"
import { audit, requireUser } from "../lib/auth"
import {
  LINK_REQUEST_TTL_MS,
  MAX_ACTIVE_LINK_REQUESTS,
  generateLinkToken,
  hashLinkToken,
  telegramBotUsername,
  telegramStartUrl,
} from "./contracts"
import { insertOutboxBundle, insertThreadConversation } from "./core"

/**
 * Liaison d'une identité de messagerie à un compte SETRAG.
 *
 * Le jeton naît sur le site, jamais dans le fil :
 *
 * 1. le voyageur connecté appuie sur « Relier Telegram » dans son espace
 *    compte : `startFromSite` tire un jeton et rend le lien
 *    `https://t.me/<bot>?start=<jeton>` ;
 * 2. il ouvre ce lien dans SON Telegram et appuie sur « Démarrer » : le bot
 *    reçoit `/start <jeton>`, et `linkFromStart` relie l'identité Telegram qui
 *    a appuyé au compte qui a tiré le jeton ;
 * 3. la conversation du fil suit le compte : les messages suivants passent
 *    par les variantes internes de l'assistant avec ce compte pour acteur.
 *
 * Le sens compte : c'est la personne connectée au site qui désigne sa
 * messagerie, et non un fil qui désignerait un compte. Un lien de liaison
 * envoyé par un tiers ne peut donc relier que le compte de ce tiers.
 *
 * La base ne garde que l'empreinte du jeton. Une demande sert une fois,
 * expire au bout de dix minutes, et un compte n'en a jamais plus de trois en
 * cours. `/deconnexion` dans le fil, ou `unlink` depuis l'espace compte,
 * défont la liaison.
 */

/**
 * Confirmation d'une liaison, dans le fil et dans l'historique du modèle. Le
 * prénom du compte y figure : si quelqu'un a fait ouvrir SON lien à une autre
 * personne, celle-ci voit tout de suite que ce n'est pas son compte.
 */
export function linkedMessage(firstName?: string | null): string {
  const compte = firstName?.trim() ? ` (${firstName.trim()})` : ""
  return `Votre compte SETRAG${compte} est relié à cette conversation. Je peux maintenant retrouver vos billets. Si ce n'est pas votre compte, envoyez /deconnexion.`
}
const UNLINKED_FROM_SITE_MESSAGE =
  "Votre compte SETRAG n'est plus relié à cette conversation. Pour le relier à nouveau, envoyez /connexion."

/** Canaux qu'on sait relier depuis le site : ceux qui ont un lien profond. */
const linkableChannel = v.literal("telegram")

/* ─────────────────────────── Côté site (public) ─────────────────────────── */

/**
 * Enregistre une demande de liaison pour le compte connecté. Le jeton est tiré
 * par `startFromSite` (action) : seule son empreinte arrive ici.
 *
 * Réservé aux voyageurs. Un compte garde au plus trois demandes en cours :
 * au-delà, les plus anciennes expirent.
 */
export const registerSiteRequest = internalMutation({
  args: { channel: linkableChannel, tokenHash: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (user.role !== "voyageur") {
      throw new Error(
        "La liaison d'une messagerie est réservée aux comptes voyageurs."
      )
    }

    const collision = await ctx.db
      .query("messagingLinkRequests")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique()
    if (collision) throw new Error("Collision de jeton de liaison.")

    const now = Date.now()
    const pending = await ctx.db
      .query("messagingLinkRequests")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect()
    const active = pending
      .filter((request) => request.expiresAt > now)
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          right._creationTime - left._creationTime
      )
    const toExpire = [
      ...pending.filter((request) => request.expiresAt <= now),
      // La nouvelle demande prend une des trois places.
      ...active.slice(MAX_ACTIVE_LINK_REQUESTS - 1),
    ]
    for (const request of toExpire) {
      await ctx.db.patch(request._id, { status: "expired" })
    }

    const expiresAt = now + LINK_REQUEST_TTL_MS
    const requestId = await ctx.db.insert("messagingLinkRequests", {
      userId: user._id,
      channel: args.channel,
      tokenHash: args.tokenHash,
      status: "pending",
      expiresAt,
      createdAt: now,
    })
    await audit(ctx, {
      actorId: user._id,
      action: "messagerie.demander_liaison",
      entityTable: "messagingLinkRequests",
      entityId: requestId,
      after: { channel: args.channel, expiresAt },
    })
    return { expiresAt }
  },
})

/**
 * Prépare la liaison d'une messagerie au compte connecté.
 *
 * Rend le lien à ouvrir dans la messagerie (`https://t.me/<bot>?start=…`)
 * et son échéance, ou `{ disponible: false }` si le bot n'est pas configuré
 * (`TELEGRAM_BOT_USERNAME`). Session obligatoire, rôle voyageur uniquement.
 * Le jeton n'apparaît que dans ce lien.
 */
export const startFromSite = action({
  args: { canal: linkableChannel },
  handler: async (
    ctx,
    args
  ): Promise<
    | { disponible: true; url: string; expiresAt: number }
    | { disponible: false }
  > => {
    const bot = telegramBotUsername()
    if (!bot) return { disponible: false }
    const token = generateLinkToken()
    const { expiresAt } = await ctx.runMutation(
      internal.messaging.linking.registerSiteRequest,
      { channel: args.canal, tokenHash: hashLinkToken(token) }
    )
    return { disponible: true, url: telegramStartUrl(bot, token), expiresAt }
  },
})

/** Messageries reliées au compte connecté, pour l'espace compte du site. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const identities = await ctx.db
      .query("messagingIdentities")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    return identities.map((identity) => ({
      identityId: identity._id,
      canal: identity.channel,
      nomAffiche: identity.displayName ?? null,
      linkedAt: identity.linkedAt ?? null,
      lastSeenAt: identity.lastSeenAt,
    }))
  },
})

/** Délie une messagerie depuis l'espace compte et prévient le fil. */
export const unlink = mutation({
  args: { identityId: v.id("messagingIdentities") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const identity = await ctx.db.get(args.identityId)
    // Même message qu'une liaison absente : on ne révèle pas les identités
    // reliées à d'autres comptes.
    if (!identity || identity.userId !== user._id) {
      throw new Error("Liaison introuvable.")
    }
    const threads = await unlinkIdentity(ctx, identity)
    for (const thread of threads) {
      await insertOutboxBundle(ctx, {
        threadId: thread._id,
        texts: [UNLINKED_FROM_SITE_MESSAGE],
      })
      await ctx.scheduler.runAfter(0, internal.messaging.dispatch.flushThread, {
        threadId: thread._id,
      })
    }
    await audit(ctx, {
      actorId: user._id,
      action: "messagerie.delier",
      entityTable: "messagingIdentities",
      entityId: identity._id,
      after: { channel: identity.channel },
      metadata: { via: "site" },
    })
    return { delie: true }
  },
})

/* ───────────────────────── Côté messagerie (interne) ────────────────────── */

export type LinkFromStartResult =
  | { statut: "relie"; message: string }
  | { statut: "deja_relie" }
  | { statut: "invalide" }
  | { statut: "expire" }
  | { statut: "relie_ailleurs" }

/**
 * `/start <jeton>` : relie l'identité qui a appuyé sur « Démarrer » au compte
 * qui a tiré le jeton sur le site.
 *
 * Vérifie que le jeton existe, n'a pas expiré ni servi, que le compte est un
 * voyageur actif et que l'identité n'est pas déjà reliée à un autre compte.
 * La conversation du fil est rattachée au compte (même effet que
 * `ai.conversations.claim`) et la liaison est auditée ; le message de
 * confirmation part avec la réponse de l'orchestrateur.
 *
 * Rejouer le même événement est sans effet : la demande déjà consommée par
 * cette identité rend de nouveau `relie`.
 */
export const linkFromStart = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    tokenHash: v.string(),
  },
  handler: async (ctx, args): Promise<LinkFromStartResult> => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread) throw new Error("Conversation multicanale introuvable.")
    const identity = await ctx.db.get(thread.identityId)
    if (!identity) throw new Error("Identité de messagerie introuvable.")

    const request = await ctx.db
      .query("messagingLinkRequests")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique()
    // Un jeton inconnu, tiré pour un autre canal, ou déjà consommé par une
    // autre identité : la même réponse, sans rien dire du compte.
    if (!request || request.channel !== identity.channel) {
      return { statut: "invalide" }
    }
    if (request.status === "used") {
      if (
        request.identityId !== identity._id ||
        identity.userId !== request.userId
      ) {
        return { statut: "invalide" }
      }
      const owner = await ctx.db.get(request.userId)
      return { statut: "relie", message: linkedMessage(owner?.firstName) }
    }

    const now = Date.now()
    if (request.status === "expired" || request.expiresAt <= now) {
      if (request.status === "pending") {
        await ctx.db.patch(request._id, { status: "expired" })
      }
      return { statut: "expire" }
    }

    const user = await ctx.db.get(request.userId)
    if (!user || !user.isActive || user.role !== "voyageur") {
      await ctx.db.patch(request._id, { status: "expired" })
      return { statut: "invalide" }
    }

    // La demande reste valable : après /deconnexion, le même lien pourra
    // relier cette identité.
    if (identity.userId && identity.userId !== user._id) {
      return { statut: "relie_ailleurs" }
    }

    await ctx.db.patch(request._id, {
      status: "used",
      usedAt: now,
      identityId: identity._id,
    })
    // Une liaison aboutie ferme les autres liens encore ouverts du compte :
    // un lien partagé par mégarde ne reliera pas une autre messagerie.
    const others = await ctx.db
      .query("messagingLinkRequests")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect()
    for (const other of others) {
      if (other.channel === request.channel) {
        await ctx.db.patch(other._id, { status: "expired" })
      }
    }
    if (identity.userId === user._id) return { statut: "deja_relie" }

    await ctx.db.patch(identity._id, { userId: user._id, linkedAt: now })

    // Conversation neuve à la liaison : l'échange mené en invité se ferme et
    // reste invité. Le rattacher au compte exposerait, si la personne a ouvert
    // le lien de quelqu'un d'autre, ses propres messages à ce titulaire.
    const conversation = await ctx.db.get(thread.conversationId)
    if (!conversation) throw new Error("Conversation multicanale introuvable.")
    if (conversation.status === "active") {
      await ctx.db.patch(conversation._id, { status: "closed" })
    }
    const conversationId = await insertThreadConversation(
      ctx,
      conversation.guestKeyHash,
      user._id
    )
    await ctx.db.patch(thread._id, { conversationId })

    // Le modèle voit la liaison dans l'historique.
    const message = linkedMessage(user.firstName)
    await ctx.db.insert("assistantMessages", {
      conversationId,
      role: "assistant",
      content: message,
      requestId: `link:${request._id}`,
      createdAt: now,
    })
    await ctx.db.patch(conversationId, { lastMessageAt: now })

    await audit(ctx, {
      actorId: user._id,
      action: "messagerie.lier",
      entityTable: "messagingIdentities",
      entityId: identity._id,
      after: {
        channel: identity.channel,
        threadId: thread._id,
        conversationId,
      },
      metadata: { via: "start", requestId: request._id },
    })
    return { statut: "relie", message }
  },
})

/** Le fil est-il relié à un compte ? Pour répondre à `/connexion`. */
export const threadLinkState = internalQuery({
  args: { threadId: v.id("messagingThreads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread) throw new Error("Conversation multicanale introuvable.")
    const identity = await ctx.db.get(thread.identityId)
    return { relie: identity?.userId !== undefined }
  },
})

/**
 * `/deconnexion` : délie l'identité du fil et le fait repartir aussitôt sur
 * une conversation invitée neuve. Sans liaison, ne fait rien.
 */
export const unlinkThread = internalMutation({
  args: {
    threadId: v.id("messagingThreads"),
    guestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread) throw new Error("Conversation multicanale introuvable.")
    const identity = await ctx.db.get(thread.identityId)
    if (!identity?.userId) return { unlinked: false }

    const previousUserId = identity.userId
    await unlinkIdentity(ctx, identity)
    const conversationId = await insertThreadConversation(
      ctx,
      hashGuestKey(args.guestKey),
      undefined
    )
    await ctx.db.patch(thread._id, { conversationId, state: "active" })
    await audit(ctx, {
      actorId: previousUserId,
      action: "messagerie.delier",
      entityTable: "messagingIdentities",
      entityId: identity._id,
      after: { channel: identity.channel, threadId: thread._id },
      metadata: { via: "messagerie" },
    })
    return { unlinked: true }
  },
})

/**
 * Efface les demandes échues. Planifiée par un cron ; avance par lots et se
 * replanifie tant qu'il en reste.
 */
export const purgeExpiredRequests = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number; done: boolean }> => {
    const BATCH = 200
    const expired = await ctx.db
      .query("messagingLinkRequests")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(BATCH)
    for (const request of expired) await ctx.db.delete(request._id)
    const done = expired.length < BATCH
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal.messaging.linking.purgeExpiredRequests,
        {}
      )
    }
    return { deleted: expired.length, done }
  },
})

/* ─────────────────────────────── Déliaison ──────────────────────────────── */

/**
 * Délie une identité et ferme les conversations de ses fils qui portaient le
 * compte : plus aucun message du fil ne peut agir pour lui. Le fil repartira
 * sur une conversation invitée neuve (cf. `core.ensureThread`).
 */
async function unlinkIdentity(
  ctx: MutationCtx,
  identity: Doc<"messagingIdentities">
): Promise<Doc<"messagingThreads">[]> {
  const previousUserId = identity.userId
  await ctx.db.patch(identity._id, { userId: undefined, linkedAt: undefined })

  const threads = await ctx.db
    .query("messagingThreads")
    .withIndex("by_identity", (q) => q.eq("identityId", identity._id))
    .collect()
  for (const thread of threads) {
    const conversation = await ctx.db.get(thread.conversationId)
    if (
      conversation &&
      conversation.status === "active" &&
      conversation.userId !== undefined &&
      conversation.userId === previousUserId
    ) {
      await ctx.db.patch(conversation._id, { status: "closed" })
    }
  }
  return threads
}

/**
 * Remplace un identifiant externe par une empreinte non réversible : HMAC
 * avec un secret serveur, ou, sans secret, un marqueur tiré du seul
 * identifiant interne. L'index et le champ obligatoire restent satisfaits,
 * sans rien garder du numéro Telegram.
 */
function erasedExternalId(
  identityId: Id<"messagingIdentities"> | Id<"messagingThreads">,
  channel: string,
  externalId: string
): string {
  const secret =
    process.env.MESSAGING_SESSION_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret) return `efface:${identityId}`
  const digest = hmac(
    sha256,
    new TextEncoder().encode(secret),
    new TextEncoder().encode(`effacement:${channel}:${externalId}:${identityId}`)
  )
  return `efface:${bytesToHex(digest).slice(0, 32)}`
}

/**
 * Délie et efface les messageries d'un compte supprimé, sans prévenir les
 * fils : aucun message ne doit plus partir en son nom.
 *
 * L'identité garde sa ligne (les événements et les fils y renvoient), mais
 * plus son nom affiché ni son identifiant externe, remplacé par une empreinte
 * non réversible. Ses fils sont fermés et leur identifiant de conversation
 * externe effacé de même : si la personne écrit de nouveau au bot, elle
 * repart sur un fil et une identité neufs, en invitée.
 */
export async function delierMessageriesDuCompte(
  ctx: MutationCtx,
  userId: Doc<"users">["_id"]
): Promise<number> {
  const identites = await ctx.db
    .query("messagingIdentities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()
  // Les liens encore ouverts ne relieront plus rien.
  const demandes = await ctx.db
    .query("messagingLinkRequests")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "pending")
    )
    .collect()
  for (const demande of demandes) {
    await ctx.db.patch(demande._id, { status: "expired" })
  }

  for (const identite of identites) {
    const threads = await unlinkIdentity(ctx, identite)
    await ctx.db.patch(identite._id, {
      displayName: undefined,
      locale: undefined,
      externalUserId: erasedExternalId(
        identite._id,
        identite.channel,
        identite.externalUserId
      ),
    })
    for (const thread of threads) {
      await ctx.db.patch(thread._id, {
        state: "closed",
        externalThreadId: erasedExternalId(
          thread._id,
          thread.channel,
          thread.externalThreadId
        ),
      })
    }
  }
  return identites.length
}
