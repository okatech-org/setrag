import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
} from "convex/server"
import { v } from "convex/values"

export const continuityPolicyStatusValidator = v.union(
  v.literal("brouillon"),
  v.literal("approuve"),
  v.literal("retire")
)

export const continuityScopeTypeValidator = v.union(
  v.literal("entreprise"),
  v.literal("site"),
  v.literal("processus"),
  v.literal("systeme")
)

export const continuityExerciseTypeValidator = v.union(
  v.literal("restauration"),
  v.literal("bascule"),
  v.literal("hors_ligne"),
  v.literal("papier")
)

export const continuityExerciseResultValidator = v.union(
  v.literal("reussi"),
  v.literal("echoue"),
  v.literal("inconclusif")
)

export const continuityEvidenceReviewStatusValidator = v.union(
  v.literal("a_valider"),
  v.literal("approuve"),
  v.literal("rejete")
)

/**
 * Tables possédées par le registre PCA/PRA.
 *
 * Elles sont exportées séparément pour permettre une intégration additive au
 * schéma central. Une politique approuvée reste immuable : toute évolution
 * crée une nouvelle version reliée à la précédente.
 */
export const continuityTables = {
  continuityPolicies: defineTable({
    policyCode: v.string(),
    version: v.number(),
    title: v.string(),
    scopeType: continuityScopeTypeValidator,
    scopeReference: v.optional(v.string()),
    scopeDescription: v.string(),
    rpoSeconds: v.number(),
    rtoMinutes: v.number(),
    offlineAutonomyHours: v.number(),
    limitations: v.array(v.string()),
    status: continuityPolicyStatusValidator,
    previousVersionId: v.optional(v.id("continuityPolicies")),
    creationCorrelationId: v.string(),
    approvalCorrelationId: v.optional(v.string()),
    retirementCorrelationId: v.optional(v.string()),
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    retiredBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    retiredAt: v.optional(v.number()),
  })
    .index("by_code_version", ["policyCode", "version"])
    .index("by_code_status", ["policyCode", "status"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_creation_correlation", ["creationCorrelationId"])
    .index("by_approval_correlation", ["approvalCorrelationId"])
    .index("by_retirement_correlation", ["retirementCorrelationId"]),

  /**
   * Compte rendu et références probantes d'un exercice. Le résultat observé
   * et la validation de la preuve sont deux informations distinctes.
   */
  continuityExercises: defineTable({
    policyId: v.id("continuityPolicies"),
    type: continuityExerciseTypeValidator,
    startedAt: v.number(),
    endedAt: v.number(),
    observedRpoSeconds: v.optional(v.number()),
    observedRtoMinutes: v.optional(v.number()),
    result: continuityExerciseResultValidator,
    findings: v.array(v.string()),
    evidenceReferences: v.array(v.string()),
    reviewStatus: continuityEvidenceReviewStatusValidator,
    creationCorrelationId: v.string(),
    reviewCorrelationId: v.optional(v.string()),
    createdBy: v.id("users"),
    reviewedBy: v.optional(v.id("users")),
    reviewComment: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_policy_end", ["policyId", "endedAt"])
    .index("by_policy_review_end", ["policyId", "reviewStatus", "endedAt"])
    .index("by_creation_correlation", ["creationCorrelationId"])
    .index("by_review_correlation", ["reviewCorrelationId"]),
} as const

const continuitySchema = defineSchema(continuityTables)

/** Modèle local utilisé tant que le schéma central n'a pas composé ce lot. */
export type ContinuityDataModel = DataModelFromSchemaDefinition<
  typeof continuitySchema
>
