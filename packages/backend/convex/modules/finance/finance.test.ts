import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import appSchema from "../../schema"
import { modules } from "../../test.setup"

type Definition = {
  code: string
  label: string
  version: number
  legalSourceLabel: string
  legalSourceUrl: string
  effectiveFrom: string
  effectiveUntil?: string
}

type CommandMetadata = {
  reason: string
  idempotencyKey: string
  correlationId: string
  causationId?: string
}

const upsertAccount = makeFunctionReference<
  "mutation",
  {
    chart: Definition
    account: {
      code: string
      label: string
      description?: string
      isPostingAllowed: boolean
    }
  } & CommandMetadata,
  {
    chartVersionId: Id<"financeChartVersions">
    accountId: Id<"financeAccounts">
    created: boolean
    duplicate: boolean
  }
>("modules/finance/mutations:upsertAccount")

const activateChartVersion = makeFunctionReference<
  "mutation",
  { chartVersionId: Id<"financeChartVersions"> } & CommandMetadata,
  {
    chartVersionId: Id<"financeChartVersions">
    status: "active"
    duplicate: boolean
  }
>("modules/finance/mutations:activateChartVersion")

const createTaxRuleSetDraft = makeFunctionReference<
  "mutation",
  {
    ruleSet: Definition
    rules: Array<{
      code: string
      label: string
      basis: string
      rateBps: number
    }>
  } & CommandMetadata,
  {
    ruleSetId: Id<"financeTaxRuleSets">
    ruleCount: number
    status: "draft"
    duplicate: boolean
  }
>("modules/finance/mutations:createTaxRuleSetDraft")

const activateTaxRuleSet = makeFunctionReference<
  "mutation",
  { ruleSetId: Id<"financeTaxRuleSets"> } & CommandMetadata,
  {
    ruleSetId: Id<"financeTaxRuleSets">
    status: "active"
    duplicate: boolean
  }
>("modules/finance/mutations:activateTaxRuleSet")

type JournalLine = {
  accountCode: string
  label: string
  debitFcfa: number
  creditFcfa: number
}

const createJournalBatchDraft = makeFunctionReference<
  "mutation",
  {
    batchNumber: string
    period: string
    postingDate: string
    description: string
    sourceReference?: string
    chartVersionId: Id<"financeChartVersions">
    taxRuleSetId?: Id<"financeTaxRuleSets">
    lines: JournalLine[]
  } & CommandMetadata,
  {
    batchId: Id<"financeJournalBatches">
    lineCount: number
    totalDebitFcfa: number
    totalCreditFcfa: number
    status: "draft"
    duplicate: boolean
  }
>("modules/finance/mutations:createJournalBatchDraft")

const validateJournalBatch = makeFunctionReference<
  "mutation",
  { batchId: Id<"financeJournalBatches"> } & CommandMetadata,
  {
    batchId: Id<"financeJournalBatches">
    status: "validated"
    totalDebitFcfa: number
    totalCreditFcfa: number
    duplicate: boolean
  }
>("modules/finance/mutations:validateJournalBatch")

const getFinanceOverview = makeFunctionReference<
  "query",
  Record<string, never>,
  {
    configuration: {
      activeRuleSet: null | {
        legalSourceUrl: string
        rules: Array<{ code: string; rateBasisPoints: number }>
      }
      activeAccounts: number
      totalAccounts: number
    }
    journal: {
      postedBatches: number
      totalDebit: number
      totalCredit: number
    }
    readiness: { canPrepareTaxReturns: boolean; blockers: string[] }
  }
>("modules/finance/queries:getFinanceOverview")

