import { type DocumentByName, type GenericDatabaseWriter } from "convex/server"
import { v } from "convex/values"

import { mutation, type MutationCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { assertCan } from "../platform/model"
import {
  MAX_CONTINUITY_EVIDENCE_REFERENCES,
  MAX_CONTINUITY_FINDINGS,
  MAX_CONTINUITY_LIMITATIONS,
  validateContinuityObjectives,
  validateExerciseWindow,
  validateObservedMetric,
} from "./model"
import {
  type ContinuityDataModel,
  continuityExerciseResultValidator,
  continuityExerciseTypeValidator,
  continuityScopeTypeValidator,
} from "./tables"

type ContinuityWriter = GenericDatabaseWriter<ContinuityDataModel>
type ContinuityPolicy = DocumentByName<
  ContinuityDataModel,
  "continuityPolicies"
>
type ContinuityExercise = DocumentByName<
  ContinuityDataModel,
  "continuityExercises"
>

function continuityDb(ctx: MutationCtx): ContinuityWriter {
  // Ce cast local disparaît lorsque continuityTables est composé au schéma
  // central et que les types Convex sont régénérés.
  return ctx.db as unknown as ContinuityWriter
}

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maximum} caractères sans caractère de contrôle.`
    )
  }
  return normalized
}

function optionalText(
  value: string | undefined,
  label: string,
  maximum: number
): string | undefined {
  return value === undefined ? undefined : requiredText(value, label, maximum)
}

function normalizedPolicyCode(value: string): string {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_.-]{1,79}$/.test(code)) {
    throw new Error(
      "Le code de politique doit contenir 2 à 80 lettres, chiffres, points, tirets ou soulignés."
    )
  }
  return code
}

function normalizedList(
  values: readonly string[],
  label: string,
  maximumItems: number,
  maximumLength: number
): string[] {
  if (values.length < 1 || values.length > maximumItems) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maximumItems} éléments.`
    )
  }
  const normalized = values.map((value, index) =>
    requiredText(value, `${label} ${index + 1}`, maximumLength)
  )
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} ne doit pas contenir de doublon.`)
  }
  return normalized
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

async function authorize(ctx: MutationCtx, permission: "creer" | "modifier") {
  return await assertCan(ctx, {
    moduleCode: "securite",
    resource: "securite",
    permission,
  })
}

function samePolicyCreation(
  policy: ContinuityPolicy,
  input: {
    policyCode: string
    title: string
    scopeType: ContinuityPolicy["scopeType"]
    scopeReference?: string
    scopeDescription: string
    rpoSeconds: number
    rtoMinutes: number
    offlineAutonomyHours: number
    limitations: readonly string[]
    createdBy: ContinuityPolicy["createdBy"]
  }
): boolean {
  return (
    policy.policyCode === input.policyCode &&
    policy.title === input.title &&
    policy.scopeType === input.scopeType &&
    policy.scopeReference === input.scopeReference &&
    policy.scopeDescription === input.scopeDescription &&
    policy.rpoSeconds === input.rpoSeconds &&
    policy.rtoMinutes === input.rtoMinutes &&
    policy.offlineAutonomyHours === input.offlineAutonomyHours &&
    policy.createdBy === input.createdBy &&
    sameStringArray(policy.limitations, input.limitations)
  )
}

function sameExerciseCreation(
  exercise: ContinuityExercise,
  input: Omit<
    ContinuityExercise,
    | "_id"
    | "_creationTime"
    | "reviewStatus"
    | "creationCorrelationId"
    | "reviewCorrelationId"
    | "reviewedBy"
    | "reviewComment"
    | "reviewedAt"
    | "createdAt"
    | "updatedAt"
  >
): boolean {
  return (
    exercise.policyId === input.policyId &&
    exercise.type === input.type &&
    exercise.startedAt === input.startedAt &&
    exercise.endedAt === input.endedAt &&
    exercise.observedRpoSeconds === input.observedRpoSeconds &&
    exercise.observedRtoMinutes === input.observedRtoMinutes &&
    exercise.result === input.result &&
    exercise.createdBy === input.createdBy &&
    sameStringArray(exercise.findings, input.findings) &&
    sameStringArray(exercise.evidenceReferences, input.evidenceReferences)
  )
}

export const createPolicyVersion = mutation({
  args: {
    policyCode: v.string(),
    title: v.string(),
    scopeType: continuityScopeTypeValidator,
    scopeReference: v.optional(v.string()),
    scopeDescription: v.string(),
    rpoSeconds: v.number(),
    rtoMinutes: v.number(),
    offlineAutonomyHours: v.number(),
    limitations: v.array(v.string()),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "creer")
    const db = continuityDb(ctx)
    const policyCode = normalizedPolicyCode(args.policyCode)
    const title = requiredText(args.title, "Le titre", 200)
    const scopeReference = optionalText(
      args.scopeReference,
      "La référence de portée",
      160
    )
    if (args.scopeType !== "entreprise" && scopeReference === undefined) {
      throw new Error(
        "La référence de portée est obligatoire hors portée entreprise."
      )
    }
    const scopeDescription = requiredText(
      args.scopeDescription,
      "La description de portée",
      500
    )
    const objectives = validateContinuityObjectives(args)
    const limitations = normalizedList(
      args.limitations,
      "Les limites déclarées",
      MAX_CONTINUITY_LIMITATIONS,
      500
    )
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )

    const replay = await db
      .query("continuityPolicies")
      .withIndex("by_creation_correlation", (builder) =>
        builder.eq("creationCorrelationId", correlationId)
      )
      .unique()
    const normalized = {
      policyCode,
      title,
      scopeType: args.scopeType,
      scopeReference,
      scopeDescription,
      ...objectives,
      limitations,
      createdBy: access.user._id,
    }
    if (replay) {
      if (!samePolicyCreation(replay, normalized)) {
        throw new Error(
          "Collision de corrélation avec une autre version de politique PCA/PRA."
        )
      }
      return { policyId: replay._id, version: replay.version, duplicate: true }
    }

    const latest = await db
      .query("continuityPolicies")
      .withIndex("by_code_version", (builder) =>
        builder.eq("policyCode", policyCode)
      )
      .order("desc")
      .first()
    if (latest?.status === "brouillon") {
      throw new Error(
        "Une version brouillon existe déjà pour cette politique PCA/PRA."
      )
    }

    const now = Date.now()
    const values = {
      ...normalized,
      version: (latest?.version ?? 0) + 1,
      status: "brouillon" as const,
      previousVersionId: latest?._id,
      creationCorrelationId: correlationId,
      createdAt: now,
      updatedAt: now,
    }
    const policyId = await db.insert("continuityPolicies", values)
    await audit(ctx, {
      actorId: access.user._id,
      action: "continuite.politique.version_creer",
      entityTable: "continuityPolicies",
      entityId: policyId,
      permission: "creer",
      correlationId,
      classification: "restreint",
      after: values,
    })
    return { policyId, version: values.version, duplicate: false }
  },
})

export const approvePolicyVersion = mutation({
  args: {
    policyId: v.id("continuityPolicies"),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    // La matrice actuelle expose l'écriture du module Sécurité via `modifier`.
    // La séparation des tâches ci-dessous reste obligatoire et indépendante.
    const access = await authorize(ctx, "modifier")
    const db = continuityDb(ctx)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const policy = await db.get(args.policyId)
    if (!policy) throw new Error("Politique PCA/PRA introuvable.")

    if (
      policy.status === "approuve" &&
      policy.approvalCorrelationId === correlationId
    ) {
      return { policyId: policy._id, status: policy.status, duplicate: true }
    }
    const correlationCollision = await db
      .query("continuityPolicies")
      .withIndex("by_approval_correlation", (builder) =>
        builder.eq("approvalCorrelationId", correlationId)
      )
      .unique()
    if (correlationCollision) {
      throw new Error(
        "Collision de corrélation avec une autre validation PCA/PRA."
      )
    }
    if (policy.status !== "brouillon") {
      throw new Error("Seule une politique brouillon peut être approuvée.")
    }
    if (policy.createdBy === access.user._id) {
      throw new Error(
        "Le créateur d'une politique PCA/PRA ne peut pas la valider."
      )
    }
    const latest = await db
      .query("continuityPolicies")
      .withIndex("by_code_version", (builder) =>
        builder.eq("policyCode", policy.policyCode)
      )
      .order("desc")
      .first()
    if (latest?._id !== policy._id) {
      throw new Error("Seule la dernière version peut être approuvée.")
    }

    const now = Date.now()
    const previouslyApproved = await db
      .query("continuityPolicies")
      .withIndex("by_code_status", (builder) =>
        builder.eq("policyCode", policy.policyCode).eq("status", "approuve")
      )
      .collect()
    for (const previous of previouslyApproved) {
      await db.patch(previous._id, {
        status: "retire",
        retirementCorrelationId: correlationId,
        retiredBy: access.user._id,
        retiredAt: now,
        updatedAt: now,
      })
    }
    const after = {
      status: "approuve" as const,
      approvalCorrelationId: correlationId,
      approvedBy: access.user._id,
      approvedAt: now,
      updatedAt: now,
    }
    await db.patch(policy._id, after)
    await audit(ctx, {
      actorId: access.user._id,
      action: "continuite.politique.version_valider",
      entityTable: "continuityPolicies",
      entityId: policy._id,
      permission: "valider",
      correlationId,
      classification: "restreint",
      before: {
        status: policy.status,
        replacedPolicyIds: previouslyApproved.map(({ _id }) => _id),
      },
      after,
    })
    return { policyId: policy._id, status: after.status, duplicate: false }
  },
})

export const retirePolicyVersion = mutation({
  args: {
    policyId: v.id("continuityPolicies"),
    reason: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "modifier")
    const db = continuityDb(ctx)
    const reason = requiredText(args.reason, "Le motif", 500)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const policy = await db.get(args.policyId)
    if (!policy) throw new Error("Politique PCA/PRA introuvable.")
    if (
      policy.status === "retire" &&
      policy.retirementCorrelationId === correlationId
    ) {
      return { policyId: policy._id, status: policy.status, duplicate: true }
    }
    const correlationCollision = await db
      .query("continuityPolicies")
      .withIndex("by_retirement_correlation", (builder) =>
        builder.eq("retirementCorrelationId", correlationId)
      )
      .unique()
    if (correlationCollision) {
      throw new Error(
        "Collision de corrélation avec un autre retrait de politique PCA/PRA."
      )
    }
    if (policy.status === "retire") {
      throw new Error("Cette politique PCA/PRA est déjà retirée.")
    }

    const now = Date.now()
    const after = {
      status: "retire" as const,
      retirementCorrelationId: correlationId,
      retiredBy: access.user._id,
      retiredAt: now,
      updatedAt: now,
    }
    await db.patch(policy._id, after)
    await audit(ctx, {
      actorId: access.user._id,
      action: "continuite.politique.version_retirer",
      entityTable: "continuityPolicies",
      entityId: policy._id,
      permission: "modifier",
      reason,
      correlationId,
      classification: "restreint",
      before: { status: policy.status },
      after,
    })
    return { policyId: policy._id, status: after.status, duplicate: false }
  },
})

export const recordExerciseEvidence = mutation({
  args: {
    policyId: v.id("continuityPolicies"),
    type: continuityExerciseTypeValidator,
    startedAt: v.number(),
    endedAt: v.number(),
    observedRpoSeconds: v.optional(v.number()),
    observedRtoMinutes: v.optional(v.number()),
    result: continuityExerciseResultValidator,
    findings: v.array(v.string()),
    evidenceReferences: v.array(v.string()),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "creer")
    const db = continuityDb(ctx)
    const policy = await db.get(args.policyId)
    if (!policy) throw new Error("Politique PCA/PRA introuvable.")
    if (policy.status === "retire") {
      throw new Error("Une politique retirée ne peut plus recevoir de preuve.")
    }
    const window = validateExerciseWindow(args.startedAt, args.endedAt)
    const observedRpoSeconds = validateObservedMetric(
      args.observedRpoSeconds,
      "Le RPO observé en secondes",
      7 * 24 * 60 * 60
    )
    const observedRtoMinutes = validateObservedMetric(
      args.observedRtoMinutes,
      "Le RTO observé en minutes",
      30 * 24 * 60
    )
    if (
      args.result === "reussi" &&
      (args.type === "restauration" || args.type === "bascule") &&
      (observedRpoSeconds === undefined || observedRtoMinutes === undefined)
    ) {
      throw new Error(
        "Un exercice de reprise réussi exige un RPO et un RTO observés."
      )
    }
    const findings = normalizedList(
      args.findings,
      "Les constats",
      MAX_CONTINUITY_FINDINGS,
      1_000
    )
    const evidenceReferences = normalizedList(
      args.evidenceReferences,
      "Les références de preuve",
      MAX_CONTINUITY_EVIDENCE_REFERENCES,
      500
    )
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const normalized = {
      policyId: policy._id,
      type: args.type,
      startedAt: window.startedAt,
      endedAt: window.endedAt,
      observedRpoSeconds,
      observedRtoMinutes,
      result: args.result,
      findings,
      evidenceReferences,
      createdBy: access.user._id,
    }
    const replay = await db
      .query("continuityExercises")
      .withIndex("by_creation_correlation", (builder) =>
        builder.eq("creationCorrelationId", correlationId)
      )
      .unique()
    if (replay) {
      if (!sameExerciseCreation(replay, normalized)) {
        throw new Error(
          "Collision de corrélation avec une autre preuve d'exercice PCA/PRA."
        )
      }
      return { exerciseId: replay._id, duplicate: true }
    }

    const now = Date.now()
    const values = {
      ...normalized,
      reviewStatus: "a_valider" as const,
      creationCorrelationId: correlationId,
      createdAt: now,
      updatedAt: now,
    }
    const exerciseId = await db.insert("continuityExercises", values)
    await audit(ctx, {
      actorId: access.user._id,
      action: "continuite.exercice.preuve_enregistrer",
      entityTable: "continuityExercises",
      entityId: exerciseId,
      permission: "creer",
      correlationId,
      classification: "restreint",
      after: values,
    })
    return { exerciseId, duplicate: false }
  },
})

export const reviewExerciseEvidence = mutation({
  args: {
    exerciseId: v.id("continuityExercises"),
    decision: v.union(v.literal("approuver"), v.literal("rejeter")),
    comment: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "modifier")
    const db = continuityDb(ctx)
    const comment = requiredText(args.comment, "Le commentaire", 1_000)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const exercise = await db.get(args.exerciseId)
    if (!exercise) throw new Error("Exercice PCA/PRA introuvable.")
    const reviewStatus =
      args.decision === "approuver"
        ? ("approuve" as const)
        : ("rejete" as const)
    if (
      exercise.reviewStatus === reviewStatus &&
      exercise.reviewCorrelationId === correlationId &&
      exercise.reviewComment === comment
    ) {
      return {
        exerciseId: exercise._id,
        reviewStatus: exercise.reviewStatus,
        duplicate: true,
      }
    }
    const correlationCollision = await db
      .query("continuityExercises")
      .withIndex("by_review_correlation", (builder) =>
        builder.eq("reviewCorrelationId", correlationId)
      )
      .unique()
    if (correlationCollision) {
      throw new Error(
        "Collision de corrélation avec une autre validation de preuve PCA/PRA."
      )
    }
    if (exercise.reviewStatus !== "a_valider") {
      throw new Error("Cette preuve d'exercice a déjà été examinée.")
    }
    if (exercise.createdBy === access.user._id) {
      throw new Error(
        "Le créateur d'une preuve PCA/PRA ne peut pas la valider."
      )
    }

    const now = Date.now()
    const after = {
      reviewStatus,
      reviewCorrelationId: correlationId,
      reviewedBy: access.user._id,
      reviewComment: comment,
      reviewedAt: now,
      updatedAt: now,
    }
    await db.patch(exercise._id, after)
    await audit(ctx, {
      actorId: access.user._id,
      action:
        args.decision === "approuver"
          ? "continuite.exercice.preuve_valider"
          : "continuite.exercice.preuve_rejeter",
      entityTable: "continuityExercises",
      entityId: exercise._id,
      permission: "valider",
      reason: comment,
      correlationId,
      classification: "restreint",
      before: { reviewStatus: exercise.reviewStatus },
      after,
    })
    return { exerciseId: exercise._id, reviewStatus, duplicate: false }
  },
})
