import type { Doc, Id } from "../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../_generated/server"
import {
  computeContinuityReadiness,
  validateContinuityObjectives,
  validateExerciseWindow,
} from "../modules/continuity/model"
import {
  assertRateBasisPoints,
  financePayloadFingerprint,
  validateJournalLines,
} from "../modules/finance/model"

const DEMO_PREFIX = "DEMO-"
const DEMO_LABEL = "[DÉMO SYNTHÉTIQUE]"
const CREATED_AT = Date.UTC(2026, 7, 1, 8, 0, 0)
const APPROVED_AT = Date.UTC(2026, 7, 2, 8, 0, 0)

const TECHNICAL_USERS = [
  {
    authId: "DEMO-SEED-ENTERPRISE-MAKER",
    firstName: "[DÉMO] Compte technique",
    lastName: "FINANCE-MAKER",
    role: "fiscaliste_tresorier" as const,
  },
  {
    authId: "DEMO-SEED-ENTERPRISE-CHECKER",
    firstName: "[DÉMO] Compte technique",
    lastName: "CONTROLE-CHECKER",
    role: "admin_fonctionnel" as const,
  },
] as const

const CHART = {
  code: "DEMO-SYSCOHADA-SETRAG",
  label: `${DEMO_LABEL} Plan comptable ferroviaire illustratif non officiel`,
  version: 1,
  legalSourceLabel: `${DEMO_LABEL} Référence pédagogique SYSCOHADA non homologuée`,
  legalSourceUrl:
    "https://www.ohada.org/publication-du-nouvel-acte-uniforme-relatif-au-droit-comptable-et-a-linformation-financiere/",
  effectiveFrom: "2026-01-01",
} as const

const ACCOUNTS = [
  ["411100", "Compte client fret illustratif"],
  ["443100", "Taxe collectée illustrative A"],
  ["443200", "Taxe collectée illustrative B"],
  ["521100", "Trésorerie illustrative"],
  ["706100", "Produits ferroviaires illustratifs"],
] as const

const TAX_RULE_SET = {
  code: "DEMO-GA-FISCAL",
  label: `${DEMO_LABEL} Jeu fiscal gabonais illustratif non officiel`,
  version: 1,
  legalSourceLabel: `${DEMO_LABEL} Référence fiscale pédagogique non homologuée`,
  legalSourceUrl:
    "https://dgi.ga/imposition-des-personnes-morales/taxes-sur-le-chiffre-daffaires/tva/",
  effectiveFrom: "2026-01-01",
} as const

const TAX_RULES = [
  {
    code: "DEMO-TVA-ILLUSTRATIVE",
    label: `${DEMO_LABEL} Taux TVA illustratif — non officiel`,
    basis: `${DEMO_LABEL} Assiette pédagogique de prestation ferroviaire`,
    rateBps: 1_800,
  },
  {
    code: "DEMO-CSS-ILLUSTRATIVE",
    label: `${DEMO_LABEL} Taux CSS illustratif — non officiel`,
    basis: `${DEMO_LABEL} Assiette pédagogique de chiffre d'affaires`,
    rateBps: 100,
  },
] as const

const JOURNAL_BATCHES = [
  {
    batchNumber: "DEMO-JRN-FRET-MINERAI-001",
    period: "2026-08",
    postingDate: "2026-08-10",
    description: `${DEMO_LABEL} Facturation fret minerai fictive — scénario non officiel`,
    sourceReference: "DEMO-SYNTHETIQUE-FRET-MINERAI-001",
    createdAt: Date.UTC(2026, 7, 10, 8, 0, 0),
    lines: [
      ["411100", "Créance fret minerai fictive", 1_190_000, 0],
      ["706100", "Produit fret minerai fictif", 0, 1_000_000],
      ["443100", "Taxe illustrative A non officielle", 0, 180_000],
      ["443200", "Taxe illustrative B non officielle", 0, 10_000],
    ],
  },
  {
    batchNumber: "DEMO-JRN-ENCAISSEMENT-001",
    period: "2026-08",
    postingDate: "2026-08-12",
    description: `${DEMO_LABEL} Encaissement fret fictif — scénario non officiel`,
    sourceReference: "DEMO-SYNTHETIQUE-ENCAISSEMENT-001",
    createdAt: Date.UTC(2026, 7, 12, 8, 0, 0),
    lines: [
      ["521100", "Trésorerie fictive reçue", 1_190_000, 0],
      ["411100", "Apurement créance fret fictive", 0, 1_190_000],
    ],
  },
  {
    batchNumber: "DEMO-JRN-FRET-BOIS-001",
    period: "2026-08",
    postingDate: "2026-08-18",
    description: `${DEMO_LABEL} Facturation fret bois fictive — scénario non officiel`,
    sourceReference: "DEMO-SYNTHETIQUE-FRET-BOIS-001",
    createdAt: Date.UTC(2026, 7, 18, 8, 0, 0),
    lines: [
      ["411100", "Créance fret bois fictive", 595_000, 0],
      ["706100", "Produit fret bois fictif", 0, 500_000],
      ["443100", "Taxe illustrative A non officielle", 0, 90_000],
      ["443200", "Taxe illustrative B non officielle", 0, 5_000],
    ],
  },
] as const

