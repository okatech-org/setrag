import type { GenericId } from "convex/values"
import { describe, expect, it } from "vitest"

import {
  computeContinuityReadiness,
  validateContinuityObjectives,
  validateExerciseWindow,
  validateObservedMetric,
  type ContinuityExerciseForReadiness,
  type ContinuityPolicyForReadiness,
} from "./model"

const policyId = "policy-1" as GenericId<"continuityPolicies">
const createdAt = Date.UTC(2026, 8, 1)

function policy(
  overrides: Partial<ContinuityPolicyForReadiness> = {}
): ContinuityPolicyForReadiness {
  return {
    _id: policyId,
    status: "approuve",
    rpoSeconds: 0,
    rtoMinutes: 15,
    offlineAutonomyHours: 72,
    createdAt,
    ...overrides,
  }
}

function exercise(
  suffix: string,
  overrides: Partial<ContinuityExerciseForReadiness>
): ContinuityExerciseForReadiness {
  return {
    _id: `exercise-${suffix}` as GenericId<"continuityExercises">,
    policyId,
    type: "restauration",
    startedAt: createdAt + 60_000,
    endedAt: createdAt + 120_000,
    result: "reussi",
    reviewStatus: "approuve",
    evidenceReferences: [`GED:PCA-${suffix}`],
    ...overrides,
  }
}

describe("Modèle PCA/PRA", () => {
  it("valide des objectifs mesurables sans prétendre qu'ils sont atteints", () => {
    expect(
      validateContinuityObjectives({
        rpoSeconds: 0,
        rtoMinutes: 15,
        offlineAutonomyHours: 72,
      })
    ).toEqual({
      rpoSeconds: 0,
      rtoMinutes: 15,
      offlineAutonomyHours: 72,
    })
    expect(computeContinuityReadiness(policy(), [])).toMatchObject({
      ready: false,
      policyApproved: true,
      recoveryTargetsProven: false,
      offlineAutonomyProven: false,
      paperFallbackProven: false,
    })
  })

  it("refuse des objectifs ou fenêtres incohérents", () => {
    expect(() =>
      validateContinuityObjectives({
        rpoSeconds: 0.5,
        rtoMinutes: 15,
        offlineAutonomyHours: 72,
      })
    ).toThrow("RPO")
    expect(() =>
      validateContinuityObjectives({
        rpoSeconds: 1,
        rtoMinutes: 0,
        offlineAutonomyHours: 72,
      })
    ).toThrow("strictement positif")
    expect(() => validateExerciseWindow(2_000, 1_000)).toThrow("doit suivre")
    expect(() => validateObservedMetric(0.25, "Le RPO observé", 1_000)).toThrow(
      "entier sûr"
    )
  })

  it("reste fail-closed face aux déclarations sans mesures ou non validées", () => {
    const readiness = computeContinuityReadiness(policy(), [
      exercise("non-mesure", {}),
      exercise("non-valide", {
        observedRpoSeconds: 0,
        observedRtoMinutes: 10,
        reviewStatus: "a_valider",
      }),
      exercise("sans-preuve", {
        observedRpoSeconds: 0,
        observedRtoMinutes: 10,
        evidenceReferences: [],
      }),
    ])
    expect(readiness.ready).toBe(false)
    expect(readiness.recoveryTargetsProven).toBe(false)
    expect(readiness.gaps).toContain("reprise_non_mesuree_ou_hors_objectifs")
  })

  it("n'est prêt qu'avec reprise mesurée, 72 h hors ligne et papier testés", () => {
    const recovery = exercise("recovery", {
      type: "bascule",
      observedRpoSeconds: 0,
      observedRtoMinutes: 12,
    })
    const offline = exercise("offline", {
      type: "hors_ligne",
      startedAt: createdAt + 60_000,
      endedAt: createdAt + 60_000 + 72 * 60 * 60 * 1_000,
    })
    const paper = exercise("paper", { type: "papier" })

    expect(
      computeContinuityReadiness(policy(), [recovery, offline, paper])
    ).toEqual({
      ready: true,
      objectivesValid: true,
      policyApproved: true,
      recoveryTargetsProven: true,
      offlineAutonomyProven: true,
      paperFallbackProven: true,
      recoveryExerciseId: recovery._id,
      offlineExerciseId: offline._id,
      paperExerciseId: paper._id,
      gaps: [],
    })
  })

  it("ne compte ni un échec ni une preuve antérieure à la politique", () => {
    const readiness = computeContinuityReadiness(policy(), [
      exercise("failed", {
        observedRpoSeconds: 0,
        observedRtoMinutes: 10,
        result: "echoue",
      }),
      exercise("old", {
        startedAt: createdAt - 120_000,
        endedAt: createdAt - 60_000,
        observedRpoSeconds: 0,
        observedRtoMinutes: 10,
      }),
    ])
    expect(readiness.recoveryTargetsProven).toBe(false)
  })

  it("ferme la préparation si des objectifs persistés sont invalides", () => {
    const readiness = computeContinuityReadiness(
      policy({ rtoMinutes: 1.5 }),
      []
    )
    expect(readiness).toMatchObject({
      ready: false,
      objectivesValid: false,
      gaps: expect.arrayContaining(["objectifs_invalides"]),
    })
  })
})
