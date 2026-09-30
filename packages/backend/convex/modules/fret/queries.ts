import { query } from "../../_generated/server"
import { assertCan } from "../platform/model"
import {
  emptyFretDashboard,
  FRET_DEMO_DATASET_KEY,
  type FretDashboard,
  type FretDashboardKpi,
} from "./model"
import { FRET_DASHBOARD_PERMISSION, FRET_RESOURCE } from "./permissions"

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const access = await assertCan(ctx, {
      moduleCode: "fret",
      resource: FRET_RESOURCE,
      permission: FRET_DASHBOARD_PERMISSION,
      allowScopedLanding: true,
    })
    const dataset = await ctx.db
      .query("fretDatasets")
      .withIndex("by_key", (builder) =>
        builder.eq("datasetKey", FRET_DEMO_DATASET_KEY)
      )
      .unique()
    if (
      !dataset ||
      !dataset.isActive ||
      dataset.dataOrigin !== "synthetic_demo"
    ) {
      return emptyFretDashboard(access.accessibleSiteIds)
    }

    const allOperations = await ctx.db
      .query("fretOperations")
      .withIndex("by_dataset_departure", (builder) =>
        builder.eq("datasetId", dataset._id)
      )
      .collect()
    const allAlerts = await ctx.db
      .query("fretAlerts")
      .withIndex("by_dataset_status", (builder) =>
        builder.eq("datasetId", dataset._id)
      )
      .collect()

    // Une affectation globale voit toute la ligne. Une affectation locale ne
    // reçoit que les scénarios reliés à au moins un de ses sites.
    const accessibleSiteCodes = access.hasGlobalScope
      ? null
      : new Set(
          (
            await Promise.all(
              access.accessibleSiteIds.map((siteId) => ctx.db.get(siteId))
            )
          )
            .filter((site) => site !== null)
            .map((site) => site.code)
        )
    const isVisibleAtAccessibleSite = (siteCodes: readonly string[]) =>
      accessibleSiteCodes === null ||
      siteCodes.some((siteCode) => accessibleSiteCodes.has(siteCode))

    const operations = allOperations.filter(
      (operation) =>
        operation.dataOrigin === dataset.dataOrigin &&
        isVisibleAtAccessibleSite(operation.siteCodes)
    )
    const visibleOperationIds = new Set(
      operations.map((operation) => operation._id)
    )
    const alerts = allAlerts.filter(
      (alert) =>
        alert.dataOrigin === dataset.dataOrigin &&
        isVisibleAtAccessibleSite(alert.siteCodes) &&
        (!alert.operationId || visibleOperationIds.has(alert.operationId))
    )
    const operationCodeById = new Map(
      operations.map((operation) => [operation._id, operation.operationCode])
    )

    return {
      moduleCode: "fret",
      dataState: "synthetic_demo",
      accessibleSiteIds: access.accessibleSiteIds,
      dataset: {
        key: dataset.datasetKey,
        label: dataset.label,
        description: dataset.description,
        dataOrigin: dataset.dataOrigin,
        scenarioDate: dataset.scenarioDate,
        referencePeriod: dataset.referencePeriod,
        routeLabel: dataset.routeLabel,
        routeLengthKm: dataset.routeLengthKm,
        referenceSources: dataset.referenceSources,
      },
      kpis: buildKpis(operations, alerts),
      operations: operations.map((operation) => ({
        id: operation._id,
        operationCode: operation.operationCode,
        trainNumber: operation.trainNumber,
        cargoType: operation.cargoType,
        cargoLabel: operation.cargoLabel,
        clientSegment: operation.clientSegment,
        origin: operation.origin,
        destination: operation.destination,
        currentLocation: operation.currentLocation,
        routeProgressPct: operation.routeProgressPct,
        status: operation.status,
        scheduledDepartureAt: operation.scheduledDepartureAt,
        scheduledArrivalAt: operation.scheduledArrivalAt,
        actualDepartureAt: operation.actualDepartureAt,
        quantity: operation.quantity,
        quantityUnit: operation.quantityUnit,
        wagonCount: operation.wagonCount,
        locomotiveCount: operation.locomotiveCount,
        priority: operation.priority,
        safetyStatus: operation.safetyStatus,
        documentStatus: operation.documentStatus,
        operationalNote: operation.operationalNote,
        lastEventAt: operation.lastEventAt,
      })),
      alerts: alerts
        .sort(
          (left, right) =>
            severityRank(right.severity) - severityRank(left.severity) ||
            right.detectedAt - left.detectedAt
        )
        .map((alert) => ({
          id: alert._id,
          alertCode: alert.alertCode,
          operationCode: alert.operationId
            ? operationCodeById.get(alert.operationId)
            : undefined,
          severity: alert.severity,
          category: alert.category,
          title: alert.title,
          message: alert.message,
          siteLabel: alert.siteLabel,
          status: alert.status,
          detectedAt: alert.detectedAt,
          dueAt: alert.dueAt,
        })),
    } satisfies FretDashboard
  },
})

type OperationForKpi = {
  readonly status: string
  readonly quantity: number
  readonly quantityUnit: "t" | "m3" | "evp"
  readonly wagonCount: number
  readonly documentStatus: "complet" | "a_completer" | "bloque"
}

type AlertForKpi = {
  readonly status: "ouverte" | "acquittee"
  readonly severity: "information" | "warning" | "critical"
}

export function buildKpis(
  operations: readonly OperationForKpi[],
  alerts: readonly AlertForKpi[]
): FretDashboardKpi[] {
  const activeOperations = operations.filter(
    (operation) => operation.status !== "livre"
  )
  const completeDocuments = operations.filter(
    (operation) => operation.documentStatus === "complet"
  ).length
  const openAlerts = alerts.filter((alert) => alert.status === "ouverte")

  return [
    {
      code: "tonnes_en_mouvement",
      label: "Tonnes en mouvement",
      value: activeOperations
        .filter((operation) => operation.quantityUnit === "t")
        .reduce((total, operation) => total + operation.quantity, 0),
      unit: "t",
      description: "Chargements massiques non encore livrés dans le scénario.",
      tone: "neutral",
    },
    {
      code: "operations_actives",
      label: "Opérations actives",
      value: activeOperations.length,
      unit: "trains",
      description: "Trains planifiés, au chargement ou engagés sur la ligne.",
      tone: "positive",
    },
    {
      code: "wagons_mobilises",
      label: "Wagons mobilisés",
      value: activeOperations.reduce(
        (total, operation) => total + operation.wagonCount,
        0
      ),
      unit: "wagons",
      description: "Parc engagé par les opérations non encore livrées.",
      tone: "neutral",
    },
    {
      code: "dossiers_complets",
      label: "Dossiers documentaires complets",
      value:
        operations.length === 0
          ? 0
          : Math.round((completeDocuments / operations.length) * 100),
      unit: "%",
      description:
        "Part des opérations dont le dossier de transport est complet.",
      tone:
        operations.length > 0 && completeDocuments === operations.length
          ? "positive"
          : "warning",
    },
    {
      code: "alertes_critiques",
      label: "Alertes critiques ouvertes",
      value: openAlerts.filter((alert) => alert.severity === "critical").length,
      unit: "alertes",
      description: "Alertes critiques encore à traiter dans le scénario.",
      tone: openAlerts.some((alert) => alert.severity === "critical")
        ? "warning"
        : "positive",
    },
  ]
}

function severityRank(
  severity: "information" | "warning" | "critical"
): number {
  if (severity === "critical") return 3
  if (severity === "warning") return 2
  return 1
}