const POLICIES = [
  {
    policyCode: "DEMO-PCA-BILLETTERIE",
    title: `${DEMO_LABEL} Continuité billettique — scénario fictif`,
    scopeType: "processus" as const,
    scopeReference: "DEMO-PROCESSUS-BILLETTERIE",
    scopeDescription: `${DEMO_LABEL} Vente, contrôle recette et secours papier fictifs`,
    rpoSeconds: 60,
    rtoMinutes: 30,
    offlineAutonomyHours: 24,
    limitations: [
      `${DEMO_LABEL} Objectifs pédagogiques sans valeur contractuelle ni preuve d'infrastructure réelle.`,
    ],
    status: "approuve" as const,
  },
  {
    policyCode: "DEMO-PCA-CONTROLE-HORS-LIGNE",
    title: `${DEMO_LABEL} Contrôle embarqué hors ligne — scénario fictif`,
    scopeType: "systeme" as const,
    scopeReference: "DEMO-SYSTEME-CONTROLE-HORS-LIGNE",
    scopeDescription: `${DEMO_LABEL} Cache de contrôle et resynchronisation fictifs`,
    rpoSeconds: 300,
    rtoMinutes: 60,
    offlineAutonomyHours: 12,
    limitations: [
      `${DEMO_LABEL} L'autonomie cible est illustrative et n'est pas homologuée sur matériel réel.`,
    ],
    status: "approuve" as const,
  },
  {
    policyCode: "DEMO-PRA-TELECOM-VOIE",
    title: `${DEMO_LABEL} Bascule télécom le long de la voie — scénario fictif`,
    scopeType: "systeme" as const,
    scopeReference: "DEMO-SYSTEME-TELECOM-VOIE",
    scopeDescription: `${DEMO_LABEL} Fibre et liaison de secours simulées, sans équipement réel`,
    rpoSeconds: 600,
    rtoMinutes: 120,
    offlineAutonomyHours: 8,
    limitations: [
      `${DEMO_LABEL} Aucun opérateur, débit ou engagement de service réel n'est attesté.`,
    ],
    status: "approuve" as const,
  },
  {
    policyCode: "DEMO-PRA-FINANCE",
    title: `${DEMO_LABEL} Reprise Finance OHADA/DGI — scénario fictif`,
    scopeType: "processus" as const,
    scopeReference: "DEMO-PROCESSUS-FINANCE",
    scopeDescription: `${DEMO_LABEL} Journal comptable, export et déclaration simulés`,
    rpoSeconds: 60,
    rtoMinutes: 30,
    offlineAutonomyHours: 8,
    limitations: [
      `${DEMO_LABEL} Mapping SAGE X3 et télé-déclaration e-tax non homologués.`,
    ],
    status: "brouillon" as const,
  },
] as const

type PolicyCode = (typeof POLICIES)[number]["policyCode"]

