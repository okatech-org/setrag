import { defineTable } from "convex/server"
import { v } from "convex/values"

/** Source citée par une réponse : la donnée du SI qui l'a nourrie. */
export const copilotSourceValidator = v.object({
  outil: v.string(),
  libelle: v.string(),
  detail: v.optional(v.string()),
  lien: v.optional(v.string()),
})

/**
 * Tables de SETRAG Copilot. Elles sont distinctes des tables `assistant*` de
 * Ruban : Copilot sert le personnel, avec ses habilitations, et non le
 * voyageur ; il réutilise en revanche le même accès aux modèles
 * (`ai/providers.ts`) et le même regroupement du flux (`ai/flux.ts`).
 */
export const copilotTables = {
  copilotConversations: defineTable({
    userId: v.id("users"),
    titre: v.string(),
    statut: v.union(v.literal("active"), v.literal("archivee")),
    /** Conversation d'exemple créée par le seed, signalée comme telle. */
    exemple: v.boolean(),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  })
    .index("by_user_last", ["userId", "lastMessageAt"])
    .index("by_exemple", ["exemple"]),

  copilotMessages: defineTable({
    conversationId: v.id("copilotConversations"),
    requestId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    contenu: v.string(),
    statut: v.union(
      v.literal("en_cours"),
      v.literal("termine"),
      v.literal("erreur"),
      v.literal("non_configure")
    ),
    erreur: v.optional(v.string()),
    sources: v.array(copilotSourceValidator),
    outils: v.array(
      v.object({
        nom: v.string(),
        libelle: v.string(),
        statut: v.union(
          v.literal("ok"),
          v.literal("refuse"),
          v.literal("erreur"),
          v.literal("confirmation")
        ),
      })
    ),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    tokensEntree: v.optional(v.number()),
    tokensSortie: v.optional(v.number()),
    retour: v.optional(v.union(v.literal("utile"), v.literal("pas_utile"))),
    retourCommentaire: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_conversation_request_role", [
      "conversationId",
      "requestId",
      "role",
    ]),

  /**
   * Écriture proposée par Copilot : rien n'est exécuté avant la confirmation
   * explicite de l'utilisateur, qui passe par une mutation dédiée.
   */
  copilotActions: defineTable({
    conversationId: v.id("copilotConversations"),
    messageId: v.optional(v.id("copilotMessages")),
    requestId: v.string(),
    userId: v.id("users"),
    outil: v.string(),
    libelle: v.string(),
    entreeJson: v.string(),
    statut: v.union(
      v.literal("a_confirmer"),
      v.literal("confirmee"),
      v.literal("refusee"),
      v.literal("echec")
    ),
    resultat: v.optional(v.string()),
    createdAt: v.number(),
    decideLe: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_user_statut", ["userId", "statut"]),

  /** Journal d'usage pour l'administrateur : questions, outils, refus, erreurs. */
  copilotJournal: defineTable({
    userId: v.id("users"),
    role: v.string(),
    conversationId: v.optional(v.id("copilotConversations")),
    requestId: v.optional(v.string()),
    evenement: v.union(
      v.literal("question"),
      v.literal("reponse"),
      v.literal("outil"),
      v.literal("outil_refuse"),
      v.literal("hors_perimetre"),
      v.literal("erreur"),
      v.literal("non_configure"),
      v.literal("retour"),
      v.literal("action_proposee"),
      v.literal("action_confirmee"),
      v.literal("action_refusee")
    ),
    outil: v.optional(v.string()),
    detail: v.optional(v.string()),
    dureeMs: v.optional(v.number()),
    tokensEntree: v.optional(v.number()),
    tokensSortie: v.optional(v.number()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    exemple: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_exemple", ["exemple"]),

  /** Tours en cours : un même message n'est jamais traité deux fois en parallèle. */
  copilotTours: defineTable({
    conversationId: v.id("copilotConversations"),
    requestId: v.string(),
    etat: v.union(v.literal("en_cours"), v.literal("termine"), v.literal("echec")),
    bailJusqua: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_conversation_request", ["conversationId", "requestId"]),
} as const
