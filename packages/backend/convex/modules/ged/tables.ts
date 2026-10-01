import { defineTable } from "convex/server"
import { v } from "convex/values"

import { appRoleValidator } from "../platform/validators"

/** Niveau de confidentialité d'une pièce, du plus ouvert au plus fermé. */
export const gedClassificationValidator = v.union(
  v.literal("public"),
  v.literal("interne"),
  v.literal("confidentiel"),
  v.literal("restreint")
)

export const gedTypeDocumentValidator = v.union(
  v.literal("courrier_entrant"),
  v.literal("courrier_sortant"),
  v.literal("note_service"),
  v.literal("contrat"),
  v.literal("proces_verbal"),
  v.literal("rapport"),
  v.literal("piece_comptable"),
  v.literal("procedure"),
  v.literal("plan_technique"),
  v.literal("autre")
)

export const gedStatutDocumentValidator = v.union(
  v.literal("brouillon"),
  v.literal("en_circuit"),
  v.literal("valide"),
  v.literal("diffuse"),
  v.literal("refuse"),
  v.literal("archive"),
  v.literal("elimine")
)

export const gedNatureEtapeValidator = v.union(
  v.literal("visa"),
  v.literal("signature"),
  v.literal("diffusion")
)

/** Origine d'une ligne : saisie réelle ou jeu de démonstration du seed. */
export const gedOrigineValidator = v.union(v.literal("reel"), v.literal("demo"))

/**
 * Tables du module Bureautique et GED, composées dans le schéma racine.
 * Tous les noms portent le préfixe `ged`.
 */
