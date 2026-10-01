import { defineTable } from "convex/server"
import { v } from "convex/values"

export const etudesGraviteValidator = v.union(
  v.literal("majeure"),
  v.literal("moderee"),
  v.literal("mineure")
)

export const etudesStatutConstatValidator = v.union(
  v.literal("a_lancer"),
  v.literal("en_cours"),
  v.literal("realisee"),
  v.literal("verifiee"),
  v.literal("abandonnee")
)

const origine = v.union(v.literal("reel"), v.literal("demo"))

/**
 * Tables de l'espace « Audit et documents » : la bibliothèque des études et
 * du dossier de recette, les annotations tracées et le plan d'actions d'audit.
 */
export const etudesTables = {
  /**
   * Étude publiée, chargée depuis les fichiers Markdown du dépôt par le seed
   * (`corpus.ts`). `empreinte` change dès que la source change.
   */
  etudesDocuments: defineTable({
    code: v.string(),
    numero: v.string(),
    titre: v.string(),
    categorie: v.string(),
    resume: v.string(),
    contenu: v.string(),
    fichierMd: v.string(),
    fichierPdf: v.optional(v.string()),
    empreinte: v.string(),
    mots: v.number(),
    ordre: v.number(),
    publieLe: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  /** Section d'une étude : l'unité de recherche et d'annotation. */
  etudesSections: defineTable({
    documentId: v.id("etudesDocuments"),
    rang: v.number(),
    ancre: v.string(),
    titre: v.string(),
    niveau: v.number(),
    texte: v.string(),
  })
    .index("by_document_rang", ["documentId", "rang"])
    .searchIndex("recherche", {
      searchField: "texte",
      filterFields: ["documentId"],
    }),

  /** Annotation d'un lecteur sur une étude ou une section. */
  etudesAnnotations: defineTable({
    documentId: v.id("etudesDocuments"),
    ancre: v.optional(v.string()),
    auteurId: v.id("users"),
    nature: v.union(
      v.literal("commentaire"),
      v.literal("question"),
      v.literal("reserve")
    ),
    texte: v.string(),
    statut: v.union(v.literal("ouverte"), v.literal("traitee")),
    reponse: v.optional(v.string()),
    traitePar: v.optional(v.id("users")),
    traiteLe: v.optional(v.number()),
    origine,
    createdAt: v.number(),
  })
    .index("by_document", ["documentId", "createdAt"])
    .index("by_statut", ["statut", "createdAt"]),

  /** Constat d'audit et sa recommandation : une ligne du plan d'actions. */
  etudesConstats: defineTable({
    reference: v.string(),
    titre: v.string(),
    constat: v.string(),
    recommandation: v.string(),
    gravite: etudesGraviteValidator,
    documentId: v.optional(v.id("etudesDocuments")),
    ancre: v.optional(v.string()),
    direction: v.string(),
    responsableId: v.id("users"),
    echeance: v.string(),
    statut: etudesStatutConstatValidator,
    avancement: v.number(),
    creePar: v.id("users"),
    origine,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_statut", ["statut", "echeance"])
    .index("by_responsable", ["responsableId", "echeance"])
    .index("by_document", ["documentId"])
    .index("by_origine", ["origine"]),

  /** Suivi d'un constat : chaque changement, chaque commentaire, horodaté. */
  etudesSuivis: defineTable({
    constatId: v.id("etudesConstats"),
    auteurId: v.id("users"),
    nature: v.union(
      v.literal("creation"),
      v.literal("commentaire"),
      v.literal("statut"),
      v.literal("avancement"),
      v.literal("modification")
    ),
    texte: v.optional(v.string()),
    avant: v.optional(v.string()),
    apres: v.optional(v.string()),
    at: v.number(),
  }).index("by_constat", ["constatId", "at"]),

  /** Compteur des références du plan d'actions (AUD-2026-001). */
  etudesCompteurs: defineTable({
    cle: v.string(),
    valeur: v.number(),
  }).index("by_cle", ["cle"]),
} as const
