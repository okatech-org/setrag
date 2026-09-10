import type { GenericId } from "convex/values"

export const MAX_CONTINUITY_LIMITATIONS = 20
export const MAX_CONTINUITY_FINDINGS = 50
export const MAX_CONTINUITY_EVIDENCE_REFERENCES = 20

export type ContinuityPolicyStatus = "brouillon" | "approuve" | "retire"
export type ContinuityScopeType =
  "entreprise" | "site" | "processus" | "systeme"
export type ContinuityExerciseType =
  "restauration" | "bascule" | "hors_ligne" | "papier"
export type ContinuityExerciseResult = "reussi" | "echoue" | "inconclusif"
export type ContinuityEvidenceReviewStatus = "a_valider" | "approuve" | "rejete"

export interface ContinuityObjectiveInput {
  readonly rpoSeconds: number
  readonly rtoMinutes: number
  readonly offlineAutonomyHours: number
}

export interface NormalizedContinuityObjectives {
  readonly rpoSeconds: number
  readonly rtoMinutes: number
  readonly offlineAutonomyHours: number
}

export interface ContinuityPolicyForReadiness extends NormalizedContinuityObjectives {
  readonly _id: GenericId<"continuityPolicies">
  readonly status: ContinuityPolicyStatus
  readonly createdAt: number
}

export interface ContinuityExerciseForReadiness {
  readonly _id: GenericId<"continuityExercises">
  readonly policyId: GenericId<"continuityPolicies">
  readonly type: ContinuityExerciseType
  readonly startedAt: number
  readonly endedAt: number
  readonly observedRpoSeconds?: number
  readonly observedRtoMinutes?: number
  readonly result: ContinuityExerciseResult
  readonly reviewStatus: ContinuityEvidenceReviewStatus
  readonly evidenceReferences: readonly string[]
}

export type ContinuityReadinessGap =
  | "objectifs_invalides"
  | "politique_non_approuvee"
  | "reprise_non_mesuree_ou_hors_objectifs"
  | "autonomie_hors_ligne_non_prouvee"
  | "procedure_papier_non_testee"

export interface ContinuityReadiness {
  readonly ready: boolean
  readonly objectivesValid: boolean
  readonly policyApproved: boolean
  readonly recoveryTargetsProven: boolean
  readonly offlineAutonomyProven: boolean
  readonly paperFallbackProven: boolean
  readonly recoveryExerciseId?: GenericId<"continuityExercises">
  readonly offlineExerciseId?: GenericId<"continuityExercises">
  readonly paperExerciseId?: GenericId<"continuityExercises">
  readonly gaps: readonly ContinuityReadinessGap[]
}

function assertSafeNonNegativeInteger(
  value: number,
  label: string,
  maximum: number
): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(
      `${label} doit être un entier sûr compris entre 0 et ${maximum}.`
    )
  }
  return value
}

/**
 * Valide uniquement la cohérence technique des objectifs. Leur approbation
 * et leur atteinte sont volontairement traitées séparément.
 */
export function validateContinuityObjectives(
  input: ContinuityObjectiveInput
): NormalizedContinuityObjectives {
  const rpoSeconds = assertSafeNonNegativeInteger(
    input.rpoSeconds,
    "Le RPO cible en secondes",
    7 * 24 * 60 * 60
  )
  const rtoMinutes = assertSafeNonNegativeInteger(
    input.rtoMinutes,
    "Le RTO cible en minutes",
    30 * 24 * 60
  )
  const offlineAutonomyHours = assertSafeNonNegativeInteger(
    input.offlineAutonomyHours,
    "L'autonomie hors ligne cible en heures",
    30 * 24
  )
  if (rtoMinutes === 0) {
    throw new Error("Le RTO cible doit être strictement positif.")
  }
  if (offlineAutonomyHours === 0) {
    throw new Error("L'autonomie hors ligne cible doit être positive.")
  }
  return { rpoSeconds, rtoMinutes, offlineAutonomyHours }
}

