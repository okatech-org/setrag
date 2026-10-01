import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import { audit } from "../../lib/auth"
import { inscrireConstat, normaliserConstat } from "../etudes/ecriture"
import { estAuditeur } from "../etudes/model"
import { nomsDe } from "../etudes/outils"
import { assertCan } from "../platform/model"
import { contexteAgent, libelleRole } from "./agent"
import {
  OUTILS_COPILOT,
  configurationModele,
  messageNonConfigure,
  questionValide,
  titreDepuisQuestion,
} from "./model"
import { copilotSourceValidator } from "./tables"

type Ctx = QueryCtx | MutationCtx

const TITRE_PAR_DEFAUT = "Nouvelle conversation"
const BAIL_TOUR_MS = 10 * 60 * 1000

/** Copilot s'ouvre à qui peut consulter le module ; poser une question est une lecture. */
async function agentCopilot(ctx: Ctx) {
  const acces = await assertCan(ctx, {
    moduleCode: "copilot",
    resource: "copilot",
    permission: "consulter",
  })
  return acces.user
}

/** Supervision du journal d'usage : niveau Admin du module, ou droit de validation. */
async function peutSuperviser(ctx: Ctx): Promise<boolean> {
  for (const essai of [
    { permission: "consulter" as const, requiredLevel: "admin" as const },
    { permission: "valider" as const, requiredLevel: undefined },
  ]) {
    try {
      await assertCan(ctx, { moduleCode: "copilot", resource: "copilot", ...essai })
      return true
    } catch {
      // essai suivant
    }
  }
  return false
}

async function maConversation(ctx: Ctx, user: Doc<"users">, conversationId: Id<"copilotConversations">) {
  const conversation = await ctx.db.get(conversationId)
  if (!conversation || conversation.userId !== user._id) {
    throw new Error("Conversation introuvable.")
  }
  return conversation
}

async function journaliserEvenement(
  ctx: MutationCtx,
  user: Doc<"users">,
  evenement: Doc<"copilotJournal">["evenement"],
  extra: Partial<Omit<Doc<"copilotJournal">, "_id" | "_creationTime" | "userId" | "role" | "evenement">> = {}
) {
  await ctx.db.insert("copilotJournal", {
    userId: user._id,
    role: user.role,
    evenement,
    exemple: false,
    createdAt: Date.now(),
    ...extra,
  })
}

/* ═══════════════════════════════════════════════ Lecture ═══ */

/** État de Copilot pour l'agent : modèle, configuration, outils ouverts ou fermés. */
export const configuration = query({
  args: {},
  handler: async (ctx) => {
    await agentCopilot(ctx)
    const agent = await contexteAgent(ctx)
    const config = configurationModele()
    return {
      configure: config.apiKey.length > 0,
      provider: config.provider,
      model: config.model,
      messageNonConfigure: config.apiKey.length > 0 ? null : messageNonConfigure(config.provider),
      agent: { nom: agent.nom, role: agent.roleLibelle },
      outils: OUTILS_COPILOT.filter((outil) => outil.name !== "hors_perimetre").map((outil) => ({
        nom: outil.name,
        libelle: outil.label,
        ouvert: agent.ouverts.some((ouvert) => ouvert.name === outil.name),
        droitRequis: outil.droitRequis,
        ecriture: outil.requiresApproval,
      })),
      peutSuperviser: await peutSuperviser(ctx),
    }
  },
})

export const listerConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await agentCopilot(ctx)
    const conversations = await ctx.db
      .query("copilotConversations")
      .withIndex("by_user_last", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200)
    return conversations.map((conversation) => ({
      _id: conversation._id,
      titre: conversation.titre,
      statut: conversation.statut,
      exemple: conversation.exemple,
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.lastMessageAt,
    }))
  },
})

