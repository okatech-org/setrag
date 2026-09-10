import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, type MutationCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { assertCan } from "../platform/model"
import type { ModuleAccessLevel } from "../platform/catalog"
import {
  assertDateInPeriod,
  assertNoEffectivePeriodOverlap,
  assertPositiveVersion,
  assertRateBasisPoints,
  assertSeparationOfDuties,
  financePayloadFingerprint,
  isDateEffective,
  normalizeEffectivePeriod,
  normalizeFinanceCode,
  normalizeIsoDate,
  normalizeIsoPeriod,
  normalizeLegalSourceUrl,
  normalizeSyscohadaAccountCode,
  optionalFinanceText,
  requiredFinanceText,
  validateJournalLines,
  MAX_TAX_RULES_PER_SET,
} from "./model"

const effectiveDefinitionValidator = {
  code: v.string(),
  label: v.string(),
  version: v.number(),
  legalSourceLabel: v.string(),
  legalSourceUrl: v.string(),
  effectiveFrom: v.string(),
  effectiveUntil: v.optional(v.string()),
}

const taxRuleValidator = v.object({
  code: v.string(),
  label: v.string(),
  basis: v.string(),
  rateBps: v.number(),
})

const journalLineValidator = v.object({
  accountCode: v.string(),
  label: v.string(),
  debitFcfa: v.number(),
  creditFcfa: v.number(),
  thirdPartyRef: v.optional(v.string()),
  costCenter: v.optional(v.string()),
})

type FinancePermission = "creer" | "modifier" | "valider"

async function authorize(
  ctx: MutationCtx,
  permission: FinancePermission,
  requiredLevel?: ModuleAccessLevel
) {
  return await assertCan(ctx, {
    moduleCode: "finance",
    resource: "finance",
    permission,
    requiredLevel,
  })
}

function normalizeReason(value: string): string {
  return requiredFinanceText(value, "Le motif", 500)
}

function normalizeCorrelationId(value: string): string {
  return requiredFinanceText(value, "L'identifiant de corrélation", 120)
}

function normalizeIdempotencyKey(value: string): string {
  return requiredFinanceText(value, "La clé d'idempotence", 160)
}

function normalizeCausationId(value: string | undefined): string | undefined {
  return optionalFinanceText(value, "L'identifiant de causalité", 120)
}

function normalizedDefinition(input: {
  code: string
  label: string
  version: number
  legalSourceLabel: string
  legalSourceUrl: string
  effectiveFrom: string
  effectiveUntil?: string
}) {
  return {
    code: normalizeFinanceCode(input.code, "Le code de version"),
    label: requiredFinanceText(input.label, "Le libellé de version", 160),
    version: assertPositiveVersion(input.version),
    legalSourceLabel: requiredFinanceText(
      input.legalSourceLabel,
      "Le libellé de la source légale",
      500
    ),
    legalSourceUrl: normalizeLegalSourceUrl(input.legalSourceUrl),
    ...normalizeEffectivePeriod(input.effectiveFrom, input.effectiveUntil),
  }
}

async function repeatedResult<T extends object>(
  ctx: MutationCtx,
  input: {
    operation: string
    idempotencyKey: string
    actorId: Id<"users">
    payloadFingerprint: string
  }
): Promise<(T & { duplicate: true }) | null> {
  const receipt = await ctx.db
    .query("financeMutationReceipts")
    .withIndex("by_operation_key", (builder) =>
      builder
        .eq("operation", input.operation)
        .eq("idempotencyKey", input.idempotencyKey)
    )
    .unique()
  if (!receipt) return null
  if (
    receipt.actorId !== input.actorId ||
    receipt.payloadFingerprint !== input.payloadFingerprint
  ) {
    throw new Error(
      "La clé d'idempotence est déjà utilisée pour une autre commande Finance."
    )
  }
  return {
    ...(JSON.parse(receipt.result) as T),
    duplicate: true,
  }
}

async function saveResult(
  ctx: MutationCtx,
  input: {
    operation: string
    idempotencyKey: string
    actorId: Id<"users">
    entityId: string
    payloadFingerprint: string
    result: object
    now: number
  }
): Promise<void> {
  await ctx.db.insert("financeMutationReceipts", {
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    actorId: input.actorId,
    entityId: input.entityId,
    payloadFingerprint: input.payloadFingerprint,
    result: JSON.stringify(input.result),
    createdAt: input.now,
  })
}