export const gedTables = {
  /**
   * Plan de classement : une série par direction et processus, avec sa durée
   * de conservation et sa base. `aValider` signale une durée retenue par la
   * politique d'archivage sans texte légal précis : la Direction juridique
   * doit la confirmer.
   */
  gedClassement: defineTable({
    code: v.string(),
    libelle: v.string(),
    direction: v.string(),
    processus: v.string(),
    description: v.string(),
    /** `null` : conservation définitive. */
    conservationAnnees: v.union(v.number(), v.null()),
    baseConservation: v.string(),
    aValider: v.boolean(),
    sortFinal: v.union(
      v.literal("destruction"),
      v.literal("conservation_definitive"),
      v.literal("tri")
    ),
    classificationParDefaut: gedClassificationValidator,
    actif: v.boolean(),
    origine: gedOrigineValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_direction", ["direction", "code"]),

  /** Dossier documentaire : métadonnées stables, versions à part. */
  gedDocuments: defineTable({
    reference: v.string(),
    titre: v.string(),
    description: v.optional(v.string()),
    type: gedTypeDocumentValidator,
    classementId: v.id("gedClassement"),
    direction: v.string(),
    motsCles: v.array(v.string()),
    classification: gedClassificationValidator,
    statut: gedStatutDocumentValidator,
    /** Date propre de la pièce (signature, réception), AAAA-MM-JJ. */
    dateDocument: v.string(),
    versionCourante: v.number(),
    auteurId: v.id("users"),
    /** Correspondant pour un courrier (expéditeur ou destinataire). */
    correspondant: v.optional(v.string()),
    /** Fin de la durée légale de conservation, AAAA-MM-JJ ; absente : définitive. */
    conservationJusquau: v.optional(v.string()),
    archiveLe: v.optional(v.number()),
    archivePar: v.optional(v.id("users")),
    motifArchivage: v.optional(v.string()),
    elimineLe: v.optional(v.number()),
    eliminePar: v.optional(v.id("users")),
    motifElimination: v.optional(v.string()),
    /** Audience d'une note diffusée : rôles visés, ou tout le personnel. */
    diffusion: v.optional(
      v.object({
        tousLesAgents: v.boolean(),
        roles: v.array(appRoleValidator),
        diffuseLe: v.number(),
        diffusePar: v.id("users"),
        commentaire: v.optional(v.string()),
      })
    ),
    /** Concaténation normalisée des métadonnées : la recherche plein texte. */
    texteRecherche: v.string(),
    origine: gedOrigineValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_statut", ["statut", "updatedAt"])
    .index("by_type", ["type", "updatedAt"])
    .index("by_classement", ["classementId", "updatedAt"])
    .index("by_auteur", ["auteurId", "updatedAt"])
    .index("by_updated", ["updatedAt"])
    .index("by_origine", ["origine"])
    .searchIndex("recherche", {
      searchField: "texteRecherche",
      filterFields: ["statut", "type", "direction"],
    }),

  /** Version immuable d'une pièce, stockée dans Convex Storage. */
  gedVersions: defineTable({
    documentId: v.id("gedDocuments"),
    numero: v.number(),
    storageId: v.id("_storage"),
    nomFichier: v.string(),
    typeMime: v.string(),
    taille: v.number(),
    sha256: v.string(),
    commentaire: v.optional(v.string()),
    deposePar: v.id("users"),
    deposeLe: v.number(),
  })
    .index("by_document_numero", ["documentId", "numero"])
    .index("by_storage", ["storageId"]),

  /** Droit explicite accordé sur une pièce, à une personne ou à un rôle. */
  gedAcces: defineTable({
    documentId: v.id("gedDocuments"),
    userId: v.optional(v.id("users")),
    role: v.optional(appRoleValidator),
    droit: v.union(v.literal("lecture"), v.literal("edition")),
    accordePar: v.id("users"),
    accordeLe: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_user", ["userId"]),

  /** Journal de consultation : qui a ouvert quelle pièce, quand. */
  gedConsultations: defineTable({
    documentId: v.id("gedDocuments"),
    userId: v.id("users"),
    nature: v.union(
      v.literal("fiche"),
      v.literal("apercu"),
      v.literal("telechargement")
    ),
    versionNumero: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_document_at", ["documentId", "at"])
    .index("by_user_document_at", ["userId", "documentId", "at"]),

  /** Circuit de validation (parapheur) d'une pièce. */
  gedCircuits: defineTable({
    documentId: v.id("gedDocuments"),
    statut: v.union(
      v.literal("en_cours"),
      v.literal("termine"),
      v.literal("refuse"),
      v.literal("annule")
    ),
    etapeCourante: v.number(),
    totalEtapes: v.number(),
    initiePar: v.id("users"),
    initieLe: v.number(),
    termineLe: v.optional(v.number()),
    motifCloture: v.optional(v.string()),
    origine: gedOrigineValidator,
  })
    .index("by_document", ["documentId", "initieLe"])
    .index("by_statut", ["statut", "initieLe"])
    .index("by_initiateur", ["initiePar", "initieLe"]),

  /** Étape séquentielle : décidée une fois, jamais réécrite. */
  gedEtapes: defineTable({
    circuitId: v.id("gedCircuits"),
    documentId: v.id("gedDocuments"),
    rang: v.number(),
    nature: gedNatureEtapeValidator,
    libelle: v.string(),
    assigneId: v.id("users"),
    statut: v.union(
      v.literal("a_venir"),
      v.literal("en_attente"),
      v.literal("vise"),
      v.literal("signe"),
      v.literal("diffuse"),
      v.literal("refuse"),
      v.literal("annule")
    ),
    commentaire: v.optional(v.string()),
    ouverteLe: v.optional(v.number()),
    decideLe: v.optional(v.number()),
  })
    .index("by_circuit_rang", ["circuitId", "rang"])
    .index("by_assigne_statut", ["assigneId", "statut"])
    .index("by_document", ["documentId"]),

  /** Accusé de lecture d'une note diffusée. */
  gedAccuses: defineTable({
    documentId: v.id("gedDocuments"),
    userId: v.id("users"),
    luLe: v.number(),
  })
    .index("by_document", ["documentId", "luLe"])
    .index("by_user_document", ["userId", "documentId"]),

  /** Fil de discussion d'une pièce : la collaboration autour du document. */
  gedCommentaires: defineTable({
    documentId: v.id("gedDocuments"),
    auteurId: v.id("users"),
    texte: v.string(),
    createdAt: v.number(),
  }).index("by_document", ["documentId", "createdAt"]),

  /** Registre chronologique du courrier officiel (Bureau d'ordre central). */
  gedCourriers: defineTable({
    numero: v.string(),
    annee: v.number(),
    rang: v.number(),
    sens: v.union(v.literal("arrivee"), v.literal("depart")),
    dateCourrier: v.string(),
    enregistreLe: v.number(),
    correspondant: v.string(),
    objet: v.string(),
    referenceExterne: v.optional(v.string()),
    directionAffectee: v.string(),
    priorite: v.union(v.literal("normale"), v.literal("urgente")),
    echeanceReponse: v.optional(v.string()),
    statut: v.union(
      v.literal("enregistre"),
      v.literal("en_traitement"),
      v.literal("repondu"),
      v.literal("clos")
    ),
    documentId: v.optional(v.id("gedDocuments")),
    reponseCourrierId: v.optional(v.id("gedCourriers")),
    enregistrePar: v.id("users"),
    traitePar: v.optional(v.id("users")),
    commentaire: v.optional(v.string()),
    texteRecherche: v.string(),
    origine: gedOrigineValidator,
    updatedAt: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_sens_annee_rang", ["sens", "annee", "rang"])
    .index("by_enregistre", ["enregistreLe"])
    .index("by_statut", ["statut", "enregistreLe"])
    .index("by_reponse", ["reponseCourrierId"])
    .index("by_origine", ["origine"]),

  /** Compteurs transactionnels des numérotations (courrier, références). */
  gedCompteurs: defineTable({
    cle: v.string(),
    valeur: v.number(),
  }).index("by_cle", ["cle"]),
} as const
