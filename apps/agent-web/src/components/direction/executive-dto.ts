import type { FunctionReturnType } from "convex/server"

import type { api } from "@workspace/backend/generated"
import type { ModuleAccessLevel, ModuleCode } from "@workspace/backend/modules"

import type { PeriodPreset, PeriodRange } from "./executive-period"

/**
 * État de provenance d'une source, porté par chaque valeur affichée (ADR du
 * 10/09). `not_connected` distingue un module visible mais sans aucune source
 * persistée (Matériel, Infrastructures, RH…) d'une source vide ou inaccessible.
 */
export type ExecutiveSourceState =
  | "loading"
  | "operational"
  | "synthetic_demo"
  | "empty"
  | "unavailable"
  | "not_connected"

export type FreightDashboard = FunctionReturnType<
  typeof api.modules.fret.queries.dashboard
>
export type CotrafDashboard = FunctionReturnType<
  typeof api.modules.cotraf.queries.dashboard
>
export type FinanceOverview = FunctionReturnType<
  typeof api.modules.finance.queries.getFinanceOverview
>
export type ContinuitySummary = FunctionReturnType<
  typeof api.modules.continuity.queries.getContinuitySummary
>
export type HealthReport = FunctionReturnType<
  typeof api.functions.monitoring.health
>

/** Tranche de chiffre d'affaires voyageurs (canal, produit, point de vente). */
export interface RevenueSlice {
  key: string
  label: string
  salesCount: number
  ticketCount: number
  netTtc: number
}

export interface DailyPoint {
  date: string
  netTtc: number
  tickets: number
}

/** Desserte voyageurs du jour, telle que persistée (aucune position inférée). */
export interface ServiceTrip {
  id: string
  trainNumber: string
  trainType: string
  status: "planifie" | "a_lheure" | "retarde" | "annule" | "termine"
  delayMinutes: number
  departureAt: number
  arrivalAt: number
  originStationId: string
  destinationStationId: string
}

export interface NetworkStation {
  id: string
  code: string
  name: string
  province: string
  kilometerPoint: number
  isActive: boolean
}

export interface ExecutiveModuleAccess {
  code: ModuleCode
  label: string
  route: string
  accessLevel: ModuleAccessLevel | null
}

export interface ExecutiveOverviewDto {
  period: { preset: PeriodPreset } & PeriodRange
  /** Date de service du jour à Libreville. */
  serviceDate: string
  /** Horodatage le plus récent parmi les instantanés lus. */
  freshnessAt?: number
  passenger: {
    state: ExecutiveSourceState
    revenueNet?: number
    revenueVariationPct?: number | null
    tickets?: number
    ticketVariationPct?: number | null
    occupancyPct?: number
    refundedTtc?: number
    refundRatePct?: number
    averageBasketTtc?: number
    salesCount?: number
    series: readonly DailyPoint[]
    byProduct?: readonly RevenueSlice[]
    byChannel?: readonly RevenueSlice[]
    byPointOfSale?: readonly RevenueSlice[]
  }
  /** Dessertes voyageurs du jour (source publique). */
  service: {
    state: ExecutiveSourceState
    trips: readonly ServiceTrip[]
  }
  /** Référentiel des gares (source publique) : le rail de « La ligne ». */
  network: {
    state: ExecutiveSourceState
    stations: readonly NetworkStation[]
  }
  cotraf: {
    state: ExecutiveSourceState
    generatedAt?: number
    datasetLabel?: string
    pkConvention?: string
    circulations?: number
    delayed?: number
    maxDelayMinutes?: number
    conflicts?: number
    punctualityPct?: number
    dashboard?: CotrafDashboard
  }
  freight: {
    state: ExecutiveSourceState
    activity?: { label: string; value: number; unit: string }
    tonnes?: number
    criticalAlerts?: number
    datasetLabel?: string
    dashboard?: FreightDashboard
  }
  finance: {
    state: ExecutiveSourceState
    blockers: readonly string[]
    postedBatches?: number
    generatedAt?: number
    datasetLabel?: string
    overview?: FinanceOverview
  }
  continuity: {
    state: ExecutiveSourceState
    dataState?: string
    evaluatedPolicyCount?: number
    readyPolicyCount?: number
    notReadyPolicyCount?: number
    summary?: ContinuitySummary
  }
  health: {
    state: ExecutiveSourceState
    severity?: "info" | "avertissement" | "critique"
    checkedAt?: number
    findings: readonly {
      code: string
      label: string
      severity: "info" | "avertissement" | "critique"
      count: number
    }[]
  }
  /** Modules visibles pour ce compte, tels que servis par la plateforme. */
  modules: readonly ExecutiveModuleAccess[]
}