const EXERCISES: readonly {
  policyCode: PolicyCode
  suffix: string
  type: "restauration" | "bascule" | "hors_ligne" | "papier"
  startedAt: number
  endedAt: number
  observedRpoSeconds?: number
  observedRtoMinutes?: number
  result: "reussi" | "echoue" | "inconclusif"
  reviewStatus: "a_valider" | "approuve" | "rejete"
  findings: readonly string[]
  evidenceReferences: readonly string[]
}[] = [
  {
    policyCode: "DEMO-PCA-BILLETTERIE",
    suffix: "RESTAURATION",
    type: "restauration",
    startedAt: Date.UTC(2026, 7, 5, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 5, 8, 20, 0),
    observedRpoSeconds: 30,
    observedRtoMinutes: 20,
    result: "reussi",
    reviewStatus: "approuve",
    findings: [
      `${DEMO_LABEL} Résultat simulé conforme au scénario pédagogique.`,
    ],
    evidenceReferences: [
      `${DEMO_LABEL} DEMO-EVIDENCE-BILLETTERIE-RESTAURATION`,
    ],
  },
  {
    policyCode: "DEMO-PCA-BILLETTERIE",
    suffix: "HORS-LIGNE",
    type: "hors_ligne",
    startedAt: Date.UTC(2026, 7, 6, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 7, 8, 0, 0),
    result: "reussi",
    reviewStatus: "approuve",
    findings: [`${DEMO_LABEL} Autonomie simulée, sans poste de gare réel.`],
    evidenceReferences: [`${DEMO_LABEL} DEMO-EVIDENCE-BILLETTERIE-HORS-LIGNE`],
  },
  {
    policyCode: "DEMO-PCA-BILLETTERIE",
    suffix: "PAPIER",
    type: "papier",
    startedAt: Date.UTC(2026, 7, 8, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 8, 9, 0, 0),
    result: "reussi",
    reviewStatus: "approuve",
    findings: [`${DEMO_LABEL} Carnet et ressaisie entièrement fictifs.`],
    evidenceReferences: [`${DEMO_LABEL} DEMO-EVIDENCE-BILLETTERIE-PAPIER`],
  },
  {
    policyCode: "DEMO-PCA-CONTROLE-HORS-LIGNE",
    suffix: "RESTAURATION",
    type: "restauration",
    startedAt: Date.UTC(2026, 7, 9, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 9, 8, 45, 0),
    observedRpoSeconds: 120,
    observedRtoMinutes: 45,
    result: "reussi",
    reviewStatus: "approuve",
    findings: [`${DEMO_LABEL} Mesures produites par un scénario simulé.`],
    evidenceReferences: [`${DEMO_LABEL} DEMO-EVIDENCE-CONTROLE-RESTAURATION`],
  },
  {
    policyCode: "DEMO-PCA-CONTROLE-HORS-LIGNE",
    suffix: "HORS-LIGNE-COURT",
    type: "hors_ligne",
    startedAt: Date.UTC(2026, 7, 10, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 10, 14, 0, 0),
    result: "reussi",
    reviewStatus: "approuve",
    findings: [
      `${DEMO_LABEL} Durée simulée volontairement inférieure à la cible illustrative.`,
    ],
    evidenceReferences: [
      `${DEMO_LABEL} DEMO-EVIDENCE-CONTROLE-HORS-LIGNE-COURT`,
    ],
  },
  {
    policyCode: "DEMO-PCA-CONTROLE-HORS-LIGNE",
    suffix: "PAPIER",
    type: "papier",
    startedAt: Date.UTC(2026, 7, 11, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 11, 9, 0, 0),
    result: "reussi",
    reviewStatus: "approuve",
    findings: [`${DEMO_LABEL} Procédure de substitution fictive.`],
    evidenceReferences: [`${DEMO_LABEL} DEMO-EVIDENCE-CONTROLE-PAPIER`],
  },
  {
    policyCode: "DEMO-PRA-TELECOM-VOIE",
    suffix: "BASCULE-ECHOUEE",
    type: "bascule",
    startedAt: Date.UTC(2026, 7, 12, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 12, 10, 30, 0),
    observedRpoSeconds: 900,
    observedRtoMinutes: 150,
    result: "echoue",
    reviewStatus: "approuve",
    findings: [
      `${DEMO_LABEL} Échec volontaire du scénario ; aucune liaison réelle n'a été testée.`,
    ],
    evidenceReferences: [`${DEMO_LABEL} DEMO-EVIDENCE-TELECOM-BASCULE-ECHOUEE`],
  },
  {
    policyCode: "DEMO-PRA-FINANCE",
    suffix: "RESTAURATION-INCONCLUSIVE",
    type: "restauration",
    startedAt: Date.UTC(2026, 7, 13, 8, 0, 0),
    endedAt: Date.UTC(2026, 7, 13, 9, 0, 0),
    result: "inconclusif",
    reviewStatus: "a_valider",
    findings: [
      `${DEMO_LABEL} Homologation SAGE X3 et e-tax volontairement absente.`,
    ],
    evidenceReferences: [`${DEMO_LABEL} DEMO-EVIDENCE-FINANCE-INCONCLUSIVE`],
  },
]

