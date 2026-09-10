import type { Id } from "../../_generated/dataModel"

export interface FretDashboardKpi {
  readonly code: string
  readonly value: number
  readonly unit?: string
}

export interface FretDashboardOperation {
  readonly id: string
  readonly status: string
}

export interface FretDashboardAlert {
  readonly id: string
  readonly severity: "information" | "warning" | "critical"
  readonly message: string
}

export interface FretDashboard {
  readonly moduleCode: "fret"
  readonly dataState: "empty"
  readonly accessibleSiteIds: readonly Id<"sites">[]
  readonly kpis: readonly FretDashboardKpi[]
  readonly operations: readonly FretDashboardOperation[]
  readonly alerts: readonly FretDashboardAlert[]
}

/** Aucun indicateur n'est simulé tant que le modèle opérationnel Fret est vide. */
export function emptyFretDashboard(
  accessibleSiteIds: readonly Id<"sites">[]
): FretDashboard {
  return {
    moduleCode: "fret",
    dataState: "empty",
    accessibleSiteIds,
    kpis: [],
    operations: [],
    alerts: [],
  }
}