/** Une conversation, ses messages et ses propositions d'action. */
export const conversation = query({
  args: { conversationId: v.id("copilotConversations") },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation || conversation.userId !== user._id) return null
    const [messages, actions] = await Promise.all([
      ctx.db
        .query("copilotMessages")
        .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversation._id))
        .order("asc")
        .take(400),
      ctx.db
        .query("copilotActions")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .collect(),
    ])
    return {
      conversation: {
        _id: conversation._id,
        titre: conversation.titre,
        statut: conversation.statut,
        exemple: conversation.exemple,
        createdAt: conversation.createdAt,
      },
      messages: messages.map((message) => ({
        _id: message._id,
        requestId: message.requestId,
        role: message.role,
        contenu: message.contenu,
        statut: message.statut,
        erreur: message.erreur ?? null,
        sources: message.sources,
        outils: message.outils,
        provider: message.provider ?? null,
        model: message.model ?? null,
        retour: message.retour ?? null,
        createdAt: message.createdAt,
      })),
      actions: actions.map((action) => ({
        _id: action._id,
        requestId: action.requestId,
        outil: action.outil,
        libelle: action.libelle,
        entree: JSON.parse(action.entreeJson) as Record<string, string>,
        statut: action.statut,
        resultat: action.resultat ?? null,
        createdAt: action.createdAt,
        decideLe: action.decideLe ?? null,
      })),
    }
  },
})

/** Journal d'usage, réservé à la supervision. */
export const journal = query({
  args: {},
  handler: async (ctx) => {
    await agentCopilot(ctx)
    if (!(await peutSuperviser(ctx))) {
      throw new Error("Accès refusé : le journal d'usage de Copilot est réservé à son administration.")
    }
    const lignes = await ctx.db.query("copilotJournal").withIndex("by_created").order("desc").take(2_000)
    const noms = await nomsDe(ctx, lignes.map((ligne) => ligne.userId))
    const compte = (evenement: Doc<"copilotJournal">["evenement"]) =>
      lignes.filter((ligne) => ligne.evenement === evenement && !ligne.exemple).length
    const reponses = lignes.filter((ligne) => ligne.evenement === "reponse" && ligne.dureeMs !== undefined)
    return {
      indicateurs: {
        questions: compte("question"),
        reponses: compte("reponse"),
        outils: compte("outil"),
        refusPerimetre: compte("hors_perimetre"),
        outilsRefuses: compte("outil_refuse"),
        erreurs: compte("erreur") + compte("non_configure"),
        utiles: lignes.filter((ligne) => ligne.evenement === "retour" && ligne.detail === "utile").length,
        pasUtiles: lignes.filter((ligne) => ligne.evenement === "retour" && ligne.detail === "pas_utile").length,
        actionsConfirmees: compte("action_confirmee"),
        dureeMoyenneMs: reponses.length
          ? Math.round(reponses.reduce((total, ligne) => total + (ligne.dureeMs ?? 0), 0) / reponses.length)
          : null,
        tokens: lignes.reduce((total, ligne) => total + (ligne.tokensEntree ?? 0) + (ligne.tokensSortie ?? 0), 0),
      },
      lignes: lignes.map((ligne) => ({
        _id: ligne._id,
        agent: noms.get(ligne.userId) ?? "—",
        role: libelleRole(ligne.role as Doc<"users">["role"]),
        evenement: ligne.evenement,
        outil: ligne.outil ?? null,
        detail: ligne.detail ?? null,
        dureeMs: ligne.dureeMs ?? null,
        tokensEntree: ligne.tokensEntree ?? null,
        tokensSortie: ligne.tokensSortie ?? null,
        model: ligne.model ?? null,
        exemple: ligne.exemple,
        conversationId: ligne.conversationId ?? null,
        createdAt: ligne.createdAt,
      })),
    }
  },
})

/* ═══════════════════════════════════════════════ Écriture ═══ */

