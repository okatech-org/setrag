import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import {
  assertActiveUser,
  audit,
  getUser,
  loadActor,
  requireUser,
} from "../lib/auth"
import { delierMessageriesDuCompte } from "../messaging/linking"
import { internal } from "../_generated/api"
import { effacerNotesDuCompte } from "../ai/memory"
import { CURRENT_CGV_VERSION } from "../model/cgv"
import { civiliteAEnregistrer, type Civilite } from "../model/titulaire"
import { gender } from "../schema"

/**
 * Espace client — profil, consentements et droits sur les données.
 *
 * Le CDC fait de l'espace client une option de l'achat, mais la conformité,
 * elle, ne l'est pas : consentement explicite, révocation, export et
 * suppression sont exigés par la loi gabonaise comme par la gouvernance
 * ERAMET.
 */

/** Version courante des conditions générales de vente (source : model/cgv). */
export { CURRENT_CGV_VERSION }

/*
 * Chaque opération du voyageur est écrite une fois, pour un profil déjà
 * résolu. Les fonctions publiques le lisent dans le jeton de session ; les
 * variantes `…ForActor`, internes, le reçoivent du code serveur qui a résolu
 * l'acteur d'une conversation d'assistant (web ou messagerie). Aucune
 * fonction publique n'accepte d'identifiant de compte venu du client.
 */

async function profileOf(ctx: QueryCtx, user: Doc<"users">) {
  const consents = await ctx.db
    .query("consents")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect()
  return {
    user,
    consents: consents.filter((c) => c.revokedAt === undefined),
  }
}

/** Profil du voyageur connecté, ou `null` s'il ne l'est pas. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user) return null
    return await profileOf(ctx, user)
  },
})

/** Variante interne de `me` pour un acteur résolu par le serveur. */
export const meForActor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) return null
    return await profileOf(ctx, user)
  },
})

/**
 * Crée le profil applicatif au premier accès.
 *
 * Better Auth gère l'identité ; cette table porte le rôle et les données
 * métier. L'appel est idempotent : un profil existant est simplement
 * rafraîchi.
 */
export const ensureProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Non authentifié")

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique()

    // Un jeton encore valide après la suppression du compte ne doit pas faire
    // renaître un profil pour l'identité effacée.
    if (!existing) {
      const supprimee = await ctx.db
        .query("identitesSupprimees")
        .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
        .first()
      if (supprimee) throw new Error("Session expirée : reconnectez-vous")
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        firstName: args.firstName ?? existing.firstName,
        lastName: args.lastName ?? existing.lastName,
        phone: args.phone ?? existing.phone,
        email: args.email ?? existing.email,
        lastSeenAt: Date.now(),
      })
      return existing._id
    }

    // Tout compte créé par le parcours public est un voyageur : les rôles
    // internes sont provisionnés par l'administration, jamais auto-attribués.
    return await ctx.db.insert("users", {
      authId: identity.subject,
      firstName: args.firstName,
      lastName: args.lastName,
      phone: args.phone ?? identity.phoneNumber,
      email: args.email ?? identity.email,
      role: "voyageur",
      identitySource: "local",
      isActive: true,
      lastSeenAt: Date.now(),
    })
  },
})

/*
 * Le profil porte le voyageur « Moi » : nom, coordonnées et civilité du
 * titulaire (voir `model/titulaire.ts`). Chaque champ est facultatif :
 * `undefined` laisse la valeur en place.
 */
const profileFields = {
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  gender: v.optional(gender),
}

async function updateProfileOf(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    firstName?: string
    lastName?: string
    phone?: string
    email?: string
    gender?: Civilite
  }
): Promise<void> {
  await ctx.db.patch(user._id, {
    firstName: args.firstName ?? user.firstName,
    lastName: args.lastName ?? user.lastName,
    phone: args.phone ?? user.phone,
    email: args.email ?? user.email,
    gender: args.gender ?? user.gender,
  })
}

