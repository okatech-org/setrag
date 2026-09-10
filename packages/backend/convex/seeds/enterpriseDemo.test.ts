import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"

type SeedReport = {
  dataState: "demo_synthetique"
  users: { created: number; updated: number; connectable: number }
  finance: {
    chartVersionId: Id<"financeChartVersions">
    chartCreated: boolean
    accountsUpserted: number
    taxRuleSetId: Id<"financeTaxRuleSets">
    taxRuleSetCreated: boolean
    taxRulesUpserted: number
    journalBatchesCreated: number
    journalBatchesUpserted: number
    journalLinesCreated: number
  }
  continuity: {
    policiesCreated: number
    policiesUpserted: number
    exercisesCreated: number
    exercisesUpserted: number
    readiness: Array<{
      policyCode: string
      status: string
      ready: boolean
      gaps: string[]
    }>
  }
  warnings: string[]
}

const runEnterpriseDemo = makeFunctionReference<
  "mutation",
  Record<string, never>,
  SeedReport
>("seeds/enterpriseDemo:run")

describe("seed transversal Finance + PCA/PRA", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("refuse tout peuplement hors mode démonstration", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)

    await expect(t.mutation(runEnterpriseDemo, {})).rejects.toThrow(
      "DEMO_ACCOUNTS_ENABLED"
    )
  })

  it("crée un scénario synthétique maker-checker puis le rejoue sans doublon", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)

    const first = await t.mutation(runEnterpriseDemo, {})
    expect(first).toMatchObject({
      dataState: "demo_synthetique",
      users: { created: 2, updated: 0, connectable: 0 },
      finance: {
        chartCreated: true,
        accountsUpserted: 5,
        taxRuleSetCreated: true,
        taxRulesUpserted: 2,
        journalBatchesCreated: 3,
        journalBatchesUpserted: 3,
        journalLinesCreated: 10,
      },
      continuity: {
        policiesCreated: 4,
        policiesUpserted: 4,
        exercisesCreated: 8,
        exercisesUpserted: 8,
      },
    })
    expect(first.continuity.readiness.some(({ ready }) => ready)).toBe(true)
    expect(first.continuity.readiness.some(({ ready }) => !ready)).toBe(true)
    expect(first.warnings.every((warning) => warning.includes("[DÉMO"))).toBe(
      true
    )

    const second = await t.mutation(runEnterpriseDemo, {})
    expect(second).toMatchObject({
      users: { created: 0, updated: 2, connectable: 0 },
      finance: {
        chartCreated: false,
        taxRuleSetCreated: false,
        journalBatchesCreated: 0,
        journalLinesCreated: 0,
      },
      continuity: {
        policiesCreated: 0,
        exercisesCreated: 0,
      },
    })

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      charts: await ctx.db.query("financeChartVersions").collect(),
      accounts: await ctx.db.query("financeAccounts").collect(),
      ruleSets: await ctx.db.query("financeTaxRuleSets").collect(),
      rules: await ctx.db.query("financeTaxRules").collect(),
      batches: await ctx.db.query("financeJournalBatches").collect(),
      lines: await ctx.db.query("financeJournalLines").collect(),
      policies: await ctx.db.query("continuityPolicies").collect(),
      exercises: await ctx.db.query("continuityExercises").collect(),
    }))
    expect(state.users).toHaveLength(2)
    expect(state.users.every((user) => !user.isActive && !user.email)).toBe(
      true
    )
    expect(state.charts).toHaveLength(1)
    expect(state.ruleSets).toHaveLength(1)
    expect(state.accounts).toHaveLength(5)
    expect(state.rules).toHaveLength(2)
    expect(state.batches).toHaveLength(3)
    expect(state.lines).toHaveLength(10)
    expect(state.policies).toHaveLength(4)
    expect(state.exercises).toHaveLength(8)

    expect(state.charts[0]).toMatchObject({
      code: "DEMO-SYSCOHADA-SETRAG",
      status: "active",
    })
    expect(state.ruleSets[0]).toMatchObject({
      code: "DEMO-GA-FISCAL",
      status: "active",
    })
    expect(
      state.batches.every(({ batchNumber }) => batchNumber.startsWith("DEMO-"))
    ).toBe(true)
    expect(
      state.policies.every(({ policyCode }) => policyCode.startsWith("DEMO-"))
    ).toBe(true)
    expect(
      state.charts[0]!.createdBy !== state.charts[0]!.activatedBy &&
        state.ruleSets[0]!.createdBy !== state.ruleSets[0]!.activatedBy &&
        state.batches.every((batch) => batch.createdBy !== batch.validatedBy)
    ).toBe(true)

    for (const batch of state.batches) {
      const lines = state.lines.filter((line) => line.batchId === batch._id)
      const debit = lines.reduce((total, line) => total + line.debitFcfa, 0)
      const credit = lines.reduce((total, line) => total + line.creditFcfa, 0)
      expect(debit).toBe(credit)
      expect(debit).toBe(batch.totalDebitFcfa)
      expect(Number.isSafeInteger(debit)).toBe(true)
    }
  })

  it("refuse atomiquement le mélange avec une racine Finance non DEMO", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)
    const actorId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "existing-real-actor",
        role: "comptable",
        identitySource: "annuaire",
        isActive: true,
      })
    )
    await t.run((ctx) =>
      ctx.db.insert("financeChartVersions", {
        code: "SYSCOHADA-EXISTANT",
        label: "Plan existant",
        version: 1,
        legalSourceLabel: "Source existante",
        legalSourceUrl: "https://example.test/source",
        effectiveFrom: "2026-01-01",
        status: "active",
        idempotencyKey: "existing-idempotency",
        payloadFingerprint: "existing-fingerprint",
        correlationId: "existing-correlation",
        createdBy: actorId,
        createdAt: 1,
        updatedAt: 1,
      })
    )

    await expect(t.mutation(runEnterpriseDemo, {})).rejects.toThrow(
      "non démonstration"
    )
    const state = await t.run(async (ctx) => ({
      charts: await ctx.db.query("financeChartVersions").collect(),
      demoUsers: (await ctx.db.query("users").collect()).filter(({ authId }) =>
        authId.startsWith("DEMO-SEED-ENTERPRISE-")
      ),
    }))
    expect(state.charts).toHaveLength(1)
    expect(state.demoUsers).toHaveLength(0)
  })
})