function sameDefinition(
  stored: Doc<"financeChartVersions"> | Doc<"financeTaxRuleSets">,
  requested: ReturnType<typeof normalizedDefinition>
): boolean {
  return (
    stored.code === requested.code &&
    stored.label === requested.label &&
    stored.version === requested.version &&
    stored.legalSourceLabel === requested.legalSourceLabel &&
    stored.legalSourceUrl === requested.legalSourceUrl &&
    stored.effectiveFrom === requested.effectiveFrom &&
    stored.effectiveUntil === requested.effectiveUntil
  )
}

export const upsertAccount = mutation({
  args: {
    chart: v.object(effectiveDefinitionValidator),
    account: v.object({
      code: v.string(),
      label: v.string(),
      description: v.optional(v.string()),
      isPostingAllowed: v.boolean(),
    }),
    reason: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "modifier", "admin")
    const chart = normalizedDefinition(args.chart)
    const account = {
      code: normalizeSyscohadaAccountCode(args.account.code),
      label: requiredFinanceText(
        args.account.label,
        "Le libellé du compte",
        200
      ),
      description: optionalFinanceText(
        args.account.description,
        "La description du compte",
        500
      ),
      isPostingAllowed: args.account.isPostingAllowed,
    }
    const reason = normalizeReason(args.reason)
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey)
    const correlationId = normalizeCorrelationId(args.correlationId)
    const causationId = normalizeCausationId(args.causationId)
    const payloadFingerprint = financePayloadFingerprint({
      chart,
      account,
      reason,
      correlationId,
      causationId,
    })
    const repeated = await repeatedResult<{
      chartVersionId: Id<"financeChartVersions">
      accountId: Id<"financeAccounts">
      created: boolean
    }>(ctx, {
      operation: "finance.account.upsert",
      idempotencyKey,
      actorId: access.user._id,
      payloadFingerprint,
    })
    if (repeated) return repeated

    let chartVersion = await ctx.db
      .query("financeChartVersions")
      .withIndex("by_code_version", (builder) =>
        builder.eq("code", chart.code).eq("version", chart.version)
      )
      .unique()
    const now = Date.now()
    if (!chartVersion) {
      const chartVersionId = await ctx.db.insert("financeChartVersions", {
        ...chart,
        status: "draft",
        idempotencyKey,
        payloadFingerprint: financePayloadFingerprint(chart),
        correlationId,
        createdBy: access.user._id,
        createdAt: now,
        updatedAt: now,
      })
      chartVersion = (await ctx.db.get(chartVersionId))!
    } else {
      if (!sameDefinition(chartVersion, chart)) {
        throw new Error(
          "La version du plan comptable existe avec une définition différente."
        )
      }
      if (chartVersion.status !== "draft") {
        throw new Error(
          "Les comptes d'un plan comptable activé ou retiré sont immuables."
        )
      }
    }

    const existing = await ctx.db
      .query("financeAccounts")
      .withIndex("by_chart", (builder) =>
        builder.eq("chartVersionId", chartVersion._id).eq("code", account.code)
      )
      .unique()
    const accountValues = {
      ...account,
      idempotencyKey,
      payloadFingerprint: financePayloadFingerprint(account),
      updatedBy: access.user._id,
      updatedAt: now,
    }
    const accountId = existing
      ? existing._id
      : await ctx.db.insert("financeAccounts", {
          chartVersionId: chartVersion._id,
          ...accountValues,
          createdBy: access.user._id,
          createdAt: now,
        })
    if (existing) await ctx.db.patch(existing._id, accountValues)

    const result = {
      chartVersionId: chartVersion._id,
      accountId,
      created: !existing,
      duplicate: false as const,
    }
    await audit(ctx, {
      actorId: access.user._id,
      action: existing ? "finance.compte.modifier" : "finance.compte.creer",
      entityTable: "financeAccounts",
      entityId: accountId,
      permission: "modifier",
      reason,
      correlationId,
      causationId,
      classification: "confidentiel",
      before: existing,
      after: { chartVersionId: chartVersion._id, ...accountValues },
    })
    await saveResult(ctx, {
      operation: "finance.account.upsert",
      idempotencyKey,
      actorId: access.user._id,
      entityId: accountId,
      payloadFingerprint,
      result,
      now,
    })
    return result
  },
})