export interface ExecutiveArbitration {
  id: string
  label: string
  detail: string
  tone: "warning" | "critical" | "neutral"
  /** Volet où le signal se lit en détail. */
  volet: "activities" | "finances" | "risks"
}

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const PERCENT_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  // En français, zéro et un restent au singulier (« 0 annulée », « 1 conflit »).
  return `${NUMBER_FORMATTER.format(count)} ${count <= 1 ? singular : plural}`
}

/** DTO honnête pour les tests et le mode E2E : rien n'est chargé, rien n'est inventé. */
export function emptyExecutiveOverview(
  input: { preset: PeriodPreset; serviceDate: string } & PeriodRange
): ExecutiveOverviewDto {
  return {
    period: { preset: input.preset, from: input.from, to: input.to },
    serviceDate: input.serviceDate,
    passenger: { state: "empty", series: [] },
    service: { state: "empty", trips: [] },
    network: { state: "empty", stations: [] },
    cotraf: { state: "unavailable" },
    freight: { state: "unavailable" },
    finance: { state: "unavailable", blockers: [] },
    continuity: { state: "unavailable" },
    health: { state: "unavailable", findings: [] },
    modules: [],
  }
}

/**
 * Signaux à arbitrer, dérivés uniquement de faits présents dans les sources :
 * variation négative, référence absente, alerte ouverte, prérequis non établi,
 * preuve incomplète, conflit ou retard enregistré. Aucun seuil n'est inventé
 * et un scénario synthétique est toujours rétrogradé en signal neutre.
 */