export const creerConversation = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await agentCopilot(ctx)
    const now = Date.now()
    const conversationId = await ctx.db.insert("copilotConversations", {
      userId: user._id,
      titre: TITRE_PAR_DEFAUT,
      statut: "active",
      exemple: false,
      createdAt: now,
      lastMessageAt: now,
    })
    return { conversationId }
  },
})

export const renommerConversation = mutation({
  args: { conversationId: v.id("copilotConversations"), titre: v.string() },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const conversation = await maConversation(ctx, user, args.conversationId)
    const titre = args.titre.replace(/\s+/g, " ").trim()
    if (titre.length < 2 || titre.length > 120) throw new Error("Le titre compte 2 à 120 caractères.")
    await ctx.db.patch(conversation._id, { titre })
    return { titre }
  },
})

export const archiverConversation = mutation({
  args: { conversationId: v.id("copilotConversations"), archiver: v.boolean() },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const conversation = await maConversation(ctx, user, args.conversationId)
    await ctx.db.patch(conversation._id, { statut: args.archiver ? "archivee" : "active" })
    return { statut: args.archiver ? "archivee" : "active" }
  },
})

/** Retour de l'agent sur une réponse : utile ou pas, avec un commentaire facultatif. */
export const donnerRetour = mutation({
  args: {
    messageId: v.id("copilotMessages"),
    retour: v.union(v.literal("utile"), v.literal("pas_utile")),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const message = await ctx.db.get(args.messageId)
    if (!message || message.role !== "assistant") throw new Error("Réponse introuvable.")
    const conversation = await maConversation(ctx, user, message.conversationId)
    if (message.statut !== "termine") throw new Error("Seule une réponse terminée s'évalue.")
    const commentaire = args.commentaire?.trim().slice(0, 1_000) || undefined
    await ctx.db.patch(message._id, { retour: args.retour, retourCommentaire: commentaire })
    await journaliserEvenement(ctx, user, "retour", {
      conversationId: conversation._id,
      requestId: message.requestId,
      detail: args.retour,
      ...(commentaire ? { outil: undefined } : {}),
    })
    return { retour: args.retour }
  },
})

/** Confirmation explicite d'une écriture proposée par Copilot. */
export const confirmerAction = mutation({
  args: { actionId: v.id("copilotActions") },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const action = await ctx.db.get(args.actionId)
    if (!action || action.userId !== user._id) throw new Error("Proposition introuvable.")
    if (action.statut !== "a_confirmer") throw new Error("Cette proposition a déjà été traitée.")
    const now = Date.now()
    if (action.outil !== "proposer_action_audit") throw new Error("Proposition inconnue.")
    if (!estAuditeur(user.role)) {
      await ctx.db.patch(action._id, { statut: "echec", resultat: "Droit audit et risques manquant.", decideLe: now })
      throw new Error("Accès refusé : le plan d'actions est tenu par la fonction audit et risques.")
    }
    const entree = JSON.parse(action.entreeJson) as {
      titre: string
      constat: string
      recommandation: string
      gravite: "majeure" | "moderee" | "mineure"
      direction: string
      echeance: string
    }
    const { constatId, reference } = await inscrireConstat(
      ctx,
      user._id,
      { ...entree, responsableId: user._id },
      "copilot"
    )
    await ctx.db.patch(action._id, { statut: "confirmee", resultat: reference, decideLe: now })
    await ctx.db.insert("copilotMessages", {
      conversationId: action.conversationId,
      requestId: `confirmation:${action._id}`,
      role: "assistant",
      contenu: `Action ${reference} inscrite au plan d'actions d'audit. Vous en êtes responsable : réaffectez-la depuis le plan d'actions si besoin.`,
      statut: "termine",
      sources: [{ outil: "plan_actions_audit", libelle: `${reference} — ${entree.titre}`, lien: `/etudes/plan-actions/${constatId}` }],
      outils: [],
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(action.conversationId, { lastMessageAt: now })
    await journaliserEvenement(ctx, user, "action_confirmee", {
      conversationId: action.conversationId,
      requestId: action.requestId,
      outil: action.outil,
      detail: reference,
    })
    await audit(ctx, {
      actorId: user._id,
      action: "copilot.action.confirmer",
      entityTable: "copilotActions",
      entityId: action._id,
      classification: "interne",
      after: { reference, constatId },
    })
    return { reference, constatId }
  },
})

export const refuserAction = mutation({
  args: { actionId: v.id("copilotActions") },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const action = await ctx.db.get(args.actionId)
    if (!action || action.userId !== user._id) throw new Error("Proposition introuvable.")
    if (action.statut !== "a_confirmer") throw new Error("Cette proposition a déjà été traitée.")
    const now = Date.now()
    await ctx.db.patch(action._id, { statut: "refusee", decideLe: now })
    await ctx.db.insert("copilotMessages", {
      conversationId: action.conversationId,
      requestId: `refus:${action._id}`,
      role: "assistant",
      contenu: "Proposition écartée à votre demande : rien n'a été enregistré.",
      statut: "termine",
      sources: [],
      outils: [],
      createdAt: now,
      updatedAt: now,
    })
    await journaliserEvenement(ctx, user, "action_refusee", {
      conversationId: action.conversationId,
      requestId: action.requestId,
      outil: action.outil,
    })
    return { refusee: true }
  },
})