export const activateChartVersion = mutation({
  args: {
    chartVersionId: v.id("financeChartVersions"),
    reason: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "valider", "admin")
    const reason = normalizeReason(args.reason)
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey)
    const correlationId = normalizeCorrelationId(args.correlationId)
    const causationId = normalizeCausationId(args.causationId)
    const payloadFingerprint = financePayloadFingerprint({
      chartVersionId: args.chartVersionId,
      reason,
      correlationId,
      causationId,
    })
    const repeated = await repeatedResult<{
      chartVersionId: Id<"financeChartVersions">
      status: "active"
    }>(ctx, {
      operation: "finance.chart.activate",
      idempotencyKey,
      actorId: access.user._id,
      payloadFingerprint,
    })
    if (repeated) return repeated

    const chart = await ctx.db.get(args.chartVersionId)
    if (!chart) throw new Error("Version du plan comptable introuvable.")
    assertSeparationOfDuties(
      chart.createdBy,
      access.user._id,
      "d'un plan comptable"
    )
    if (chart.status !== "draft") {
      throw new Error("Seule une version brouillon peut être activée.")
    }
    const firstAccount = await ctx.db
      .query("financeAccounts")
      .withIndex("by_chart", (builder) =>
        builder.eq("chartVersionId", chart._id)
      )
      .first()
    if (!firstAccount) {
      throw new Error("Un plan comptable vide ne peut pas être activé.")
    }
    const activeVersions = await ctx.db
      .query("financeChartVersions")
      .withIndex("by_code_status", (builder) =>
        builder.eq("code", chart.code).eq("status", "active")
      )
      .collect()
    assertNoEffectivePeriodOverlap(chart, activeVersions, "La version du plan")

    const now = Date.now()
    const patch = {
      status: "active" as const,
      activatedBy: access.user._id,
      activationIdempotencyKey: idempotencyKey,
      activatedAt: now,
      updatedAt: now,
    }
    await ctx.db.patch(chart._id, patch)
    const result = {
      chartVersionId: chart._id,
      status: "active" as const,
      duplicate: false as const,
    }
    await audit(ctx, {
      actorId: access.user._id,
      action: "finance.plan_comptable.activer",
      entityTable: "financeChartVersions",
      entityId: chart._id,
      permission: "valider",
      reason,
      correlationId,
      causationId,
      classification: "confidentiel",
      before: { status: chart.status },
      after: patch,
    })
    await saveResult(ctx, {
      operation: "finance.chart.activate",
      idempotencyKey,
      actorId: access.user._id,
      entityId: chart._id,
      payloadFingerprint,
      result,
      now,
    })
    return result
  },
})

export const createTaxRuleSetDraft = mutation({
  args: {
    ruleSet: v.object(effectiveDefinitionValidator),
    rules: v.array(taxRuleValidator),
    reason: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "creer", "admin")
    const ruleSet = normalizedDefinition(args.ruleSet)
    if (args.rules.length < 1 || args.rules.length > MAX_TAX_RULES_PER_SET) {
      throw new Error(
        `Un jeu fiscal doit contenir entre 1 et ${MAX_TAX_RULES_PER_SET} règles.`
      )
    }
    const rules = args.rules.map((rule) => ({
      code: normalizeFinanceCode(rule.code, "Le code de règle"),
      label: requiredFinanceText(rule.label, "Le libellé de règle", 200),
      basis: requiredFinanceText(rule.basis, "La base d'imposition", 500),
      rateBps: assertRateBasisPoints(rule.rateBps),
    }))
    if (new Set(rules.map((rule) => rule.code)).size !== rules.length) {
      throw new Error("Les codes de règles fiscales doivent être uniques.")
    }
    const reason = normalizeReason(args.reason)
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey)
    const correlationId = normalizeCorrelationId(args.correlationId)
    const causationId = normalizeCausationId(args.causationId)
    const payloadFingerprint = financePayloadFingerprint({
      ruleSet,
      rules,
      reason,
      correlationId,
      causationId,
    })
    const repeated = await repeatedResult<{
      ruleSetId: Id<"financeTaxRuleSets">
      ruleCount: number
      status: "draft"
    }>(ctx, {
      operation: "finance.tax_rule_set.create",
      idempotencyKey,
      actorId: access.user._id,
      payloadFingerprint,
    })
    if (repeated) return repeated

    const existing = await ctx.db
      .query("financeTaxRuleSets")
      .withIndex("by_code_version", (builder) =>
        builder.eq("code", ruleSet.code).eq("version", ruleSet.version)
      )
      .unique()
    if (existing) {
      throw new Error("Cette version du jeu fiscal existe déjà.")
    }
    const now = Date.now()
    const ruleSetId = await ctx.db.insert("financeTaxRuleSets", {
      ...ruleSet,
      status: "draft",
      idempotencyKey,
      payloadFingerprint: financePayloadFingerprint({ ruleSet, rules }),
      correlationId,
      createdBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    })
    for (const rule of rules) {
      await ctx.db.insert("financeTaxRules", {
        ruleSetId,
        ...rule,
        createdAt: now,
      })
    }
    const result = {
      ruleSetId,
      ruleCount: rules.length,
      status: "draft" as const,
      duplicate: false as const,
    }
    await audit(ctx, {
      actorId: access.user._id,
      action: "finance.regles_fiscales.creer",
      entityTable: "financeTaxRuleSets",
      entityId: ruleSetId,
      permission: "creer",
      reason,
      correlationId,
      causationId,
      classification: "confidentiel",
      after: { ...ruleSet, rules, status: "draft" },
    })
    await saveResult(ctx, {
      operation: "finance.tax_rule_set.create",
      idempotencyKey,
      actorId: access.user._id,
      entityId: ruleSetId,
      payloadFingerprint,
      result,
      now,
    })
    return result
  },
})

