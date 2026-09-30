import { type DocumentByName, type GenericDatabaseReader } from "convex/server"
import type { GenericId } from "convex/values"
import { v } from "convex/values"

import { query, type QueryCtx } from "../../_generated/server"
import { assertCan } from "../platform/model"
import {
  computeContinuityReadiness,
  type ContinuityPolicyStatus,
} from "./model"
import {
  type ContinuityDataModel,
  continuityPolicyStatusValidator,
} from "./tables"

const MAX_POLICY_LIST = 100
const MAX_SUMMARY_POLICIES = 25
const MAX_EXERCISES_PER_POLICY = 50

type ContinuityReader = GenericDatabaseReader<ContinuityDataModel>
type ContinuityPolicy = DocumentByName<
  ContinuityDataModel,
  "continuityPolicies"
>

function continuityDb(ctx: QueryCtx): ContinuityReader {
  return ctx.db as unknown as ContinuityReader
}

function boundedLimit(
  value: number | undefined,
  defaultValue: number,
  maximum: number
): number {
  const limit = value ?? defaultValue
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new Error(
      `La limite doit être un entier compris entre 1 et ${maximum}.`
    )
  }
  return limit
}

function normalizedPolicyCode(value: string): string {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_.-]{1,79}$/.test(code)) {
    throw new Error("Le code de politique PCA/PRA est invalide.")
  }
  return code
}

async function authorizeRead(ctx: QueryCtx): Promise<void> {
  await assertCan(ctx, {
    moduleCode: "securite",
    resource: "securite",
    permission: "consulter",
  })
}

async function exercisesForPolicy(
  db: ContinuityReader,
  policyId: GenericId<"continuityPolicies">,
  limit: number
) {
  return await db
    .query("continuityExercises")
    .withIndex("by_policy_end", (builder) => builder.eq("policyId", policyId))
    .order("desc")
    .take(limit)
}

export const listPolicies = query({
  args: {
    policyCode: v.optional(v.string()),
    status: v.optional(continuityPolicyStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeRead(ctx)
    const db = continuityDb(ctx)
    const limit = boundedLimit(args.limit, 50, MAX_POLICY_LIST)
    const policyCode = args.policyCode
      ? normalizedPolicyCode(args.policyCode)
      : undefined

    if (policyCode && args.status) {
      return await db
        .query("continuityPolicies")
        .withIndex("by_code_status", (builder) =>
          builder.eq("policyCode", policyCode).eq("status", args.status!)
        )
        .order("desc")
        .take(limit)
    }
    if (policyCode) {
      return await db
        .query("continuityPolicies")
        .withIndex("by_code_version", (builder) =>
          builder.eq("policyCode", policyCode)
        )
        .order("desc")
        .take(limit)
    }
    if (args.status) {
      return await db
        .query("continuityPolicies")
        .withIndex("by_status_updated", (builder) =>
          builder.eq("status", args.status!)
        )
        .order("desc")
        .take(limit)
    }
    return await db.query("continuityPolicies").order("desc").take(limit)
  },
})

export const getPolicyReadiness = query({
  args: {
    policyId: v.id("continuityPolicies"),
    exerciseLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeRead(ctx)
    const db = continuityDb(ctx)
    const policy = await db.get(args.policyId)
    if (!policy) throw new Error("Politique PCA/PRA introuvable.")
    const exerciseLimit = boundedLimit(
      args.exerciseLimit,
      50,
      MAX_EXERCISES_PER_POLICY
    )
    const exerciseCandidates = await exercisesForPolicy(
      db,
      policy._id,
      exerciseLimit + 1
    )
    const exercises = exerciseCandidates.slice(0, exerciseLimit)
    return {
      policy,
      exercises,
      readiness: computeContinuityReadiness(policy, exercises),
      exerciseWindowLimit: exerciseLimit,
      exerciseWindowTruncated: exerciseCandidates.length > exerciseLimit,
    }
  },
})

/**
 * Synthèse volontairement bornée. Elle ne prétend pas couvrir les politiques
 * au-delà de la fenêtre renvoyée et expose cette borne dans la réponse.
 */
export const getContinuitySummary = query({
  args: { policyLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await authorizeRead(ctx)
    const db = continuityDb(ctx)
    const policyLimit = boundedLimit(args.policyLimit, 20, MAX_SUMMARY_POLICIES)
    const approvedCandidates = await db
      .query("continuityPolicies")
      .withIndex("by_status_updated", (builder) =>
        builder.eq("status", "approuve")
      )
      .order("desc")
      .take(policyLimit + 1)
    const approved = approvedCandidates.slice(0, policyLimit)

    const policies = await Promise.all(
      approved.map(async (policy) => {
        const exerciseCandidates = await exercisesForPolicy(
          db,
          policy._id,
          MAX_EXERCISES_PER_POLICY + 1
        )
        const exercises = exerciseCandidates.slice(0, MAX_EXERCISES_PER_POLICY)
        return {
          policy,
          readiness: computeContinuityReadiness(policy, exercises),
          exerciseWindowTruncated:
            exerciseCandidates.length > MAX_EXERCISES_PER_POLICY,
        }
      })
    )
    const readyCount = policies.filter(
      ({ readiness }) => readiness.ready
    ).length
    const provenanceState =
      policies.length === 0
        ? ("empty" as const)
        : policies.every(({ policy }) => policy.policyCode.startsWith("DEMO-"))
          ? ("synthetic_demo" as const)
          : ("operational" as const)

    return {
      provenanceState,
      dataset:
        provenanceState === "synthetic_demo"
          ? {
              label: "Exercices PCA/PRA ferroviaires — démonstration",
              notice:
                "Scénarios et preuves entièrement synthétiques, sans valeur d'audit ni de certification.",
            }
          : null,
      dataState:
        policies.length === 0
          ? ("aucune_politique_approuvee" as const)
          : readyCount === policies.length
            ? ("preuves_completes" as const)
            : ("preuves_incompletes" as const),
      evaluatedPolicyCount: policies.length,
      readyPolicyCount: readyCount,
      notReadyPolicyCount: policies.length - readyCount,
      policyWindowLimit: policyLimit,
      policyWindowTruncated: approvedCandidates.length > policyLimit,
      exerciseWindowLimit: MAX_EXERCISES_PER_POLICY,
      policies,
    }
  },
})

export type { ContinuityPolicy, ContinuityPolicyStatus }