/* ═══════════════════════════════════════════════ Tour (interne) ═══ */

/**
 * Ouvre un tour : contrôle d'accès, idempotence par `requestId`, message de
 * l'agent et réponse en attente. Sans clé de fournisseur, la réponse naît
 * avec le statut `non_configure` et un texte qui le dit : jamais de faux texte.
 */
export const debuterTour = internalMutation({
  args: {
    conversationId: v.id("copilotConversations"),
    requestId: v.string(),
    contenu: v.string(),
    configure: v.boolean(),
    provider: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const conversation = await maConversation(ctx, user, args.conversationId)
    if (conversation.statut !== "active") throw new Error("Cette conversation est archivée : restaurez-la pour continuer.")
    if (!args.requestId || args.requestId.length > 120) throw new Error("Identifiant de question invalide.")
    const contenu = questionValide(args.contenu)
    const now = Date.now()

    const tour = await ctx.db
      .query("copilotTours")
      .withIndex("by_conversation_request", (q) =>
        q.eq("conversationId", conversation._id).eq("requestId", args.requestId)
      )
      .unique()
    if (tour?.etat === "termine") return { etat: "deja_termine" as const }
    if (tour && tour.etat === "en_cours" && tour.bailJusqua > now) {
      throw new Error("Cette question est déjà en cours de traitement.")
    }
    if (tour) await ctx.db.patch(tour._id, { etat: "en_cours", bailJusqua: now + BAIL_TOUR_MS, updatedAt: now })
    else {
      await ctx.db.insert("copilotTours", {
        conversationId: conversation._id,
        requestId: args.requestId,
        etat: "en_cours",
        bailJusqua: now + BAIL_TOUR_MS,
        createdAt: now,
        updatedAt: now,
      })
    }

    const existants = await ctx.db
      .query("copilotMessages")
      .withIndex("by_conversation_request_role", (q) =>
        q.eq("conversationId", conversation._id).eq("requestId", args.requestId)
      )
      .collect()
    if (!existants.some((message) => message.role === "user")) {
      await ctx.db.insert("copilotMessages", {
        conversationId: conversation._id,
        requestId: args.requestId,
        role: "user",
        contenu,
        statut: "termine",
        sources: [],
        outils: [],
        createdAt: now,
        updatedAt: now,
      })
    }
    const reponseExistante = existants.find((message) => message.role === "assistant")
    const valeursReponse = {
      contenu: args.configure ? "" : messageNonConfigure(args.provider as "openai"),
      statut: args.configure ? ("en_cours" as const) : ("non_configure" as const),
      erreur: undefined,
      sources: [],
      outils: [],
      provider: args.provider,
      model: args.model,
      updatedAt: now,
    }
    const messageId = reponseExistante
      ? reponseExistante._id
      : await ctx.db.insert("copilotMessages", {
          conversationId: conversation._id,
          requestId: args.requestId,
          role: "assistant",
          createdAt: now + 1,
          ...valeursReponse,
        })
    if (reponseExistante) await ctx.db.patch(reponseExistante._id, valeursReponse)

    await ctx.db.patch(conversation._id, {
      lastMessageAt: now,
      ...(conversation.titre === TITRE_PAR_DEFAUT ? { titre: titreDepuisQuestion(contenu) } : {}),
    })
    await journaliserEvenement(ctx, user, "question", {
      conversationId: conversation._id,
      requestId: args.requestId,
      detail: contenu.slice(0, 280),
    })

    if (!args.configure) {
      await ctx.db.patch(
        (await ctx.db
          .query("copilotTours")
          .withIndex("by_conversation_request", (q) =>
            q.eq("conversationId", conversation._id).eq("requestId", args.requestId)
          )
          .unique())!._id,
        { etat: "termine", updatedAt: now }
      )
      await journaliserEvenement(ctx, user, "non_configure", {
        conversationId: conversation._id,
        requestId: args.requestId,
        provider: args.provider,
      })
      return { etat: "non_configure" as const }
    }

    const historique = (
      await ctx.db
        .query("copilotMessages")
        .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversation._id))
        .order("desc")
        .take(24)
    )
      .reverse()
      .filter(
        (message) =>
          message.statut === "termine" && message.contenu.trim() !== "" && message._id !== messageId
      )
      .map((message) => ({ role: message.role, content: message.contenu }))

    const agent = await contexteAgent(ctx)
    return {
      etat: "nouveau" as const,
      messageId,
      userId: user._id,
      nom: agent.nom,
      role: user.role,
      roleLibelle: agent.roleLibelle,
      ouverts: agent.ouverts.map((outil) => outil.name),
      historique,
    }
  },
})