export const activateTaxRuleSet = mutation({
  args: {
    ruleSetId: v.id("financeTaxRuleSets"),
    reason: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "valider", "admin")
    const reason = normalizeReason(args.reason)
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey)
    const correlationId = normalizeCorrelationId(args.correlationId)
    const causationId = normalizeCausationId(args.causationId)
    const payloadFingerprint = financePayloadFingerprint({
      ruleSetId: args.ruleSetId,
      reason,
      correlationId,
      causationId,
    })
    const repeated = await repeatedResult<{
      ruleSetId: Id<"financeTaxRuleSets">
      status: "active"
    }>(ctx, {
      operation: "finance.tax_rule_set.activate",
      idempotencyKey,
      actorId: access.user._id,
      payloadFingerprint,
    })
    if (repeated) return repeated

    const ruleSet = await ctx.db.get(args.ruleSetId)
    if (!ruleSet) throw new Error("Jeu de règles fiscales introuvable.")
    assertSeparationOfDuties(
      ruleSet.createdBy,
      access.user._id,
      "d'un jeu fiscal"
    )
    if (ruleSet.status !== "draft") {
      throw new Error("Seul un jeu fiscal brouillon peut être activé.")
    }
    const firstRule = await ctx.db
      .query("financeTaxRules")
      .withIndex("by_rule_set", (builder) =>
        builder.eq("ruleSetId", ruleSet._id)
      )
      .first()
    if (!firstRule)
      throw new Error("Un jeu fiscal vide ne peut pas être activé.")
    const activeVersions = await ctx.db
      .query("financeTaxRuleSets")
      .withIndex("by_code_status", (builder) =>
        builder.eq("code", ruleSet.code).eq("status", "active")
      )
      .collect()
    assertNoEffectivePeriodOverlap(
      ruleSet,
      activeVersions,
      "Le jeu de règles fiscales"
    )

    const now = Date.now()
    const patch = {
      status: "active" as const,
      activatedBy: access.user._id,
      activationIdempotencyKey: idempotencyKey,
      activatedAt: now,
      updatedAt: now,
    }
    await ctx.db.patch(ruleSet._id, patch)
    const result = {
      ruleSetId: ruleSet._id,
      status: "active" as const,
      duplicate: false as const,
    }
    await audit(ctx, {
      actorId: access.user._id,
      action: "finance.regles_fiscales.activer",
      entityTable: "financeTaxRuleSets",
      entityId: ruleSet._id,
      permission: "valider",
      reason,
      correlationId,
      causationId,
      classification: "confidentiel",
      before: { status: ruleSet.status },
      after: patch,
    })
    await saveResult(ctx, {
      operation: "finance.tax_rule_set.activate",
      idempotencyKey,
      actorId: access.user._id,
      entityId: ruleSet._id,
      payloadFingerprint,
      result,
      now,
    })
    return result
  },
})

