import { query } from "../../_generated/server"
import { assertCan } from "../platform/model"
import { isDateEffective } from "./model"

const CONFIG_READ_LIMIT = 100
const ACCOUNT_READ_LIMIT = 5_000
const JOURNAL_READ_LIMIT = 1_000
const LATEST_JOURNAL_LIMIT = 10
const DEMO_CODE_PREFIX = "DEMO-"

/**
 * DTO réel consommé par le tableau de bord Finance. Les absences et limites
 * deviennent des blockers explicites ; aucune donnée de substitution n'est
 * produite côté serveur.
 */
export const getFinanceOverview = query({
  args: {},
  handler: async (ctx) => {
    await assertCan(ctx, {
      moduleCode: "finance",
      resource: "finance",
      permission: "consulter",
      allowScopedLanding: true,
    })

    const generatedAt = Date.now()
    const asOfDate = new Date(generatedAt).toISOString().slice(0, 10)
    const [chartCandidates, taxCandidates, validatedCandidates] =
      await Promise.all([
        ctx.db
          .query("financeChartVersions")
          .withIndex("by_status_effective_from", (builder) =>
            builder.eq("status", "active").lte("effectiveFrom", asOfDate)
          )
          .order("desc")
          .take(CONFIG_READ_LIMIT + 1),
        ctx.db
          .query("financeTaxRuleSets")
          .withIndex("by_status_effective_from", (builder) =>
            builder.eq("status", "active").lte("effectiveFrom", asOfDate)
          )
          .order("desc")
          .take(CONFIG_READ_LIMIT + 1),
        ctx.db
          .query("financeJournalBatches")
          .withIndex("by_status_created", (builder) =>
            builder.eq("status", "validated")
          )
          .order("desc")
          .take(JOURNAL_READ_LIMIT + 1),
      ])

    const activeCharts = chartCandidates
      .slice(0, CONFIG_READ_LIMIT)
      .filter((chart) => isDateEffective(asOfDate, chart))
    const activeTaxRuleSets = taxCandidates
      .slice(0, CONFIG_READ_LIMIT)
      .filter((ruleSet) => isDateEffective(asOfDate, ruleSet))
    const validatedBatches = validatedCandidates.slice(0, JOURNAL_READ_LIMIT)
    const accountGroups = await Promise.all(
      activeCharts.map((chart) =>
        ctx.db
          .query("financeAccounts")
          .withIndex("by_chart", (builder) =>
            builder.eq("chartVersionId", chart._id)
          )
          .take(ACCOUNT_READ_LIMIT + 1)
      )
    )
    const accountLimitReached = accountGroups.some(
      (group) => group.length > ACCOUNT_READ_LIMIT
    )
    const accounts = accountGroups.flatMap((group) =>
      group.slice(0, ACCOUNT_READ_LIMIT)
    )
    const activeAccounts = accounts.filter(
      (account) => account.isPostingAllowed
    ).length
    const totalAccounts = accounts.length

    const selectedRuleSet =
      activeTaxRuleSets.length === 1 ? activeTaxRuleSets[0] : null
    const ruleCandidates = selectedRuleSet
      ? await ctx.db
          .query("financeTaxRules")
          .withIndex("by_rule_set", (builder) =>
            builder.eq("ruleSetId", selectedRuleSet._id)
          )
          .take(101)
      : []
    const rules = ruleCandidates.slice(0, 100).map((rule) => ({
      code: rule.code,
      label: rule.label,
      rateBasisPoints: rule.rateBps,
      basis: rule.basis,
    }))
    const activeRuleSet = selectedRuleSet
      ? {
          _id: selectedRuleSet._id,
          code: selectedRuleSet.code,
          version: selectedRuleSet.version,
          validFrom: selectedRuleSet.effectiveFrom,
          legalSourceLabel: selectedRuleSet.legalSourceLabel,
          legalSourceUrl: selectedRuleSet.legalSourceUrl,
          rules,
        }
      : null

    let totalDebit = 0
    let totalCredit = 0
    for (const batch of validatedBatches) {
      totalDebit += batch.totalDebitFcfa
      totalCredit += batch.totalCreditFcfa
      if (
        !Number.isSafeInteger(totalDebit) ||
        !Number.isSafeInteger(totalCredit)
      ) {
        throw new Error(
          "Les totaux du journal dépassent la capacité entière sûre."
        )
      }
    }

    const blockers: string[] = []
    if (activeCharts.length === 0) {
      blockers.push("Aucun plan comptable actif")
    } else if (activeCharts.length > 1) {
      blockers.push("Plusieurs plans comptables sont actifs simultanément")
    }
    if (totalAccounts === 0) {
      blockers.push("Aucun compte comptable actif")
    } else if (activeAccounts === 0) {
      blockers.push("Aucun compte actif n'autorise les écritures")
    }
    if (activeTaxRuleSets.length === 0) {
      blockers.push("Aucun jeu de règles actif")
    } else if (activeTaxRuleSets.length > 1) {
      blockers.push(
        "Plusieurs jeux de règles fiscales sont actifs simultanément"
      )
    } else if (rules.length === 0) {
      blockers.push("Le jeu de règles actif ne contient aucune règle fiscale")
    }
    if (validatedBatches.length === 0) {
      blockers.push("Aucune écriture comptable validée")
    }
    blockers.push(
      "Les mappings SAGE X3 et e-tax ne disposent pas encore d'une homologation probante"
    )
    if (
      chartCandidates.length > CONFIG_READ_LIMIT ||
      taxCandidates.length > CONFIG_READ_LIMIT ||
      accountLimitReached ||
      validatedCandidates.length > JOURNAL_READ_LIMIT ||
      ruleCandidates.length > 100
    ) {
      blockers.push(
        "Le volume dépasse la limite de lecture de la synthèse financière"
      )
    }

    const provenanceCodes = [
      ...activeCharts.map((chart) => chart.code),
      ...activeTaxRuleSets.map((ruleSet) => ruleSet.code),
      ...validatedBatches.map((batch) => batch.batchNumber),
    ]
    const hasFinanceData =
      provenanceCodes.length > 0 || totalAccounts > 0 || rules.length > 0
    const isSyntheticDemo =
      provenanceCodes.length > 0 &&
      provenanceCodes.every((code) => code.startsWith(DEMO_CODE_PREFIX))
    const referencePeriods = Array.from(
      new Set(validatedBatches.map((batch) => batch.period))
    ).sort()

    return {
      generatedAt,
      dataState: !hasFinanceData
        ? ("empty" as const)
        : isSyntheticDemo
          ? ("synthetic_demo" as const)
          : ("operational" as const),
      dataset: isSyntheticDemo
        ? {
            label: "Scénario financier ferroviaire SETRAG — démonstration",
            notice:
              "Données entièrement synthétiques : elles ne constituent ni des comptes publiés, ni une déclaration fiscale, ni une situation comptable de la SETRAG.",
            referencePeriod:
              referencePeriods.length > 0
                ? referencePeriods.join(", ")
                : "Configuration de démonstration",
          }
        : null,
      configuration: {
        activeRuleSet,
        activeAccounts,
        totalAccounts,
      },
      journal: {
        postedBatches: validatedBatches.length,
        totalDebit,
        totalCredit,
        latest: validatedBatches
          .slice(0, LATEST_JOURNAL_LIMIT)
          .map((batch) => ({
            _id: batch._id,
            reference: batch.batchNumber,
            entryDate: batch.postingDate,
            label: batch.description,
            totalDebit: batch.totalDebitFcfa,
            totalCredit: batch.totalCreditFcfa,
            status: "comptabilise",
          })),
      },
      readiness: {
        canPrepareTaxReturns: blockers.length === 0,
        blockers,
      },
    }
  },
})