export function validateExerciseWindow(
  startedAt: number,
  endedAt: number
): { startedAt: number; endedAt: number; durationHours: number } {
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(endedAt)) {
    throw new Error("La fenêtre d'exercice doit utiliser des dates valides.")
  }
  if (startedAt < 0 || endedAt <= startedAt) {
    throw new Error("La fin de l'exercice doit suivre son début.")
  }
  return {
    startedAt,
    endedAt,
    durationHours: (endedAt - startedAt) / (60 * 60 * 1_000),
  }
}

export function validateObservedMetric(
  value: number | undefined,
  label: string,
  maximum: number
): number | undefined {
  if (value === undefined) return undefined
  return assertSafeNonNegativeInteger(value, label, maximum)
}

function isApprovedEvidence(
  policy: ContinuityPolicyForReadiness,
  exercise: ContinuityExerciseForReadiness
): boolean {
  if (
    exercise.policyId !== policy._id ||
    exercise.result !== "reussi" ||
    exercise.reviewStatus !== "approuve" ||
    exercise.evidenceReferences.length === 0 ||
    exercise.endedAt < policy.createdAt
  ) {
    return false
  }
  try {
    validateExerciseWindow(exercise.startedAt, exercise.endedAt)
  } catch {
    return false
  }
  return true
}

/**
 * Calcule une préparation strictement probante. Une valeur déclarative ou un
 * exercice réussi mais non validé/instrumenté ne satisfait jamais un objectif.
 */
export function computeContinuityReadiness(
  policy: ContinuityPolicyForReadiness,
  exercises: readonly ContinuityExerciseForReadiness[]
): ContinuityReadiness {
  let objectivesValid = true
  try {
    validateContinuityObjectives(policy)
  } catch {
    objectivesValid = false
  }
  const policyApproved = policy.status === "approuve"
  const evidence = exercises.filter((exercise) =>
    isApprovedEvidence(policy, exercise)
  )

  const recoveryExercise = evidence.find(
    (exercise) =>
      (exercise.type === "restauration" || exercise.type === "bascule") &&
      exercise.observedRpoSeconds !== undefined &&
      exercise.observedRtoMinutes !== undefined &&
      Number.isSafeInteger(exercise.observedRpoSeconds) &&
      Number.isSafeInteger(exercise.observedRtoMinutes) &&
      exercise.observedRpoSeconds >= 0 &&
      exercise.observedRtoMinutes >= 0 &&
      exercise.observedRpoSeconds <= policy.rpoSeconds &&
      exercise.observedRtoMinutes <= policy.rtoMinutes
  )
  const offlineExercise = evidence.find(
    (exercise) =>
      exercise.type === "hors_ligne" &&
      (exercise.endedAt - exercise.startedAt) / (60 * 60 * 1_000) >=
        policy.offlineAutonomyHours
  )
  const paperExercise = evidence.find((exercise) => exercise.type === "papier")

  const recoveryTargetsProven = recoveryExercise !== undefined
  const offlineAutonomyProven = offlineExercise !== undefined
  const paperFallbackProven = paperExercise !== undefined
  const gaps: ContinuityReadinessGap[] = []
  if (!objectivesValid) gaps.push("objectifs_invalides")
  if (!policyApproved) gaps.push("politique_non_approuvee")
  if (!recoveryTargetsProven) {
    gaps.push("reprise_non_mesuree_ou_hors_objectifs")
  }
  if (!offlineAutonomyProven) {
    gaps.push("autonomie_hors_ligne_non_prouvee")
  }
  if (!paperFallbackProven) gaps.push("procedure_papier_non_testee")

  return {
    ready:
      objectivesValid &&
      policyApproved &&
      recoveryTargetsProven &&
      offlineAutonomyProven &&
      paperFallbackProven,
    objectivesValid,
    policyApproved,
    recoveryTargetsProven,
    offlineAutonomyProven,
    paperFallbackProven,
    recoveryExerciseId: recoveryExercise?._id,
    offlineExerciseId: offlineExercise?._id,
    paperExerciseId: paperExercise?._id,
    gaps,
  }
}