async function seedActor(t: ReturnType<typeof convexTest>, authId: string) {
  const userId = await t.run(async (ctx) => {
    const insertedUserId = await ctx.db.insert("users", {
      authId,
      role: "vendeur_guichet",
      identitySource: "local",
      isActive: true,
    })
    const now = Date.now()
    await ctx.db.insert("moduleAccessGrants", {
      userId: insertedUserId,
      moduleCode: "finance",
      accessLevel: "admin",
      reason: "Administration Finance requise par le scénario de test",
      grantedBy: insertedUserId,
      createdAt: now,
      updatedAt: now,
    })
    return insertedUserId
  })
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function activateFinanceModule(
  t: ReturnType<typeof convexTest>,
  changedBy: Id<"users">
) {
  await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "finance",
      environment: "test",
      isEnabled: true,
      reason: "Tests du socle Finance",
      correlationId: `finance-activation-${changedBy}`,
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

function command(id: string): CommandMetadata {
  return {
    reason: "Configuration financière contrôlée pour le test",
    idempotencyKey: `IDEMP-${id}`,
    correlationId: `CORR-${id}`,
  }
}

const chart: Definition = {
  code: "SYSCOHADA-SETRAG",
  label: "Plan comptable SETRAG",
  version: 1,
  legalSourceLabel: "AUDCIF / SYSCOHADA révisé",
  legalSourceUrl:
    "https://www.ohada.org/pt-pt/publicacao-do-novo-acto-uniforme-sobre-o-direito-da-contabilidade-e-da-informacao-financeira/",
  effectiveFrom: "2026-01-01",
}

const ruleSet: Definition = {
  code: "FISCALITE-GABON",
  label: "Jeu fiscal de recette",
  version: 1,
  legalSourceLabel: "DGI Gabon — textes spécifiques",
  legalSourceUrl: "https://dgi.ga/textes-specifiques/",
  effectiveFrom: "2026-01-01",
}

async function configureFinance(t: ReturnType<typeof convexTest>) {
  const creator = await seedActor(t, "finance-creator")
  const validator = await seedActor(t, "finance-validator")
  await activateFinanceModule(t, creator.userId)

  const debit = await creator.client.mutation(upsertAccount, {
    chart,
    account: {
      code: "5211",
      label: "Banque",
      isPostingAllowed: true,
    },
    ...command("ACCOUNT-DEBIT"),
  })
  await creator.client.mutation(upsertAccount, {
    chart,
    account: {
      code: "7061",
      label: "Prestations ferroviaires",
      isPostingAllowed: true,
    },
    ...command("ACCOUNT-CREDIT"),
  })
  await validator.client.mutation(activateChartVersion, {
    chartVersionId: debit.chartVersionId,
    ...command("CHART-ACTIVATE"),
  })

  const tax = await creator.client.mutation(createTaxRuleSetDraft, {
    ruleSet,
    rules: [
      {
        code: "REGLE-RECETTE",
        label: "Règle fiscale de recette homologuée pour le test",
        basis: "Montant hors taxes taxable",
        rateBps: 1_800,
      },
    ],
    ...command("TAX-CREATE"),
  })
  await validator.client.mutation(activateTaxRuleSet, {
    ruleSetId: tax.ruleSetId,
    ...command("TAX-ACTIVATE"),
  })

  return {
    creator,
    validator,
    chartVersionId: debit.chartVersionId,
    ruleSetId: tax.ruleSetId,
  }
}

describe("Socle Finance OHADA", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("versionne les référentiels, impose la double validation et rejoue idempotemment", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    const creator = await seedActor(t, "finance-reference-creator")
    const validator = await seedActor(t, "finance-reference-validator")
    await activateFinanceModule(t, creator.userId)
    const args = {
      chart,
      account: {
        code: "5211",
        label: "Banque",
        isPostingAllowed: true,
      },
      ...command("REFERENCE-ACCOUNT"),
    }

    const created = await creator.client.mutation(upsertAccount, args)
    await expect(creator.client.mutation(upsertAccount, args)).resolves.toEqual(
      { ...created, duplicate: true }
    )
    await expect(
      creator.client.mutation(upsertAccount, {
        ...args,
        account: { ...args.account, label: "Banque modifiée" },
      })
    ).rejects.toThrow("clé d'idempotence")
    await expect(
      creator.client.mutation(activateChartVersion, {
        chartVersionId: created.chartVersionId,
        ...command("REFERENCE-CHART-ACTIVATE"),
      })
    ).rejects.toThrow("ne peut pas assurer sa propre validation")
    await expect(
      validator.client.mutation(activateChartVersion, {
        chartVersionId: created.chartVersionId,
        ...command("REFERENCE-CHART-ACTIVATE"),
      })
    ).resolves.toMatchObject({ status: "active", duplicate: false })
  })

  it("comptabilise seulement un lot équilibré, immuable et validé par un tiers", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    const configured = await configureFinance(t)
    const batchArgs = {
      batchNumber: "LOT-2026-09-001",
      period: "2026-09",
      postingDate: "2026-09-10",
      description: "Recette ferroviaire contrôlée",
      chartVersionId: configured.chartVersionId,
      taxRuleSetId: configured.ruleSetId,
      lines: [
        {
          accountCode: "5211",
          label: "Encaissement",
          debitFcfa: 120_000,
          creditFcfa: 0,
        },
        {
          accountCode: "7061",
          label: "Produit ferroviaire",
          debitFcfa: 0,
          creditFcfa: 120_000,
        },
      ],
      ...command("BATCH-CREATE"),
    }
    await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("moduleAccessGrants")
        .withIndex("by_user_module", (query) =>
          query
            .eq("userId", configured.creator.userId)
            .eq("moduleCode", "finance")
        )
        .unique()
      if (!grant) throw new Error("Grant Finance du créateur introuvable")
      await ctx.db.patch(grant._id, {
        accessLevel: "utilisation",
        updatedAt: Date.now(),
      })
    })
    const batch = await configured.creator.client.mutation(
      createJournalBatchDraft,
      batchArgs
    )
    await expect(
      configured.creator.client.mutation(validateJournalBatch, {
        batchId: batch.batchId,
        ...command("BATCH-VALIDATE"),
      })
    ).rejects.toThrow("ne peut pas assurer sa propre validation")
    await expect(
      configured.validator.client.mutation(validateJournalBatch, {
        batchId: batch.batchId,
        ...command("BATCH-VALIDATE"),
      })
    ).resolves.toMatchObject({
      status: "validated",
      totalDebitFcfa: 120_000,
      totalCreditFcfa: 120_000,
    })

    const persisted = await t.run(async (ctx) => ({
      batch: await ctx.db.get(batch.batchId),
      lines: await ctx.db
        .query("financeJournalLines")
        .withIndex("by_batch_line", (builder) =>
          builder.eq("batchId", batch.batchId)
        )
        .collect(),
    }))
    expect(persisted.batch).toMatchObject({
      status: "validated",
      createdBy: configured.creator.userId,
      validatedBy: configured.validator.userId,
    })
    expect(persisted.lines).toHaveLength(2)
  })

  it("expose uniquement les données réelles et bloque la production non homologuée", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    const configured = await configureFinance(t)

    const overview = await configured.validator.client.query(
      getFinanceOverview,
      {}
    )
    expect(overview.configuration).toMatchObject({
      activeAccounts: 2,
      totalAccounts: 2,
      activeRuleSet: {
        legalSourceUrl: "https://dgi.ga/textes-specifiques/",
        rules: [{ code: "REGLE-RECETTE", rateBasisPoints: 1_800 }],
      },
    })
    expect(overview.journal).toMatchObject({
      postedBatches: 0,
      totalDebit: 0,
      totalCredit: 0,
    })
    expect(overview.readiness).toEqual({
      canPrepareTaxReturns: false,
      blockers: [
        "Aucune écriture comptable validée",
        "Les mappings SAGE X3 et e-tax ne disposent pas encore d'une homologation probante",
      ],
    })
  })
})
