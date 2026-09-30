import { addDays, fromServiceDate, type ServiceDate } from "./calendar"

/**
 * Synthèse agrégée des incidents et des procès-verbaux.
 *
 * Logique pure (ADR 0002) : la requête lit les lignes, ce module compte.
 * Les fonctions ne reçoivent que les champs nécessaires aux effectifs et aux
 * montants ; aucune identité, description, photo, desserte ni gare ne les
 * traverse. Le découpage s'arrête volontairement à la catégorie, la gravité,
 * le statut et le motif, sur l'ensemble du réseau : un détail par train, par
 * gare ou par jour permettrait de retrouver les personnes concernées.
 */

export const INCIDENT_SEVERITIES = [
  "information",
  "important",
  "critique",
] as const
export const INCIDENT_CATEGORIES = [
  "securite",
  "technique",
  "comportement",
  "medical",
  "autre",
] as const
export const INCIDENT_STATUSES = ["ouvert", "en_cours", "resolu"] as const
export const PENALTY_STATUSES = ["emis", "paye", "conteste", "annule"] as const
export const PENALTY_REASONS = [
  "sans_titre",
  "titre_invalide",
  "classe_superieure",
  "autre",
] as const

export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]
export type PenaltyStatus = (typeof PENALTY_STATUSES)[number]
export type PenaltyReason = (typeof PENALTY_REASONS)[number]

export interface IncidentFacts {
  readonly category: IncidentCategory
  readonly severity: IncidentSeverity
  readonly status: IncidentStatus
}

export interface PenaltyFacts {
  readonly reason: PenaltyReason
  readonly status: PenaltyStatus
  readonly amountXaf: number
}

export interface IncidentSummary {
  total: number
  /** Incidents non résolus (ouverts ou en cours). */
  open: number
  /** Incidents critiques non résolus : le signal de sécurité à arbitrer. */
  criticalOpen: number
  bySeverity: Record<IncidentSeverity, number>
  byCategory: Record<IncidentCategory, number>
  byStatus: Record<IncidentStatus, number>
}

export interface PenaltySummary {
  total: number
  /** Montant des procès-verbaux non annulés, en FCFA. */
  amountXaf: number
  byStatus: Record<PenaltyStatus, { count: number; amountXaf: number }>
  byReason: Record<PenaltyReason, number>
}

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
}

export function emptyIncidentSummary(): IncidentSummary {
  return {
    total: 0,
    open: 0,
    criticalOpen: 0,
    bySeverity: zeroCounts(INCIDENT_SEVERITIES),
    byCategory: zeroCounts(INCIDENT_CATEGORIES),
    byStatus: zeroCounts(INCIDENT_STATUSES),
  }
}

export function emptyPenaltySummary(): PenaltySummary {
  return {
    total: 0,
    amountXaf: 0,
    byStatus: Object.fromEntries(
      PENALTY_STATUSES.map((status) => [status, { count: 0, amountXaf: 0 }])
    ) as PenaltySummary["byStatus"],
    byReason: zeroCounts(PENALTY_REASONS),
  }
}

export function summarizeIncidents(
  rows: readonly IncidentFacts[]
): IncidentSummary {
  const summary = emptyIncidentSummary()
  for (const row of rows) {
    summary.total += 1
    summary.bySeverity[row.severity] += 1
    summary.byCategory[row.category] += 1
    summary.byStatus[row.status] += 1
    if (row.status !== "resolu") {
      summary.open += 1
      if (row.severity === "critique") summary.criticalOpen += 1
    }
  }
  return summary
}

export function summarizePenalties(
  rows: readonly PenaltyFacts[]
): PenaltySummary {
  const summary = emptyPenaltySummary()
  for (const row of rows) {
    summary.total += 1
    summary.byReason[row.reason] += 1
    summary.byStatus[row.status].count += 1
    summary.byStatus[row.status].amountXaf += row.amountXaf
    if (row.status !== "annule") summary.amountXaf += row.amountXaf
  }
  return summary
}

/**
 * Bornes horaires d'une période de service (dates locales de Libreville,
 * bornes incluses) : début inclus, fin exclue.
 */
export function servicePeriodBounds(
  from: ServiceDate,
  to: ServiceDate
): { start: number; endExclusive: number } {
  if (from > to) {
    throw new Error(`Période invalide : ${from} est postérieur à ${to}`)
  }
  return {
    start: fromServiceDate(from),
    endExclusive: fromServiceDate(addDays(to, 1)),
  }
}