export function deriveExecutiveArbitrations(
  data: ExecutiveOverviewDto
): ExecutiveArbitration[] {
  const arbitrations: ExecutiveArbitration[] = []
  const revenueVariation = data.passenger.revenueVariationPct
  const ticketVariation = data.passenger.ticketVariationPct

  if (data.passenger.state === "operational") {
    if (revenueVariation === null || ticketVariation === null) {
      arbitrations.push({
        id: "passenger-reference",
        label: "Référence voyageurs indisponible",
        detail:
          "La période précédente ne permet pas encore de calculer toutes les variations.",
        tone: "neutral",
        volet: "activities",
      })
    }
    if (typeof revenueVariation === "number" && revenueVariation < 0) {
      arbitrations.push({
        id: "passenger-revenue",
        label: "Recul du chiffre d’affaires voyageurs",
        detail: `Le CA net consolidé baisse de ${PERCENT_FORMATTER.format(Math.abs(revenueVariation))} % par rapport à la période précédente.`,
        tone: "warning",
        volet: "finances",
      })
    }
    if (typeof ticketVariation === "number" && ticketVariation < 0) {
      arbitrations.push({
        id: "passenger-tickets",
        label: "Recul du volume de billets",
        detail: `Le volume consolidé baisse de ${PERCENT_FORMATTER.format(Math.abs(ticketVariation))} % par rapport à la période précédente.`,
        tone: "warning",
        volet: "activities",
      })
    }
  } else if (data.passenger.state === "empty") {
    arbitrations.push({
      id: "passenger-empty",
      label: "Consolidation voyageurs absente",
      detail:
        "Aucune journée clôturée n’alimente la période sélectionnée ; aucun niveau de performance n’est déduit.",
      tone: "neutral",
      volet: "activities",
    })
  }

  if ((data.freight.criticalAlerts ?? 0) > 0) {
    const synthetic = data.freight.state === "synthetic_demo"
    arbitrations.push({
      id: "freight-alerts",
      label: `${pluralize(data.freight.criticalAlerts ?? 0, "alerte critique", "alertes critiques")} Fret ${data.freight.criticalAlerts === 1 ? "ouverte" : "ouvertes"}`,
      detail: synthetic
        ? "Signal issu d’un scénario synthétique de démonstration, sans portée opérationnelle."
        : "Signal remonté par le tableau de bord Fret accessible.",
      tone: synthetic ? "neutral" : "critical",
      volet: "activities",
    })
  }

  if (
    data.finance.blockers.length > 0 &&
    data.finance.state !== "unavailable"
  ) {
    arbitrations.push({
      id: "finance-blockers",
      label: `${pluralize(data.finance.blockers.length, "prérequis Finance")} ${data.finance.blockers.length === 1 ? "non établi" : "non établis"}`,
      detail: data.finance.blockers.join(" · "),
      tone: data.finance.state === "synthetic_demo" ? "neutral" : "warning",
      volet: "finances",
    })
  }

  if (
    data.continuity.state === "empty" ||
    (data.continuity.notReadyPolicyCount ?? 0) > 0
  ) {
    arbitrations.push({
      id: "continuity",
      label:
        data.continuity.state === "empty"
          ? "Aucune politique PCA/PRA approuvée"
          : `${pluralize(data.continuity.notReadyPolicyCount ?? 0, "politique PCA/PRA", "politiques PCA/PRA")} à preuves incomplètes`,
      detail:
        data.continuity.state === "synthetic_demo"
          ? "État issu de scénarios synthétiques, sans valeur d’audit."
          : "État calculé à partir des politiques approuvées et exercices enregistrés.",
      tone: data.continuity.state === "synthetic_demo" ? "neutral" : "warning",
      volet: "risks",
    })
  }

  if (
    data.health.state === "operational" &&
    data.health.severity !== undefined &&
    data.health.severity !== "info"
  ) {
    const criticalCount = data.health.findings.filter(
      ({ severity }) => severity === "critique"
    ).length
    arbitrations.push({
      id: "health",
      label:
        data.health.severity === "critique"
          ? "Santé système critique"
          : "Santé système avec avertissement",
      detail: `${pluralize(data.health.findings.length, "constat")}, dont ${pluralize(criticalCount, "critique")}, dans la supervision accessible.`,
      tone: data.health.severity === "critique" ? "critical" : "warning",
      volet: "risks",
    })
  }

  const cotrafReadable =
    data.cotraf.state === "operational" ||
    data.cotraf.state === "synthetic_demo"
  if (cotrafReadable) {
    const synthetic = data.cotraf.state === "synthetic_demo"
    if ((data.cotraf.conflicts ?? 0) > 0) {
      const conflicts = data.cotraf.dashboard?.conflicts ?? []
      const critical = conflicts.some(({ severity }) => severity === "critical")
      arbitrations.push({
        id: "cotraf-conflicts",
        label: `${pluralize(data.cotraf.conflicts ?? 0, "conflit de croisement", "conflits de croisement")} sur la voie unique`,
        detail: synthetic
          ? "Conflit calculé sur un scénario synthétique de démonstration, sans portée opérationnelle."
          : conflicts
              .map(
                (conflict) =>
                  `${conflict.fromStationName}–${conflict.toStationName} · ${conflict.trainNumbers.join(" / ")}`
              )
              .join(" · "),
        tone: synthetic ? "neutral" : critical ? "critical" : "warning",
        volet: "activities",
      })
    }
    if ((data.cotraf.delayed ?? 0) > 0) {
      arbitrations.push({
        id: "cotraf-delays",
        label: `${pluralize(data.cotraf.delayed ?? 0, "circulation en retard", "circulations en retard")} sur la ligne`,
        detail: `Retard maximal +${NUMBER_FORMATTER.format(data.cotraf.maxDelayMinutes ?? 0)} min · ${synthetic ? "scénario synthétique de démonstration" : "instantané COTRAF"}.`,
        tone: synthetic ? "neutral" : "warning",
        volet: "activities",
      })
    }
  }

  if (data.service.state === "operational") {
    const late = data.service.trips.filter(({ status }) => status === "retarde")
    const cancelled = data.service.trips.filter(
      ({ status }) => status === "annule"
    )
    if (late.length + cancelled.length > 0) {
      const maxDelay = Math.max(
        0,
        ...late.map(({ delayMinutes }) => delayMinutes)
      )
      arbitrations.push({
        id: "trips-delays",
        label: `${pluralize(late.length + cancelled.length, "desserte voyageurs perturbée", "dessertes voyageurs perturbées")} aujourd’hui`,
        detail: `${pluralize(late.length, "retardée")} (retard maximal +${NUMBER_FORMATTER.format(maxDelay)} min), ${pluralize(cancelled.length, "annulée")}.`,
        tone: "warning",
        volet: "activities",
      })
    }
  }

  return arbitrations
}