/**
 * Complète la civilité du titulaire avec celle qu'il vient de donner pour
 * lui-même dans une réservation (site, application, Ruban, messagerie) : elle
 * ne lui sera plus demandée. Seulement si le profil n'en porte pas encore et
 * qu'un voyageur du dossier porte exactement ses prénom et nom ; jamais pour
 * remplacer une civilité connue. Rend la civilité enregistrée, ou `null`.
 */
export async function completerCiviliteDuTitulaire(
  ctx: MutationCtx,
  user: Doc<"users"> | null,
  voyageurs: ReadonlyArray<{
    firstName: string
    lastName: string
    gender: Civilite
  }>
): Promise<Civilite | null> {
  if (!user) return null
  const civilite = civiliteAEnregistrer(user, voyageurs)
  if (!civilite) return null
  await ctx.db.patch(user._id, { gender: civilite })
  await audit(ctx, {
    actorId: user._id,
    action: "profil.completer_civilite",
    entityTable: "users",
    entityId: user._id,
    after: { gender: civilite, via: "reservation" },
  })
  return civilite
}

export const updateProfile = mutation({
  args: profileFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await updateProfileOf(ctx, user, args)
  },
})

export const updateProfileForActor = internalMutation({
  args: { userId: v.id("users"), ...profileFields },
  handler: async (ctx, { userId, ...fields }) => {
    const user = assertActiveUser(await loadActor(ctx, userId))
    await updateProfileOf(ctx, user, fields)
  },
})

/* ────────────────────── Voyageurs enregistrés ─────────────────────────── */

/**
 * Fiches de voyageurs mémorisées, pour préremplir un dossier.
 *
 * Ces fiches n'ont aucune valeur de titre : le billet fige sa propre copie de
 * l'identité au moment de l'émission, et modifier une fiche ici ne touche
 * jamais un billet déjà vendu.
 */
async function savedPassengersOf(ctx: QueryCtx, user: Doc<"users">) {
  const rows = await ctx.db
    .query("savedPassengers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect()
  return rows.sort((a, b) => a.lastName.localeCompare(b.lastName))
}

export const listSavedPassengers = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await savedPassengersOf(ctx, user)
  },
})

export const listSavedPassengersForActor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = assertActiveUser(await loadActor(ctx, args.userId))
    return await savedPassengersOf(ctx, user)
  },
})

const savedPassengerFields = {
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
  emergencyPhone: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  discountCode: v.optional(v.string()),
}

export const addSavedPassenger = mutation({
  args: savedPassengerFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (!args.lastName.trim() || !args.firstName.trim()) {
      throw new Error("Le nom et le prénom du voyageur sont obligatoires")
    }

    const now = Date.now()
    const id = await ctx.db.insert("savedPassengers", {
      ...args,
      lastName: args.lastName.trim(),
      firstName: args.firstName.trim(),
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    })

    await audit(ctx, {
      actorId: user._id,
      action: "voyageur_enregistre.ajouter",
      entityTable: "savedPassengers",
      entityId: id,
      after: { lastName: args.lastName, firstName: args.firstName },
    })
    return id
  },
})

export const updateSavedPassenger = mutation({
  args: { passengerId: v.id("savedPassengers"), ...savedPassengerFields },
  handler: async (ctx, { passengerId, ...fields }) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db.get(passengerId)
    // On ne révèle pas qu'une fiche existe chez quelqu'un d'autre : même
    // message dans les deux cas.
    if (!existing || existing.userId !== user._id) {
      throw new Error("Voyageur enregistré introuvable")
    }
    if (!fields.lastName.trim() || !fields.firstName.trim()) {
      throw new Error("Le nom et le prénom du voyageur sont obligatoires")
    }

    await ctx.db.patch(passengerId, {
      ...fields,
      lastName: fields.lastName.trim(),
      firstName: fields.firstName.trim(),
      updatedAt: Date.now(),
    })

    await audit(ctx, {
      actorId: user._id,
      action: "voyageur_enregistre.modifier",
      entityTable: "savedPassengers",
      entityId: passengerId,
      before: { lastName: existing.lastName, firstName: existing.firstName },
      after: { lastName: fields.lastName, firstName: fields.firstName },
    })
  },
})

