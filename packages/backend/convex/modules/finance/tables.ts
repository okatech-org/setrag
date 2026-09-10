import { defineTable } from "convex/server"
import { v } from "convex/values"

const lifecycleStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("retired")
)

/** Tables du socle Finance OHADA/DGI, à composer dans le schéma racine. */
export const financeTables = {
  /** Reçus immuables assurant l'idempotence des commandes Finance. */
  financeMutationReceipts: defineTable({
    operation: v.string(),
    idempotencyKey: v.string(),
    actorId: v.id("users"),
    entityId: v.string(),
    payloadFingerprint: v.string(),
    result: v.string(),
    createdAt: v.number(),
  }).index("by_operation_key", ["operation", "idempotencyKey"]),

  financeChartVersions: defineTable({
    code: v.string(),
    label: v.string(),
    version: v.number(),
    legalSourceLabel: v.string(),
    legalSourceUrl: v.string(),
    effectiveFrom: v.string(),
    effectiveUntil: v.optional(v.string()),
    status: lifecycleStatus,
    idempotencyKey: v.string(),
    payloadFingerprint: v.string(),
    correlationId: v.string(),
    createdBy: v.id("users"),
    activatedBy: v.optional(v.id("users")),
    activationIdempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    activatedAt: v.optional(v.number()),
  })
    .index("by_code_version", ["code", "version"])
    .index("by_code_status", ["code", "status", "effectiveFrom"])
    .index("by_status_effective_from", ["status", "effectiveFrom"])
    .index("by_idempotency", ["idempotencyKey"]),

  financeAccounts: defineTable({
    chartVersionId: v.id("financeChartVersions"),
    code: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    isPostingAllowed: v.boolean(),
    idempotencyKey: v.string(),
    payloadFingerprint: v.string(),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_chart", ["chartVersionId", "code"])
    .index("by_chart_idempotency", ["chartVersionId", "idempotencyKey"]),

  financeTaxRuleSets: defineTable({
    code: v.string(),
    label: v.string(),
    version: v.number(),
    legalSourceLabel: v.string(),
    legalSourceUrl: v.string(),
    effectiveFrom: v.string(),
    effectiveUntil: v.optional(v.string()),
    status: lifecycleStatus,
    idempotencyKey: v.string(),
    payloadFingerprint: v.string(),
    correlationId: v.string(),
    createdBy: v.id("users"),
    activatedBy: v.optional(v.id("users")),
    activationIdempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    activatedAt: v.optional(v.number()),
  })
    .index("by_code_version", ["code", "version"])
    .index("by_code_status", ["code", "status", "effectiveFrom"])
    .index("by_status_effective_from", ["status", "effectiveFrom"])
    .index("by_idempotency", ["idempotencyKey"]),

  financeTaxRules: defineTable({
    ruleSetId: v.id("financeTaxRuleSets"),
    code: v.string(),
    label: v.string(),
    basis: v.string(),
    rateBps: v.number(),
    createdAt: v.number(),
  }).index("by_rule_set", ["ruleSetId", "code"]),

  financeJournalBatches: defineTable({
    batchNumber: v.string(),
    period: v.string(),
    postingDate: v.string(),
    description: v.string(),
    sourceReference: v.optional(v.string()),
    chartVersionId: v.id("financeChartVersions"),
    taxRuleSetId: v.optional(v.id("financeTaxRuleSets")),
    status: v.union(v.literal("draft"), v.literal("validated")),
    lineCount: v.number(),
    totalDebitFcfa: v.number(),
    totalCreditFcfa: v.number(),
    idempotencyKey: v.string(),
    payloadFingerprint: v.string(),
    correlationId: v.string(),
    createdBy: v.id("users"),
    validatedBy: v.optional(v.id("users")),
    validationIdempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    validatedAt: v.optional(v.number()),
  })
    .index("by_batch_number", ["batchNumber"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_period_status", ["period", "status", "createdAt"]),

  financeJournalLines: defineTable({
    batchId: v.id("financeJournalBatches"),
    lineNumber: v.number(),
    accountId: v.id("financeAccounts"),
    accountCode: v.string(),
    label: v.string(),
    debitFcfa: v.number(),
    creditFcfa: v.number(),
    thirdPartyRef: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_batch_line", ["batchId", "lineNumber"]),
} as const