export const createJournalBatchDraft = mutation({
  args: {
    batchNumber: v.string(),
    period: v.string(),
    postingDate: v.string(),
    description: v.string(),
    sourceReference: v.optional(v.string()),
    chartVersionId: v.id("financeChartVersions"),
    taxRuleSetId: v.optional(v.id("financeTaxRuleSets")),
    lines: v.array(journalLineValidator),
    reason: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "creer")
    const batchNumber = normalizeFinanceCode(
      args.batchNumber,
      "Le numéro de lot",
      100
    )
    const period = normalizeIsoPeriod(args.period)
    const postingDate = normalizeIsoDate(
      args.postingDate,
      "La date de comptabilisation"
    )
    assertDateInPeriod(postingDate, period)
    const description = requiredFinanceText(
      args.description,
      "La description du lot",
      300
    )
    const sourceReference = optionalFinanceText(
      args.sourceReference,
      "La référence source",
      160
    )
    const validation = validateJournalLines(args.lines)
    const reason = normalizeReason(args.reason)
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey)
    const correlationId = normalizeCorrelationId(args.correlationId)
    const causationId = normalizeCausationId(args.causationId)
    const normalizedPayload = {
      batchNumber,
      period,
      postingDate,
      description,
      sourceReference,
      chartVersionId: args.chartVersionId,
      taxRuleSetId: args.taxRuleSetId,
      lines: validation.lines,
      reason,
      correlationId,
      causationId,
    }
    const payloadFingerprint = financePayloadFingerprint(normalizedPayload)
    const repeated = await repeatedResult<{
      batchId: Id<"financeJournalBatches">
      lineCount: number
      totalDebitFcfa: number
      totalCreditFcfa: number
      status: "draft"
    }>(ctx, {
      operation: "finance.journal_batch.create",
      idempotencyKey,
      actorId: access.user._id,
      payloadFingerprint,
    })
    if (repeated) return repeated

    const chart = await ctx.db.get(args.chartVersionId)
    if (
      !chart ||
      chart.status !== "active" ||
      !isDateEffective(postingDate, chart)
    ) {
      throw new Error(
        "Le plan comptable n'est pas actif à la date de comptabilisation."
      )
    }
    if (args.taxRuleSetId) {
      const ruleSet = await ctx.db.get(args.taxRuleSetId)
      if (
        !ruleSet ||
        ruleSet.status !== "active" ||
        !isDateEffective(postingDate, ruleSet)
      ) {
        throw new Error(
          "Le jeu fiscal n'est pas actif à la date de comptabilisation."
        )
      }
    }
    const accounts = await ctx.db
      .query("financeAccounts")
      .withIndex("by_chart", (builder) =>
        builder.eq("chartVersionId", chart._id)
      )
      .collect()
    const accountsByCode = new Map(
      accounts.map((account) => [account.code, account])
    )
    const resolvedLines = validation.lines.map((line) => {
      const account = accountsByCode.get(line.accountCode)
      if (!account) {
        throw new Error(
          `Le compte ${line.accountCode} n'appartient pas au plan comptable sélectionné.`
        )
      }
      if (!account.isPostingAllowed) {
        throw new Error(
          `Le compte ${line.accountCode} n'autorise pas les écritures.`
        )
      }
      return { ...line, accountId: account._id }
    })
    const existingBatch = await ctx.db
      .query("financeJournalBatches")
      .withIndex("by_batch_number", (builder) =>
        builder.eq("batchNumber", batchNumber)
      )
      .unique()
    if (existingBatch) throw new Error("Ce numéro de lot existe déjà.")

    const now = Date.now()
    const batchId = await ctx.db.insert("financeJournalBatches", {
      batchNumber,
      period,
      postingDate,
      description,
      sourceReference,
      chartVersionId: chart._id,
      taxRuleSetId: args.taxRuleSetId,
      status: "draft",
      lineCount: resolvedLines.length,
      totalDebitFcfa: validation.totalDebitFcfa,
      totalCreditFcfa: validation.totalCreditFcfa,
      idempotencyKey,
      payloadFingerprint,
      correlationId,
      createdBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    })
    for (const [index, line] of resolvedLines.entries()) {
      await ctx.db.insert("financeJournalLines", {
        batchId,
        lineNumber: index + 1,
        accountId: line.accountId,
        accountCode: line.accountCode,
        label: line.label,
        debitFcfa: line.debitFcfa,
        creditFcfa: line.creditFcfa,
        thirdPartyRef: line.thirdPartyRef,
        costCenter: line.costCenter,
        createdAt: now,
      })
    }
    const result = {
      batchId,
      lineCount: resolvedLines.length,
      totalDebitFcfa: validation.totalDebitFcfa,
      totalCreditFcfa: validation.totalCreditFcfa,
      status: "draft" as const,
      duplicate: false as const,
    }
    await audit(ctx, {
      actorId: access.user._id,
      action: "finance.lot_ecritures.creer",
      entityTable: "financeJournalBatches",
      entityId: batchId,
      permission: "creer",
      reason,
      correlationId,
      causationId,
      classification: "confidentiel",
      after: {
        batchNumber,
        period,
        postingDate,
        chartVersionId: chart._id,
        taxRuleSetId: args.taxRuleSetId,
        lineCount: resolvedLines.length,
        totalDebitFcfa: validation.totalDebitFcfa,
        totalCreditFcfa: validation.totalCreditFcfa,
      },
    })
    await saveResult(ctx, {
      operation: "finance.journal_batch.create",
      idempotencyKey,
      actorId: access.user._id,
      entityId: batchId,
      payloadFingerprint,
      result,
      now,
    })
    return result
  },
})

