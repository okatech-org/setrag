import { defineSchema, makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import appSchema from "../../schema"
import { modules } from "../../test.setup"
import { continuityTables } from "./tables"

const schema = defineSchema({ ...appSchema.tables, ...continuityTables })

type PolicyId = GenericId<"continuityPolicies">
type ExerciseId = GenericId<"continuityExercises">

type CreatePolicyArgs = {
  policyCode: string
  title: string
  scopeType: "entreprise" | "site" | "processus" | "systeme"
  scopeReference?: string
  scopeDescription: string
  rpoSeconds: number
  rtoMinutes: number
  offlineAutonomyHours: number
  limitations: string[]
  correlationId: string
}

type RecordExerciseArgs = {
  policyId: PolicyId
  type: "restauration" | "bascule" | "hors_ligne" | "papier"
  startedAt: number
  endedAt: number
  observedRpoSeconds?: number
  observedRtoMinutes?: number
  result: "reussi" | "echoue" | "inconclusif"
  findings: string[]
  evidenceReferences: string[]
  correlationId: string
}

const createPolicyVersion = makeFunctionReference<
  "mutation",
  CreatePolicyArgs,
  { policyId: PolicyId; version: number; duplicate: boolean }
>("modules/continuity/mutations:createPolicyVersion")

const approvePolicyVersion = makeFunctionReference<
  "mutation",
  { policyId: PolicyId; correlationId: string },
  { policyId: PolicyId; status: "approuve"; duplicate: boolean }
>("modules/continuity/mutations:approvePolicyVersion")

const recordExerciseEvidence = makeFunctionReference<
  "mutation",
  RecordExerciseArgs,
  { exerciseId: ExerciseId; duplicate: boolean }
>("modules/continuity/mutations:recordExerciseEvidence")

const reviewExerciseEvidence = makeFunctionReference<
  "mutation",
  {
    exerciseId: ExerciseId
    decision: "approuver" | "rejeter"
    comment: string
    correlationId: string
  },
  {
    exerciseId: ExerciseId
    reviewStatus: "approuve" | "rejete"
    duplicate: boolean
  }
>("modules/continuity/mutations:reviewExerciseEvidence")

const getPolicyReadiness = makeFunctionReference<
  "query",
  { policyId: PolicyId; exerciseLimit?: number },
  {
    readiness: {
      ready: boolean
      recoveryTargetsProven: boolean
      offlineAutonomyProven: boolean
      paperFallbackProven: boolean
      gaps: string[]
    }
  }
>("modules/continuity/queries:getPolicyReadiness")

async function seedActor(
  t: ReturnType<typeof convexTest>,
  authId: string,
  role: AppRole
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function activateSecurityModule(
  t: ReturnType<typeof convexTest>,
  changedBy: Id<"users">
) {
  await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "securite",
      environment: "test",
      isEnabled: true,
      reason: "Tests PCA/PRA",
      correlationId: `continuity-activation-${changedBy}`,
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

function policyArgs(
  correlationId: string,
  overrides: Partial<CreatePolicyArgs> = {}
): CreatePolicyArgs {
  return {
    policyCode: "PCA-PRA-ENTREPRISE",
    title: "Objectifs de continuité SETRAG",
    scopeType: "entreprise",
    scopeDescription: "Services critiques du SI intégré ferroviaire",
    rpoSeconds: 0,
    rtoMinutes: 15,
    offlineAutonomyHours: 72,
    limitations: [
      "Le réplica miroir d'Owendo n'est pas démontré par le dépôt applicatif.",
    ],
    correlationId,
    ...overrides,
  }
}

describe("Registre PCA/PRA", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("versionne idempotemment puis impose un validateur distinct", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const creator = await seedActor(
      t,
      "continuity-creator",
      "admin_fonctionnel"
    )
    const reviewer = await seedActor(t, "continuity-reviewer", "audit_risques")
    await activateSecurityModule(t, creator.userId)

    const args = policyArgs("PCA-CREATE-001")
    const created = await creator.client.mutation(createPolicyVersion, args)
    await expect(
      creator.client.mutation(createPolicyVersion, args)
    ).resolves.toEqual({ ...created, duplicate: true })
    await expect(
      creator.client.mutation(createPolicyVersion, {
        ...args,
        rtoMinutes: 30,
      })
    ).rejects.toThrow("Collision de corrélation")
    await expect(
      creator.client.mutation(approvePolicyVersion, {
        policyId: created.policyId,
        correlationId: "PCA-APPROVE-001",
      })
    ).rejects.toThrow("ne peut pas la valider")

    const approved = await reviewer.client.mutation(approvePolicyVersion, {
      policyId: created.policyId,
      correlationId: "PCA-APPROVE-001",
    })
    expect(approved).toEqual({
      policyId: created.policyId,
      status: "approuve",
      duplicate: false,
    })
    await expect(
      reviewer.client.mutation(approvePolicyVersion, {
        policyId: created.policyId,
        correlationId: "PCA-APPROVE-001",
      })
    ).resolves.toEqual({ ...approved, duplicate: true })

    const state = await t.run(async (ctx) => ({
      policy: await ctx.db.get(created.policyId),
      audit: await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (builder) =>
          builder
            .eq("entityTable", "continuityPolicies")
            .eq("entityId", created.policyId)
        )
        .collect(),
    }))
    expect(state.policy).toMatchObject({
      version: 1,
      status: "approuve",
      createdBy: creator.userId,
      approvedBy: reviewer.userId,
    })
    expect(state.audit.map(({ action }) => action)).toEqual([
      "continuite.politique.version_creer",
      "continuite.politique.version_valider",
    ])
  })

  it("ne déclare prêt qu'après trois familles de preuves validées", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const creator = await seedActor(
      t,
      "continuity-evidence-creator",
      "admin_fonctionnel"
    )
    const reviewer = await seedActor(
      t,
      "continuity-evidence-reviewer",
      "audit_risques"
    )
    await activateSecurityModule(t, creator.userId)
    const created = await creator.client.mutation(
      createPolicyVersion,
      policyArgs("PCA-CREATE-EVIDENCE")
    )
    await reviewer.client.mutation(approvePolicyVersion, {
      policyId: created.policyId,
      correlationId: "PCA-APPROVE-EVIDENCE",
    })

    const base = Date.now() + 1_000
    const exerciseInputs: RecordExerciseArgs[] = [
      {
        policyId: created.policyId,
        type: "bascule",
        startedAt: base,
        endedAt: base + 12 * 60 * 1_000,
        observedRpoSeconds: 0,
        observedRtoMinutes: 12,
        result: "reussi",
        findings: ["Transactions rapprochées sans écart constaté."],
        evidenceReferences: ["GED:PRA-BASCULE-001"],
        correlationId: "PCA-EXERCISE-FAILOVER",
      },
      {
        policyId: created.policyId,
        type: "hors_ligne",
        startedAt: base,
        endedAt: base + 72 * 60 * 60 * 1_000,
        result: "reussi",
        findings: ["Journal local rapproché après 72 heures."],
        evidenceReferences: ["GED:PCA-OFFLINE-001"],
        correlationId: "PCA-EXERCISE-OFFLINE",
      },
      {
        policyId: created.policyId,
        type: "papier",
        startedAt: base,
        endedAt: base + 2 * 60 * 60 * 1_000,
        result: "reussi",
        findings: ["Carnets numérotés et saisie de rattrapage rapprochés."],
        evidenceReferences: ["GED:PCA-PAPIER-001"],
        correlationId: "PCA-EXERCISE-PAPER",
      },
    ]

    const exercises = []
    for (const input of exerciseInputs) {
      const result = await creator.client.mutation(
        recordExerciseEvidence,
        input
      )
      exercises.push(result.exerciseId)
    }
    await expect(
      reviewer.client.query(getPolicyReadiness, {
        policyId: created.policyId,
      })
    ).resolves.toMatchObject({ readiness: { ready: false } })

    for (const [index, exerciseId] of exercises.entries()) {
      await reviewer.client.mutation(reviewExerciseEvidence, {
        exerciseId,
        decision: "approuver",
        comment: "Preuve vérifiée dans la GED et mesures cohérentes.",
        correlationId: `PCA-REVIEW-${index}`,
      })
    }
    const readiness = await reviewer.client.query(getPolicyReadiness, {
      policyId: created.policyId,
    })
    expect(readiness.readiness).toMatchObject({
      ready: true,
      recoveryTargetsProven: true,
      offlineAutonomyProven: true,
      paperFallbackProven: true,
      gaps: [],
    })
  })

  it("refuse de compter une reprise réussie sans mesures observées", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const creator = await seedActor(
      t,
      "continuity-measure-creator",
      "admin_fonctionnel"
    )
    await activateSecurityModule(t, creator.userId)
    const created = await creator.client.mutation(
      createPolicyVersion,
      policyArgs("PCA-CREATE-MEASURE")
    )
    await expect(
      creator.client.mutation(recordExerciseEvidence, {
        policyId: created.policyId,
        type: "restauration",
        startedAt: 1_000,
        endedAt: 2_000,
        result: "reussi",
        findings: ["Restauration annoncée réussie."],
        evidenceReferences: ["GED:PRA-RESTORE-UNMEASURED"],
        correlationId: "PCA-EXERCISE-UNMEASURED",
      })
    ).rejects.toThrow("RPO et un RTO observés")
  })

  it("retire automatiquement l'ancienne politique à l'approbation d'une nouvelle version", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const creator = await seedActor(
      t,
      "continuity-version-creator",
      "admin_fonctionnel"
    )
    const reviewer = await seedActor(
      t,
      "continuity-version-reviewer",
      "audit_risques"
    )
    await activateSecurityModule(t, creator.userId)

    const version1 = await creator.client.mutation(
      createPolicyVersion,
      policyArgs("PCA-V1-CREATE")
    )
    await reviewer.client.mutation(approvePolicyVersion, {
      policyId: version1.policyId,
      correlationId: "PCA-V1-APPROVE",
    })
    const version2 = await creator.client.mutation(
      createPolicyVersion,
      policyArgs("PCA-V2-CREATE", { rtoMinutes: 12 })
    )
    await reviewer.client.mutation(approvePolicyVersion, {
      policyId: version2.policyId,
      correlationId: "PCA-V2-APPROVE",
    })

    const policies = await t.run((ctx) =>
      ctx.db
        .query("continuityPolicies")
        .withIndex("by_code_version", (builder) =>
          builder.eq("policyCode", "PCA-PRA-ENTREPRISE")
        )
        .order("asc")
        .collect()
    )
    expect(
      policies.map(({ version, status }) => ({ version, status }))
    ).toEqual([
      { version: 1, status: "retire" },
      { version: 2, status: "approuve" },
    ])
  })
})
