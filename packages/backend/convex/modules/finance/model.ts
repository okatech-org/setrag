/**
 * Invariants purs Finance. Aucun taux ni compte réglementaire n'est codé en
 * dur : les valeurs applicables proviennent exclusivement des versions
 * activées et sourcées dans la base.
 */

export const MAX_FINANCE_LINES_PER_BATCH = 500
export const MAX_TAX_RULES_PER_SET = 100

export interface EffectivePeriod {
  readonly effectiveFrom: string
  readonly effectiveUntil?: string
}

export interface JournalLineInput {
  readonly accountCode: string
  readonly label: string
  readonly debitFcfa: number
  readonly creditFcfa: number
  readonly thirdPartyRef?: string
  readonly costCenter?: string
}

export interface ValidatedJournalLine extends JournalLineInput {
  readonly accountCode: string
  readonly label: string
  readonly thirdPartyRef?: string
  readonly costCenter?: string
}

export interface JournalValidationResult {
  readonly lines: readonly ValidatedJournalLine[]
  readonly totalDebitFcfa: number
  readonly totalCreditFcfa: number
}

export function requiredFinanceText(
  value: string,
  label: string,
  maxLength: number
): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maxLength} caractères.`
    )
  }
  return normalized
}

export function optionalFinanceText(
  value: string | undefined,
  label: string,
  maxLength: number
): string | undefined {
  return value === undefined
    ? undefined
    : requiredFinanceText(value, label, maxLength)
}

export function normalizeLegalSourceUrl(value: string): string {
  const normalized = requiredFinanceText(
    value,
    "L'URL de la source légale",
    1_000
  )
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error("L'URL de la source légale est invalide.")
  }
  if (url.protocol !== "https:") {
    throw new Error("L'URL de la source légale doit utiliser HTTPS.")
  }
  return url.toString()
}

export function normalizeFinanceCode(
  value: string,
  label: string,
  maxLength = 80
): string {
  const code = value.trim().toUpperCase()
  if (
    code.length < 2 ||
    code.length > maxLength ||
    !/^[A-Z0-9][A-Z0-9_.-]*$/.test(code)
  ) {
    throw new Error(
      `${label} doit contenir ${maxLength} caractères au plus : lettres, chiffres, points, tirets ou soulignés.`
    )
  }
  return code
}

/** Un compte SYSCOHADA appartient obligatoirement à une classe 1 à 9. */
export function normalizeSyscohadaAccountCode(value: string): string {
  const code = value.trim()
  if (!/^[1-9][0-9]{1,19}$/.test(code)) {
    throw new Error(
      "Le code de compte SYSCOHADA doit comporter 2 à 20 chiffres et commencer par une classe de 1 à 9."
    )
  }
  return code
}

export function assertPositiveVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("La version doit être un entier positif sûr.")
  }
  return value
}

/** Les taux sont stockés en points de base : 10 000 pb représentent 100 %. */
export function assertRateBasisPoints(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error(
      "Le taux doit être un entier compris entre 0 et 10 000 points de base."
    )
  }
  return value
}

/** Les montants FCFA sont des entiers non négatifs et sûrs en JavaScript. */
export function assertSafeFcfaAmount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} doit être un montant FCFA entier positif ou nul.`)
  }
  return value
}

function addSafeFcfa(total: number, amount: number, label: string): number {
  const next = total + amount
  if (!Number.isSafeInteger(next)) {
    throw new Error(`${label} dépasse la capacité entière sûre.`)
  }
  return next
}

function isoDateParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Valide une date civile ISO sans conversion implicite de fuseau horaire. */
export function normalizeIsoDate(value: string, label: string): string {
  const normalized = value.trim()
  const parts = isoDateParts(normalized)
  if (!parts) throw new Error(`${label} doit respecter le format YYYY-MM-DD.`)
  const [year, month, day] = parts
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`${label} n'est pas une date civile valide.`)
  }
  return normalized
}

export function normalizeIsoPeriod(value: string): string {
  const normalized = value.trim()
  const match = /^(\d{4})-(\d{2})$/.exec(normalized)
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error("La période comptable doit respecter le format YYYY-MM.")
  }
  return normalized
}

export function assertDateInPeriod(date: string, period: string): void {
  if (!date.startsWith(`${period}-`)) {
    throw new Error(
      "La date de comptabilisation est hors de la période indiquée."
    )
  }
}