export const validateJournalBatch = mutation({
  args: {
    batchId: v.id("financeJournalBatches"),
    reason: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await authorize(ctx, "valider")
    const reason = normalizeReason(args.reason)
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey)
    const correlationId = normalizeCorrelationId(args.correlationId)
    const causationId = normalizeCausationId(args.causationId)
    const payloadFingerprint = financePayloadFingerprint({
      batchId: args.batchId,
      reason,
      correlationId,
      causationId,
    })
    const repeated = await repeatedResult<{
      batchId: Id<"financeJournalBatches">
      status: "validated"
      totalDebitFcfa: number
      totalCreditFcfa: number
    }>(ctx, {
      operation: "finance.journal_batch.validate",
      idempotencyKey,
      actorId: access.user._id,
      payloadFingerprint,
    })
    if (repeated) return repeated

    const batch = await ctx.db.get(args.batchId)
    if (!batch) throw new Error("Lot d'écritures introuvable.")
    assertSeparationOfDuties(
      batch.createdBy,
      access.user._id,
      "d'un lot d'écritures"
    )
    if (batch.status !== "draft") {
      throw new Error("Seul un lot brouillon peut être validé.")
    }
    const lines = await ctx.db
      .query("financeJournalLines")
      .withIndex("by_batch_line", (builder) => builder.eq("batchId", batch._id))
      .order("asc")
      .collect()
    for (const [index, line] of lines.entries()) {
      if (line.lineNumber !== index + 1) {
        throw new Error("La séquence des lignes du lot est incohérente.")
      }
    }
    const validation = validateJournalLines(lines)
    if (
      lines.length !== batch.lineCount ||
      validation.totalDebitFcfa !== batch.totalDebitFcfa ||
      validation.totalCreditFcfa !== batch.totalCreditFcfa
    ) {
      throw new Error("Le contenu du lot ne correspond plus à sa synthèse.")
    }
    const chart = await ctx.db.get(batch.chartVersionId)
    if (!chart || !isDateEffective(batch.postingDate, chart)) {
      throw new Error("La version comptable du lot est invalide.")
    }

    const now = Date.now()
    const patch = {
      status: "validated" as const,
      validatedBy: access.user._id,
      validationIdempotencyKey: idempotencyKey,
      validatedAt: now,
      updatedAt: now,
    }
    await ctx.db.patch(batch._id, patch)
    const result = {
      batchId: batch._id,
      status: "validated" as const,
      totalDebitFcfa: validation.totalDebitFcfa,
      totalCreditFcfa: validation.totalCreditFcfa,
      duplicate: false as const,
    }
    await audit(ctx, {
      actorId: access.user._id,
      action: "finance.lot_ecritures.valider",
      entityTable: "financeJournalBatches",
      entityId: batch._id,
      permission: "valider",
      reason,
      correlationId,
      causationId,
      classification: "confidentiel",
      before: { status: batch.status },
      after: {
        ...patch,
        lineCount: batch.lineCount,
        totalDebitFcfa: validation.totalDebitFcfa,
        totalCreditFcfa: validation.totalCreditFcfa,
      },
    })
    await saveResult(ctx, {
      operation: "finance.journal_batch.validate",
      idempotencyKey,
      actorId: access.user._id,
      entityId: batch._id,
      payloadFingerprint,
      result,
      now,
    })
    return result
  },
})
