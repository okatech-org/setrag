import type { Id } from "../../_generated/dataModel"

export const FRET_DEMO_DATASET_KEY = "setrag-owendo-franceville-v1"

export interface FretDashboardDataset {
  readonly key: string
  readonly label: string
  readonly description: string
  readonly dataOrigin: "synthetic_demo"
  readonly scenarioDate: string
  readonly referencePeriod: string
  readonly routeLabel: string
  readonly routeLengthKm: number
  readonly referenceSources: readonly {
    readonly label: string
    readonly url: string
  }[]
}

export interface FretDashboardKpi {
  readonly code: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly description: string
  readonly tone: "neutral" | "positive" | "warning"
}

export interface FretDashboardOperation {
  readonly id: string
  readonly operationCode: string
  readonly trainNumber: string
  readonly cargoType: "manganese" | "bois" | "hydrocarbures" | "conteneurs"
  readonly cargoLabel: string
  readonly clientSegment: string
  readonly origin: string
  readonly destination: string
  readonly currentLocation: string
  readonly routeProgressPct: number
  readonly status:
    "planifie" | "chargement" | "en_ligne" | "livraison" | "livre" | "retarde"
  readonly scheduledDepartureAt: number
  readonly scheduledArrivalAt: number
  readonly actualDepartureAt?: number
  readonly quantity: number
  readonly quantityUnit: "t" | "m3" | "evp"
  readonly wagonCount: number
  readonly locomotiveCount: number
  readonly priority: number
  readonly safetyStatus: "conforme" | "controle_requis" | "bloque"
  readonly documentStatus: "complet" | "a_completer" | "bloque"
  readonly operationalNote: string
  readonly lastEventAt: number
}

export interface FretDashboardAlert {
  readonly id: string
  readonly alertCode: string
  readonly operationCode?: string
  readonly severity: "information" | "warning" | "critical"
  readonly category: "exploitation" | "securite" | "documentation" | "capacite"
  readonly title: string
  readonly message: string
  readonly siteLabel: string
  readonly status: "ouverte" | "acquittee"
  readonly detectedAt: number
  readonly dueAt?: number
}

export interface FretDashboard {
  readonly moduleCode: "fret"
  readonly dataState: "empty" | "synthetic_demo"
  readonly accessibleSiteIds: readonly Id<"sites">[]
  readonly dataset: FretDashboardDataset | null
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
    dataset: null,
    kpis: [],
    operations: [],
    alerts: [],
  }
}