export const ecrireReponse = internalMutation({
  args: { messageId: v.id("copilotMessages"), contenu: v.string() },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message || message.statut !== "en_cours") return
    await ctx.db.patch(message._id, { contenu: args.contenu, updatedAt: Date.now() })
  },
})

const outilValidator = v.object({
  nom: v.string(),
  libelle: v.string(),
  statut: v.union(v.literal("ok"), v.literal("refuse"), v.literal("erreur"), v.literal("confirmation")),
})

async function clore(ctx: MutationCtx, message: Doc<"copilotMessages">, etat: "termine" | "echec") {
  const tour = await ctx.db
    .query("copilotTours")
    .withIndex("by_conversation_request", (q) =>
      q.eq("conversationId", message.conversationId).eq("requestId", message.requestId)
    )
    .unique()
  if (tour) await ctx.db.patch(tour._id, { etat, updatedAt: Date.now() })
  await ctx.db.patch(message.conversationId, { lastMessageAt: Date.now() })
}

export const terminerTour = internalMutation({
  args: {
    messageId: v.id("copilotMessages"),
    contenu: v.string(),
    sources: v.array(copilotSourceValidator),
    outils: v.array(outilValidator),
    tokensEntree: v.number(),
    tokensSortie: v.number(),
    dureeMs: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Réponse introuvable.")
    await maConversation(ctx, user, message.conversationId)
    await ctx.db.patch(message._id, {
      contenu: args.contenu,
      statut: "termine",
      sources: args.sources,
      outils: args.outils,
      tokensEntree: args.tokensEntree,
      tokensSortie: args.tokensSortie,
      updatedAt: Date.now(),
    })
    await clore(ctx, message, "termine")
    await journaliserEvenement(ctx, user, "reponse", {
      conversationId: message.conversationId,
      requestId: message.requestId,
      detail: `${args.sources.length} source(s), ${args.outils.length} outil(s)`,
      dureeMs: args.dureeMs,
      tokensEntree: args.tokensEntree,
      tokensSortie: args.tokensSortie,
      provider: message.provider,
      model: message.model,
    })
  },
})