export const removeSavedPassenger = mutation({
  args: { passengerId: v.id("savedPassengers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db.get(args.passengerId)
    if (!existing || existing.userId !== user._id) {
      throw new Error("Voyageur enregistré introuvable")
    }

    await ctx.db.delete(args.passengerId)
    await audit(ctx, {
      actorId: user._id,
      action: "voyageur_enregistre.supprimer",
      entityTable: "savedPassengers",
      entityId: args.passengerId,
      before: { lastName: existing.lastName, firstName: existing.firstName },
    })
  },
})

/* ───────────────────────────── Consentements ───────────────────────────── */

const consentType = v.union(
  v.literal("cgv"),
  v.literal("donnees"),
  v.literal("marketing"),
)

const grantConsentFields = {
  type: consentType,
  version: v.optional(v.string()),
  channel: v.union(
    v.literal("web"),
    v.literal("mobile"),
    v.literal("guichet"),
  ),
}

async function grantConsentFor(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    type: "cgv" | "donnees" | "marketing"
    version?: string
    channel: "web" | "mobile" | "guichet"
  },
) {
  const version = args.version ?? CURRENT_CGV_VERSION

  // Un consentement déjà actif pour la même version n'est pas dupliqué.
  const existing = await ctx.db
    .query("consents")
    .withIndex("by_user_type", (q) =>
      q.eq("userId", user._id).eq("type", args.type),
    )
    .collect()
  const actif = existing.find(
    (c) => c.version === version && c.revokedAt === undefined,
  )
  if (actif) return actif._id

  return await ctx.db.insert("consents", {
    userId: user._id,
    type: args.type,
    version,
    grantedAt: Date.now(),
    channel: args.channel,
  })
}

/** Enregistre un consentement explicite, horodaté et versionné. */
export const grantConsent = mutation({
  args: grantConsentFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    return await grantConsentFor(ctx, user, args)
  },
})

export const grantConsentForActor = internalMutation({
  args: { userId: v.id("users"), ...grantConsentFields },
  handler: async (ctx, { userId, ...args }) => {
    const user = assertActiveUser(await loadActor(ctx, userId))
    return await grantConsentFor(ctx, user, args)
  },
})

async function revokeConsentFor(
  ctx: MutationCtx,
  user: Doc<"users">,
  type: "cgv" | "donnees" | "marketing",
) {
  if (type === "cgv") {
    throw new Error(
      "Les conditions générales ne peuvent pas être révoquées tant qu'une " +
        "réservation est en cours",
    )
  }
  const consents = await ctx.db
    .query("consents")
    .withIndex("by_user_type", (q) =>
      q.eq("userId", user._id).eq("type", type),
    )
    .collect()
  let revoked = 0
  for (const consent of consents.filter((c) => c.revokedAt === undefined)) {
    await ctx.db.patch(consent._id, { revokedAt: Date.now() })
    revoked += 1
  }
  return { revoked }
}

/** Révoque un consentement — droit d'opposition. */
export const revokeConsent = mutation({
  args: { type: consentType },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    return await revokeConsentFor(ctx, user, args.type)
  },
})

export const revokeConsentForActor = internalMutation({
  args: { userId: v.id("users"), type: consentType },
  handler: async (ctx, args) => {
    const user = assertActiveUser(await loadActor(ctx, args.userId))
    return await revokeConsentFor(ctx, user, args.type)
  },
})

export const listConsents = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await ctx.db
      .query("consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
  },
})

/* ──────────────────────── Droits sur les données ───────────────────────── */