function assertDemoCode(value: string, label: string): void {
  if (!value.startsWith(DEMO_PREFIX)) {
    throw new Error(
      `Seed refusé : ${label} non démonstration détecté (${value}).`
    )
  }
}

async function assertDemoOnly(ctx: MutationCtx): Promise<void> {
  const [charts, ruleSets, batches, policies] = await Promise.all([
    ctx.db.query("financeChartVersions").collect(),
    ctx.db.query("financeTaxRuleSets").collect(),
    ctx.db.query("financeJournalBatches").collect(),
    ctx.db.query("continuityPolicies").collect(),
  ])
  for (const chart of charts) assertDemoCode(chart.code, "plan comptable")
  for (const ruleSet of ruleSets) assertDemoCode(ruleSet.code, "jeu fiscal")
  for (const batch of batches)
    assertDemoCode(batch.batchNumber, "lot comptable")
  for (const policy of policies)
    assertDemoCode(policy.policyCode, "politique PCA/PRA")

  const chartIds = new Set(charts.map(({ _id }) => _id))
  const ruleSetIds = new Set(ruleSets.map(({ _id }) => _id))
  const batchIds = new Set(batches.map(({ _id }) => _id))
  const policyIds = new Set(policies.map(({ _id }) => _id))
  const [accounts, rules, lines, exercises] = await Promise.all([
    ctx.db.query("financeAccounts").collect(),
    ctx.db.query("financeTaxRules").collect(),
    ctx.db.query("financeJournalLines").collect(),
    ctx.db.query("continuityExercises").collect(),
  ])
  if (accounts.some(({ chartVersionId }) => !chartIds.has(chartVersionId))) {
    throw new Error(
      "Seed refusé : compte rattaché à un plan non démonstration."
    )
  }
  if (rules.some(({ ruleSetId }) => !ruleSetIds.has(ruleSetId))) {
    throw new Error("Seed refusé : règle rattachée à un jeu non démonstration.")
  }
  if (lines.some(({ batchId }) => !batchIds.has(batchId))) {
    throw new Error("Seed refusé : ligne rattachée à un lot non démonstration.")
  }
  if (exercises.some(({ policyId }) => !policyIds.has(policyId))) {
    throw new Error(
      "Seed refusé : exercice rattaché à une politique non démonstration."
    )
  }
}

async function upsertTechnicalUser(
  ctx: MutationCtx,
  definition: (typeof TECHNICAL_USERS)[number]
): Promise<{ userId: Id<"users">; created: boolean }> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_authId", (builder) =>
      builder.eq("authId", definition.authId)
    )
    .unique()
  const values = {
    authId: definition.authId,
    email: undefined,
    phone: undefined,
    firstName: definition.firstName,
    lastName: definition.lastName,
    matricule: undefined,
    pointOfSaleId: undefined,
    role: definition.role,
    identitySource: "local" as const,
    isActive: false,
  }
  if (existing) {
    await ctx.db.patch(existing._id, values)
    return { userId: existing._id, created: false }
  }
  return {
    userId: await ctx.db.insert("users", values),
    created: true,
  }
}

async function upsertChart(
  ctx: MutationCtx,
  makerId: Id<"users">,
  checkerId: Id<"users">
): Promise<{ id: Id<"financeChartVersions">; created: boolean }> {
  const existing = await ctx.db
    .query("financeChartVersions")
    .withIndex("by_code_version", (builder) =>
      builder.eq("code", CHART.code).eq("version", CHART.version)
    )
    .unique()
  const values = {
    ...CHART,
    status: "active" as const,
    idempotencyKey: "DEMO-IDEMP-CHART-V1",
    payloadFingerprint: financePayloadFingerprint(CHART),
    correlationId: "DEMO-CORR-CHART-V1",
    createdBy: makerId,
    activatedBy: checkerId,
    activationIdempotencyKey: "DEMO-IDEMP-CHART-ACTIVATE-V1",
    createdAt: CREATED_AT,
    updatedAt: APPROVED_AT,
    activatedAt: APPROVED_AT,
  }
  if (existing) {
    await ctx.db.patch(existing._id, values)
    return { id: existing._id, created: false }
  }
  return {
    id: await ctx.db.insert("financeChartVersions", values),
    created: true,
  }
}