export const echouerTour = internalMutation({
  args: {
    messageId: v.id("copilotMessages"),
    contenu: v.string(),
    erreur: v.string(),
    detail: v.string(),
    outils: v.array(outilValidator),
  },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    const message = await ctx.db.get(args.messageId)
    if (!message) return
    await maConversation(ctx, user, message.conversationId)
    await ctx.db.patch(message._id, {
      contenu: args.contenu,
      statut: "erreur",
      erreur: args.erreur,
      outils: args.outils,
      updatedAt: Date.now(),
    })
    await clore(ctx, message, "echec")
    await journaliserEvenement(ctx, user, "erreur", {
      conversationId: message.conversationId,
      requestId: message.requestId,
      detail: args.detail.slice(0, 500),
      provider: message.provider,
      model: message.model,
    })
  },
})

export const journaliser = internalMutation({
  args: {
    conversationId: v.id("copilotConversations"),
    requestId: v.string(),
    evenement: v.union(v.literal("outil"), v.literal("outil_refuse"), v.literal("hors_perimetre")),
    outil: v.string(),
    detail: v.optional(v.string()),
    dureeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await agentCopilot(ctx)
    await maConversation(ctx, user, args.conversationId)
    await journaliserEvenement(ctx, user, args.evenement, {
      conversationId: args.conversationId,
      requestId: args.requestId,
      outil: args.outil,
      detail: args.detail?.slice(0, 500),
      dureeMs: args.dureeMs,
    })
  },
})

/**
 * Enregistre une proposition d'écriture, à confirmer par l'agent. Les champs
 * sont validés dès maintenant : une proposition invalide n'est jamais
 * présentée à la confirmation.
 */
export const proposerAction = internalMutation({
  args: {
    conversationId: v.id("copilotConversations"),
    messageId: v.id("copilotMessages"),
    requestId: v.string(),
    entreeJson: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true; actionId: Id<"copilotActions"> } | { ok: false; message: string }> => {
    const user = await agentCopilot(ctx)
    await maConversation(ctx, user, args.conversationId)
    if (!estAuditeur(user.role)) {
      return { ok: false, message: "Accès refusé : seule la fonction audit et risques tient le plan d'actions." }
    }
    let entree: Record<string, unknown>
    try {
      entree = JSON.parse(args.entreeJson) as Record<string, unknown>
      const gravite = entree.gravite
      if (gravite !== "majeure" && gravite !== "moderee" && gravite !== "mineure") {
        throw new Error("Gravité inconnue.")
      }
      normaliserConstat({
        titre: String(entree.titre ?? ""),
        constat: String(entree.constat ?? ""),
        recommandation: String(entree.recommandation ?? ""),
        direction: String(entree.direction ?? ""),
        echeance: String(entree.echeance ?? ""),
      })
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Proposition invalide." }
    }
    const actionId = await ctx.db.insert("copilotActions", {
      conversationId: args.conversationId,
      messageId: args.messageId,
      requestId: args.requestId,
      userId: user._id,
      outil: "proposer_action_audit",
      libelle: `Inscrire au plan d'actions : ${String(entree.titre)}`,
      entreeJson: JSON.stringify({
        titre: entree.titre,
        constat: entree.constat,
        recommandation: entree.recommandation,
        gravite: entree.gravite,
        direction: entree.direction,
        echeance: entree.echeance,
      }),
      statut: "a_confirmer",
      createdAt: Date.now(),
    })
    await journaliserEvenement(ctx, user, "action_proposee", {
      conversationId: args.conversationId,
      requestId: args.requestId,
      outil: "proposer_action_audit",
      detail: String(entree.titre).slice(0, 200),
    })
    return { ok: true, actionId }
  },
})