/** Conversations avec Ruban exportées au plus, des plus récentes aux plus anciennes. */
const EXPORT_CONVERSATIONS_MAX = 50
/** Messages et tours lus au plus par conversation (les plus récents). */
const EXPORT_MESSAGES_MAX = 200
const EXPORT_TOURS_MAX = 100
/**
 * Volume lu au plus pour les conversations (caractères JSON), loin des
 * limites d'une requête : au-delà, les plus anciennes ne sont pas lues et
 * l'export le dit (`assistantConversationsTruncated`) plutôt que d'échouer.
 */
const EXPORT_VOLUME_ASSISTANT_MAX = 6_000_000

/**
 * Export des données personnelles — droit d'accès.
 * Rassemble tout ce que le système détient sur le voyageur connecté.
 */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect()

    const tickets = []
    for (const sale of sales) {
      const t = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect()
      tickets.push(...t)
    }

    const [consents, notifications, savedPassengers, assistantMemories] = await Promise.all([
      ctx.db
        .query("consents")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("savedPassengers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("assistantMemories")
        .withIndex("by_user_and_updated_at", (q) => q.eq("userId", user._id))
        .collect(),
    ])

    // Les conversations avec Ruban : ce qui s'est écrit, et ce que Ruban
    // garde de ses outils pour le relire d'un tour à l'autre (sorties
    // projetées, voir `ai/rejeu.ts`). Bornées pour tenir dans une requête.
    const conversations = await ctx.db
      .query("assistantConversations")
      .withIndex("by_user_and_last_message_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(EXPORT_CONVERSATIONS_MAX)
    const assistantConversations = []
    let volumeAssistant = 0
    let assistantConversationsTruncated = false
    for (const conversation of conversations) {
      if (volumeAssistant > EXPORT_VOLUME_ASSISTANT_MAX) {
        assistantConversationsTruncated = true
        break
      }
      const [messages, turns] = await Promise.all([
        ctx.db
          .query("assistantMessages")
          .withIndex("by_conversation_and_created_at", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .order("desc")
          .take(EXPORT_MESSAGES_MAX),
        ctx.db
          .query("assistantTurns")
          .withIndex("by_conversation_and_created_at", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .order("desc")
          .take(EXPORT_TOURS_MAX),
      ])
      for (const document of [...messages, ...turns]) {
        volumeAssistant += JSON.stringify(document).length
      }
      assistantConversations.push({
        startedAt: new Date(conversation.createdAt).toISOString(),
        lastMessageAt: new Date(conversation.lastMessageAt).toISOString(),
        status: conversation.status,
        // Les échanges écrits. Les sorties d'outils brutes (`role: "tool"`)
        // n'y sont pas : ce que Ruban en garde est dans `toolCalls`, et les
        // dossiers eux-mêmes sont exportés plus haut (ventes, billets).
        messages: messages
          .filter((message) => message.role !== "tool")
          .reverse()
          .map((message) => ({
            role: message.role,
            content: message.content,
            date: new Date(message.createdAt).toISOString(),
          })),
        toolCalls: turns.reverse().flatMap((turn) =>
          (turn.toolCalls ?? []).map((call) => ({
            toolName: call.toolName,
            input: call.inputJson,
            output: call.outputJson ?? null,
            status: call.status,
            date: new Date(turn.createdAt).toISOString(),
          })),
        ),
        truncated:
          messages.length === EXPORT_MESSAGES_MAX ||
          turns.length === EXPORT_TOURS_MAX,
      })
    }

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        phone: user.phone,
        email: user.email,
        createdAt: new Date(user._creationTime).toISOString(),
      },
      sales: sales.map((s) => ({
        reference: s.number,
        date: new Date(s.soldAt).toISOString(),
        status: s.status,
        amountTtc: s.amounts.ttc,
      })),
      tickets: tickets.map((t) => ({
        number: t.number,
        passenger: t.passenger,
        serviceClass: t.serviceClass,
        status: t.status,
      })),
      consents,
      // Ces fiches ne servent qu'au préremplissage, mais elles portent des
      // données personnelles de tiers : elles font partie de l'export.
      savedPassengers: savedPassengers.map((p) => ({
        lastName: p.lastName,
        firstName: p.firstName,
        gender: p.gender,
        phone: p.phone,
        emergencyPhone: p.emergencyPhone,
        birthDate: p.birthDate,
      })),
      // Ce que Ruban retient : visible dans le compte, et donc exporté.
      assistantMemories: assistantMemories.map((note) => ({
        category: note.category,
        content: note.content,
        createdAt: new Date(note.createdAt).toISOString(),
        updatedAt: new Date(note.updatedAt).toISOString(),
      })),
      assistantConversations,
      assistantConversationsTruncated,
      notifications: notifications.length,
    }
  },
})