async function upsertAccounts(
  ctx: MutationCtx,
  chartVersionId: Id<"financeChartVersions">,
  makerId: Id<"users">
): Promise<Map<string, Id<"financeAccounts">>> {
  const ids = new Map<string, Id<"financeAccounts">>()
  for (const [code, label] of ACCOUNTS) {
    const existing = await ctx.db
      .query("financeAccounts")
      .withIndex("by_chart", (builder) =>
        builder.eq("chartVersionId", chartVersionId).eq("code", code)
      )
      .unique()
    const values = {
      chartVersionId,
      code,
      label: `${DEMO_LABEL} ${label} — non officiel`,
      description: `${DEMO_LABEL} Compte minimal réservé au scénario de démonstration.`,
      isPostingAllowed: true,
      idempotencyKey: `DEMO-IDEMP-ACCOUNT-${code}`,
      payloadFingerprint: financePayloadFingerprint({ code, label }),
      createdBy: makerId,
      updatedBy: makerId,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    }
    if (existing) {
      await ctx.db.patch(existing._id, values)
      ids.set(code, existing._id)
    } else {
      ids.set(code, await ctx.db.insert("financeAccounts", values))
    }
  }
  return ids
}

async function upsertTaxRules(
  ctx: MutationCtx,
  makerId: Id<"users">,
  checkerId: Id<"users">
): Promise<{ id: Id<"financeTaxRuleSets">; created: boolean }> {
  for (const rule of TAX_RULES) assertRateBasisPoints(rule.rateBps)
  const existing = await ctx.db
    .query("financeTaxRuleSets")
    .withIndex("by_code_version", (builder) =>
      builder.eq("code", TAX_RULE_SET.code).eq("version", TAX_RULE_SET.version)
    )
    .unique()
  const values = {
    ...TAX_RULE_SET,
    status: "active" as const,
    idempotencyKey: "DEMO-IDEMP-TAX-RULE-SET-V1",
    payloadFingerprint: financePayloadFingerprint({ TAX_RULE_SET, TAX_RULES }),
    correlationId: "DEMO-CORR-TAX-RULE-SET-V1",
    createdBy: makerId,
    activatedBy: checkerId,
    activationIdempotencyKey: "DEMO-IDEMP-TAX-RULE-SET-ACTIVATE-V1",
    createdAt: CREATED_AT,
    updatedAt: APPROVED_AT,
    activatedAt: APPROVED_AT,
  }
  const ruleSetId = existing
    ? existing._id
    : await ctx.db.insert("financeTaxRuleSets", values)
  if (existing) await ctx.db.patch(existing._id, values)

  for (const rule of TAX_RULES) {
    const stored = await ctx.db
      .query("financeTaxRules")
      .withIndex("by_rule_set", (builder) =>
        builder.eq("ruleSetId", ruleSetId).eq("code", rule.code)
      )
      .unique()
    const ruleValues = { ruleSetId, ...rule, createdAt: CREATED_AT }
    if (stored) await ctx.db.patch(stored._id, ruleValues)
    else await ctx.db.insert("financeTaxRules", ruleValues)
  }
  return { id: ruleSetId, created: !existing }
}