export function normalizeEffectivePeriod(
  effectiveFrom: string,
  effectiveUntil?: string
): EffectivePeriod {
  const from = normalizeIsoDate(effectiveFrom, "La date de début d'effet")
  const until =
    effectiveUntil === undefined
      ? undefined
      : normalizeIsoDate(effectiveUntil, "La date de fin d'effet")
  if (until !== undefined && until < from) {
    throw new Error("La fin d'effet ne peut pas précéder le début d'effet.")
  }
  return { effectiveFrom: from, effectiveUntil: until }
}

/** Les bornes des périodes réglementaires sont inclusives. */
export function effectivePeriodsOverlap(
  left: EffectivePeriod,
  right: EffectivePeriod
): boolean {
  return (
    (left.effectiveUntil === undefined ||
      right.effectiveFrom <= left.effectiveUntil) &&
    (right.effectiveUntil === undefined ||
      left.effectiveFrom <= right.effectiveUntil)
  )
}

export function assertNoEffectivePeriodOverlap(
  candidate: EffectivePeriod,
  existing: readonly EffectivePeriod[],
  label: string
): void {
  if (existing.some((period) => effectivePeriodsOverlap(candidate, period))) {
    throw new Error(`${label} chevauche une version déjà active.`)
  }
}

export function isDateEffective(
  date: string,
  period: EffectivePeriod
): boolean {
  return (
    date >= period.effectiveFrom &&
    (period.effectiveUntil === undefined || date <= period.effectiveUntil)
  )
}

export function assertSeparationOfDuties(
  creatorId: string,
  validatorId: string,
  entityLabel: string
): void {
  if (creatorId === validatorId) {
    throw new Error(
      `Le créateur ${entityLabel} ne peut pas assurer sa propre validation.`
    )
  }
}

export function validateJournalLines(
  input: readonly JournalLineInput[]
): JournalValidationResult {
  if (input.length < 2 || input.length > MAX_FINANCE_LINES_PER_BATCH) {
    throw new Error(
      `Un lot doit contenir entre 2 et ${MAX_FINANCE_LINES_PER_BATCH} lignes.`
    )
  }

  let totalDebitFcfa = 0
  let totalCreditFcfa = 0
  const lines = input.map((line, index): ValidatedJournalLine => {
    const debitFcfa = assertSafeFcfaAmount(
      line.debitFcfa,
      `Le débit de la ligne ${index + 1}`
    )
    const creditFcfa = assertSafeFcfaAmount(
      line.creditFcfa,
      `Le crédit de la ligne ${index + 1}`
    )
    if ((debitFcfa === 0) === (creditFcfa === 0)) {
      throw new Error(
        `La ligne ${index + 1} doit porter exactement un débit ou un crédit non nul.`
      )
    }
    totalDebitFcfa = addSafeFcfa(
      totalDebitFcfa,
      debitFcfa,
      "Le total des débits"
    )
    totalCreditFcfa = addSafeFcfa(
      totalCreditFcfa,
      creditFcfa,
      "Le total des crédits"
    )
    return {
      accountCode: normalizeSyscohadaAccountCode(line.accountCode),
      label: requiredFinanceText(
        line.label,
        `Le libellé de la ligne ${index + 1}`,
        240
      ),
      debitFcfa,
      creditFcfa,
      thirdPartyRef: optionalFinanceText(
        line.thirdPartyRef,
        `La référence tiers de la ligne ${index + 1}`,
        120
      ),
      costCenter: optionalFinanceText(
        line.costCenter,
        `Le centre de coût de la ligne ${index + 1}`,
        120
      ),
    }
  })

  if (totalDebitFcfa !== totalCreditFcfa) {
    throw new Error(
      `Le lot est déséquilibré : débit ${totalDebitFcfa} FCFA, crédit ${totalCreditFcfa} FCFA.`
    )
  }
  if (totalDebitFcfa === 0) {
    throw new Error("Un lot équilibré ne peut pas avoir un total nul.")
  }
  return { lines, totalDebitFcfa, totalCreditFcfa }
}

/** Empreinte logique déterministe utilisée pour détecter les collisions. */
export function financePayloadFingerprint(value: unknown): string {
  return JSON.stringify(value)
}