/**
 * Suppression du compte — droit à l'effacement.
 *
 * Les données commerciales et comptables ne sont PAS supprimées : elles
 * relèvent d'une obligation de conservation. Le profil est anonymisé, ce qui
 * satisfait le droit à l'effacement sans casser la comptabilité. Les fiches
 * de voyageurs, ce que Ruban retient du compte et les conversations avec
 * l'assistant (messages, tours avec les appels d'outils gardés pour le
 * rejeu, exécutions d'outils, sessions vocales) sont effacés ; les
 * messageries reliées sont déliées et anonymisées.
 */
export const deleteMyAccount = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.confirmation !== "SUPPRIMER") {
      throw new Error(
        "Confirmation invalide : saisissez SUPPRIMER pour effacer le compte",
      )
    }

    const pending = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect()
    const enCours = pending.filter(
      (s) => s.status === "en_attente_paiement",
    )
    if (enCours.length > 0) {
      throw new Error(
        `${enCours.length} réservation(s) en cours : réglez-les ou annulez-` +
          `les avant de supprimer le compte`,
      )
    }

    // Le profil est détaché de l'identité de connexion : la session encore
    // ouverte ne le retrouve plus, et le même numéro ouvrira un compte neuf.
    await ctx.db.patch(user._id, {
      authId: `supprime:${user._id}`,
      firstName: "Compte",
      lastName: "supprimé",
      gender: undefined,
      phone: undefined,
      email: undefined,
      isActive: false,
    })
    await ctx.db.insert("identitesSupprimees", {
      authId: user.authId,
      userId: user._id,
      supprimeeLe: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.betterAuth.effacement.effacerIdentite, { authId: user.authId })

    const consents = await ctx.db
      .query("consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    for (const consent of consents.filter((c) => c.revokedAt === undefined)) {
      await ctx.db.patch(consent._id, { revokedAt: Date.now() })
    }

    // Les fiches de voyageurs n'ont aucune valeur comptable : contrairement au
    // profil, qui est anonymisé, elles sont effacées pour de bon.
    const savedPassengers = await ctx.db
      .query("savedPassengers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
    for (const passenger of savedPassengers) {
      await ctx.db.delete(passenger._id)
    }

    // Ce que Ruban retient du voyageur n'a de sens que pour lui : effacé
    // aussi. Le plafond par compte tient l'effacement dans la transaction.
    const notesEffacees = await effacerNotesDuCompte(ctx, user._id)

    // Un fil Telegram ou WhatsApp relié ne doit plus pouvoir agir pour un
    // compte supprimé : les liaisons tombent, les conversations se ferment,
    // et l'identité de messagerie perd son nom et son identifiant externe.
    const messageriesDeliees = await delierMessageriesDuCompte(ctx, user._id)

    // Les conversations avec Ruban portent ce que le voyageur a écrit : elles
    // sont effacées, par lots, hors de cette transaction.
    await ctx.scheduler.runAfter(0, internal.ai.conversations.purgeUserData, {
      userId: user._id,
    })

    await audit(ctx, {
      actorId: user._id,
      action: "compte.supprimer",
      entityTable: "users",
      entityId: user._id,
      after: {
        anonymized: true,
        messageriesDeliees,
        notesEffacees,
        note: "Données commerciales conservées par obligation légale",
      },
    })

    return { anonymized: true, salesRetained: pending.length }
  },
})