async function upsertJournalBatches(
  ctx: MutationCtx,
  input: {
    chartVersionId: Id<"financeChartVersions">
    taxRuleSetId: Id<"financeTaxRuleSets">
    accountIds: Map<string, Id<"financeAccounts">>
    makerId: Id<"users">
    checkerId: Id<"users">
  }
): Promise<{ batchesCreated: number; linesCreated: number }> {
  let batchesCreated = 0
  let linesCreated = 0
  for (const definition of JOURNAL_BATCHES) {
    const lines = definition.lines.map(
      ([accountCode, label, debitFcfa, creditFcfa]) => ({
        accountCode,
        label: `${DEMO_LABEL} ${label}`,
        debitFcfa,
        creditFcfa,
      })
    )
    const validation = validateJournalLines(lines)
    const existing = await ctx.db
      .query("financeJournalBatches")
      .withIndex("by_batch_number", (builder) =>
        builder.eq("batchNumber", definition.batchNumber)
      )
      .unique()
    const values = {
      batchNumber: definition.batchNumber,
      period: definition.period,
      postingDate: definition.postingDate,
      description: definition.description,
      sourceReference: definition.sourceReference,
      chartVersionId: input.chartVersionId,
      taxRuleSetId: input.taxRuleSetId,
      status: "validated" as const,
      lineCount: validation.lines.length,
      totalDebitFcfa: validation.totalDebitFcfa,
      totalCreditFcfa: validation.totalCreditFcfa,
      idempotencyKey: `DEMO-IDEMP-${definition.batchNumber}`,
      payloadFingerprint: financePayloadFingerprint(definition),
      correlationId: `DEMO-CORR-${definition.batchNumber}`,
      createdBy: input.makerId,
      validatedBy: input.checkerId,
      validationIdempotencyKey: `DEMO-IDEMP-VALIDATE-${definition.batchNumber}`,
      createdAt: definition.createdAt,
      updatedAt: definition.createdAt + 60 * 60 * 1_000,
      validatedAt: definition.createdAt + 60 * 60 * 1_000,
    }
    const batchId = existing
      ? existing._id
      : await ctx.db.insert("financeJournalBatches", values)
    if (existing) await ctx.db.patch(existing._id, values)
    else batchesCreated += 1

    for (const [index, line] of validation.lines.entries()) {
      const accountId = input.accountIds.get(line.accountCode)
      if (!accountId)
        throw new Error(`Compte de démonstration absent : ${line.accountCode}`)
      const stored = await ctx.db
        .query("financeJournalLines")
        .withIndex("by_batch_line", (builder) =>
          builder.eq("batchId", batchId).eq("lineNumber", index + 1)
        )
        .unique()
      const lineValues = {
        batchId,
        lineNumber: index + 1,
        accountId,
        accountCode: line.accountCode,
        label: line.label,
        debitFcfa: line.debitFcfa,
        creditFcfa: line.creditFcfa,
        createdAt: definition.createdAt,
      }
      if (stored) await ctx.db.patch(stored._id, lineValues)
      else {
        await ctx.db.insert("financeJournalLines", lineValues)
        linesCreated += 1
      }
    }
  }
  return { batchesCreated, linesCreated }
}

async function upsertPoliciesAndExercises(
  ctx: MutationCtx,
  makerId: Id<"users">,
  checkerId: Id<"users">
) {
  const policyIds = new Map<PolicyCode, Id<"continuityPolicies">>()
  let policiesCreated = 0
  for (const policy of POLICIES) {
    validateContinuityObjectives(policy)
    const existing = await ctx.db
      .query("continuityPolicies")
      .withIndex("by_code_version", (builder) =>
        builder.eq("policyCode", policy.policyCode).eq("version", 1)
      )
      .unique()
    const approved = policy.status === "approuve"
    const values = {
      ...policy,
      limitations: [...policy.limitations],
      version: 1,
      creationCorrelationId: `DEMO-CORR-${policy.policyCode}-CREATE`,
      approvalCorrelationId: approved
        ? `DEMO-CORR-${policy.policyCode}-APPROVE`
        : undefined,
      createdBy: makerId,
      approvedBy: approved ? checkerId : undefined,
      createdAt: CREATED_AT,
      updatedAt: approved ? APPROVED_AT : CREATED_AT,
      approvedAt: approved ? APPROVED_AT : undefined,
    }
    const policyId = existing
      ? existing._id
      : await ctx.db.insert("continuityPolicies", values)
    if (existing) await ctx.db.patch(existing._id, values)
    else policiesCreated += 1
    policyIds.set(policy.policyCode, policyId)
  }

  let exercisesCreated = 0
  for (const exercise of EXERCISES) {
    validateExerciseWindow(exercise.startedAt, exercise.endedAt)
    const policyId = policyIds.get(exercise.policyCode)
    if (!policyId)
      throw new Error(
        `Politique de démonstration absente : ${exercise.policyCode}`
      )
    const creationCorrelationId = `DEMO-CORR-${exercise.policyCode}-${exercise.suffix}`
    const existing = await ctx.db
      .query("continuityExercises")
      .withIndex("by_creation_correlation", (builder) =>
        builder.eq("creationCorrelationId", creationCorrelationId)
      )
      .unique()
    const reviewed = exercise.reviewStatus !== "a_valider"
    const values = {
      policyId,
      type: exercise.type,
      startedAt: exercise.startedAt,
      endedAt: exercise.endedAt,
      observedRpoSeconds: exercise.observedRpoSeconds,
      observedRtoMinutes: exercise.observedRtoMinutes,
      result: exercise.result,
      findings: [...exercise.findings],
      evidenceReferences: [...exercise.evidenceReferences],
      reviewStatus: exercise.reviewStatus,
      creationCorrelationId,
      reviewCorrelationId: reviewed
        ? `${creationCorrelationId}-REVIEW`
        : undefined,
      createdBy: makerId,
      reviewedBy: reviewed ? checkerId : undefined,
      reviewComment: reviewed
        ? `${DEMO_LABEL} Revue synthétique sans valeur d'homologation.`
        : undefined,
      createdAt: exercise.endedAt,
      updatedAt: reviewed
        ? exercise.endedAt + 60 * 60 * 1_000
        : exercise.endedAt,
      reviewedAt: reviewed ? exercise.endedAt + 60 * 60 * 1_000 : undefined,
    }
    if (existing) await ctx.db.patch(existing._id, values)
    else {
      await ctx.db.insert("continuityExercises", values)
      exercisesCreated += 1
    }
  }

  const readiness = []
  for (const policy of POLICIES) {
    const policyId = policyIds.get(policy.policyCode)!
    const storedPolicy = (await ctx.db.get(policyId))!
    const exercises = await ctx.db
      .query("continuityExercises")
      .withIndex("by_policy_end", (builder) => builder.eq("policyId", policyId))
      .collect()
    const result = computeContinuityReadiness(storedPolicy, exercises)
    readiness.push({
      policyCode: policy.policyCode,
      policyId,
      status: storedPolicy.status,
      ready: result.ready,
      gaps: result.gaps,
    })
  }
  return { policiesCreated, exercisesCreated, readiness }
}

/**
 * Seed transversal strictement synthétique et rejouable.
 *
 * Il refuse tout mélange avec des racines Finance/PCA non préfixées DEMO et
 * ne supprime aucune donnée. Les identités techniques sont désactivées, sans
 * courriel ni téléphone : elles ne constituent pas des comptes connectables.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error(
        "Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true."
      )
    }
    await assertDemoOnly(ctx)

    const maker = await upsertTechnicalUser(ctx, TECHNICAL_USERS[0])
    const checker = await upsertTechnicalUser(ctx, TECHNICAL_USERS[1])
    if (maker.userId === checker.userId) {
      throw new Error("Seed refusé : maker et checker doivent être distincts.")
    }

    const chart = await upsertChart(ctx, maker.userId, checker.userId)
    const accountIds = await upsertAccounts(ctx, chart.id, maker.userId)
    const ruleSet = await upsertTaxRules(ctx, maker.userId, checker.userId)
    const journals = await upsertJournalBatches(ctx, {
      chartVersionId: chart.id,
      taxRuleSetId: ruleSet.id,
      accountIds,
      makerId: maker.userId,
      checkerId: checker.userId,
    })
    const continuity = await upsertPoliciesAndExercises(
      ctx,
      maker.userId,
      checker.userId
    )

    return {
      dataState: "demo_synthetique" as const,
      users: {
        created: Number(maker.created) + Number(checker.created),
        updated: Number(!maker.created) + Number(!checker.created),
        connectable: 0,
      },
      finance: {
        chartVersionId: chart.id,
        chartCreated: chart.created,
        accountsUpserted: accountIds.size,
        taxRuleSetId: ruleSet.id,
        taxRuleSetCreated: ruleSet.created,
        taxRulesUpserted: TAX_RULES.length,
        journalBatchesCreated: journals.batchesCreated,
        journalBatchesUpserted: JOURNAL_BATCHES.length,
        journalLinesCreated: journals.linesCreated,
      },
      continuity: {
        policiesCreated: continuity.policiesCreated,
        policiesUpserted: POLICIES.length,
        exercisesCreated: continuity.exercisesCreated,
        exercisesUpserted: EXERCISES.length,
        readiness: continuity.readiness,
      },
      warnings: [
        `${DEMO_LABEL} Aucun taux, objectif PCA/PRA, montant ou résultat n'est officiel.`,
        `${DEMO_LABEL} Mapping SAGE X3 et télé-déclaration e-tax non homologués.`,
      ],
    }
  },
})
