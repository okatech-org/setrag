"use client"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import type { ModuleCode } from "@workspace/backend/modules"

import { useModuleNavigationAccesses } from "@/components/module-access-navigation"
import { usePortalSession } from "@/components/portal-guard"
import { asAppRole } from "@/lib/portal-access"

import {
  emptyExecutiveOverview,
  type ExecutiveOverviewDto,
  type ExecutiveSourceState,
  type RevenueSlice,
} from "./executive-dto"
import type { PeriodPreset, PeriodRange } from "./executive-period"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export interface ExecutiveCockpitInput {
  preset: PeriodPreset
  range: PeriodRange
  serviceDate: string
}

function toSlices(
  rows:
    | readonly {
        key: string
        label: string
        salesCount: number
        ticketCount: number
        netTtc: number
      }[]
    | undefined
): readonly RevenueSlice[] | undefined {
  return rows?.map(({ key, label, salesCount, ticketCount, netTtc }) => ({
    key,
    label,
    salesCount,
    ticketCount,
    netTtc,
  }))
}

/**
 * Assemble la lecture consolidée de la Direction générale à partir des seules
 * sources accessibles au compte. Un module absent des habilitations visibles
 * n'est jamais interrogé : sa source est « Non accessible ». En mode E2E rien
 * n'est interrogé, y compris les sources publiques, et le DTO reste vide.
 */
export function useExecutiveCockpit({
  preset,
  range,
  serviceDate,
}: ExecutiveCockpitInput): ExecutiveOverviewDto {
  const portalSession = usePortalSession()
  const role = E2E_MODE
    ? ("direction_generale" as const)
    : asAppRole(portalSession?.profile.user?.role)
  const { accesses, loading: accessesLoading } =
    useModuleNavigationAccesses(role)
  const hasVisibleModule = (code: ModuleCode) =>
    accesses.some((access) => access.code === code)
  const loadPassenger = !E2E_MODE && hasVisibleModule("voyageurs")
  const loadFreight = !E2E_MODE && hasVisibleModule("fret")
  const loadCotraf = !E2E_MODE && hasVisibleModule("cotraf")
  const loadFinance = !E2E_MODE && hasVisibleModule("finance")
  const loadContinuity = !E2E_MODE && hasVisibleModule("securite")
  const periodArgs = { from: range.from, to: range.to }

  const stations = useQuery(
    api.functions.referential.listStations,
    E2E_MODE ? "skip" : {}
  )
  const trips = useQuery(
    api.functions.trips.listByDate,
    E2E_MODE ? "skip" : { serviceDate }
  )
  const reporting = useQuery(
    api.functions.reporting.dashboard,
    loadPassenger ? periodArgs : "skip"
  )
  const dailySeries = useQuery(
    api.functions.reporting.dailySeries,
    loadPassenger ? periodArgs : "skip"
  )
  const byProduct = useQuery(
    api.functions.reporting.byProduct,
    loadPassenger ? periodArgs : "skip"
  )
  const byChannel = useQuery(
    api.functions.reporting.byChannel,
    loadPassenger ? periodArgs : "skip"
  )
  const byPointOfSale = useQuery(
    api.functions.reporting.byPointOfSale,
    loadPassenger ? { ...periodArgs, top: 8 } : "skip"
  )
  const health = useQuery(
    api.functions.monitoring.health,
    loadPassenger ? {} : "skip"
  )
  const freight = useQuery(
    api.modules.fret.queries.dashboard,
    loadFreight ? {} : "skip"
  )
  const cotraf = useQuery(
    api.modules.cotraf.queries.dashboard,
    loadCotraf ? {} : "skip"
  )
  const finance = useQuery(
    api.modules.finance.queries.getFinanceOverview,
    loadFinance ? {} : "skip"
  )
  const continuity = useQuery(
    api.modules.continuity.queries.getContinuitySummary,
    loadContinuity ? { policyLimit: 8 } : "skip"
  )

  if (E2E_MODE) {
    return emptyExecutiveOverview({ preset, serviceDate, ...range })
  }

  const inaccessible: ExecutiveSourceState = accessesLoading
    ? "loading"
    : "unavailable"
  const passengerState: ExecutiveSourceState = !loadPassenger
    ? inaccessible
    : reporting === undefined || dailySeries === undefined
      ? "loading"
      : reporting.hasData
        ? "operational"
        : "empty"
  const passengerReady = passengerState === "operational"
  const serviceState: ExecutiveSourceState =
    trips === undefined ? "loading" : trips.length > 0 ? "operational" : "empty"
  const networkState: ExecutiveSourceState =
    stations === undefined
      ? "loading"
      : stations.length > 0
        ? "operational"
        : "empty"
  const freightState: ExecutiveSourceState = !loadFreight
    ? inaccessible
    : freight === undefined
      ? "loading"
      : freight.dataState
  const cotrafState: ExecutiveSourceState = !loadCotraf
    ? inaccessible
    : cotraf === undefined
      ? "loading"
      : cotraf.dataState
  const financeState: ExecutiveSourceState = !loadFinance
    ? inaccessible
    : finance === undefined
      ? "loading"
      : finance.dataState
  const continuityState: ExecutiveSourceState = !loadContinuity
    ? inaccessible
    : continuity === undefined
      ? "loading"
      : continuity.provenanceState
  const healthState: ExecutiveSourceState = !loadPassenger
    ? inaccessible
    : health === undefined
      ? "loading"
      : "operational"

  const freightActivity = freight?.kpis.find(
    ({ code }) => code === "operations_actives"
  )
  const freightTonnes = freight?.kpis.find(
    ({ code }) => code === "tonnes_en_mouvement"
  )
  const onlineMovements =
    cotraf?.movements.filter(({ status }) => status === "en_ligne") ?? []
  const delayedMovements = onlineMovements.filter(
    ({ delayMinutes }) => delayMinutes > 0
  )
  const punctuality = cotraf?.kpis.find(({ code }) => code === "ponctualite")
  const freshnessCandidates = [
    health?.checkedAt,
    finance?.generatedAt,
    cotraf?.generatedAt,
  ].filter((value): value is number => typeof value === "number" && value > 0)

  return {
    period: { preset, from: range.from, to: range.to },
    serviceDate,
    freshnessAt:
      freshnessCandidates.length > 0
        ? Math.max(...freshnessCandidates)
        : undefined,
    passenger: {
      state: passengerState,
      revenueNet: passengerReady ? reporting?.revenue.netTtc : undefined,
      revenueVariationPct: passengerReady
        ? reporting?.revenue.variation.pct
        : undefined,
      tickets: passengerReady ? reporting?.volume.tickets : undefined,
      ticketVariationPct: passengerReady
        ? reporting?.volume.variation.pct
        : undefined,
      occupancyPct: passengerReady ? reporting?.occupancy.pct : undefined,
      refundedTtc: passengerReady ? reporting?.revenue.refundedTtc : undefined,
      refundRatePct: passengerReady
        ? reporting?.quality.refundRatePct
        : undefined,
      averageBasketTtc: passengerReady
        ? reporting?.quality.averageBasketTtc
        : undefined,
      salesCount: passengerReady ? reporting?.volume.sales : undefined,
      series: passengerReady
        ? (dailySeries ?? []).map(({ date, netTtc, tickets }) => ({
            date,
            netTtc,
            tickets,
          }))
        : [],
      byProduct: passengerReady ? toSlices(byProduct) : undefined,
      byChannel: passengerReady ? toSlices(byChannel) : undefined,
      byPointOfSale: passengerReady ? toSlices(byPointOfSale) : undefined,
    },
    service: {
      state: serviceState,
      trips: (trips ?? []).map((trip) => ({
        id: trip._id,
        trainNumber: trip.trainNumber,
        trainType: trip.trainType,
        status: trip.status,
        delayMinutes: trip.delayMinutes,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
        originStationId: trip.originStationId,
        destinationStationId: trip.destinationStationId,
      })),
    },
    network: {
      state: networkState,
      stations: (stations ?? []).map((station) => ({
        id: station._id,
        code: station.code,
        name: station.name,
        province: station.province,
        kilometerPoint: station.kilometerPoint,
        isActive: station.isActive,
      })),
    },
    cotraf: {
      state: cotrafState,
      generatedAt: cotraf?.generatedAt,
      datasetLabel: cotraf?.dataset?.label,
      pkConvention: cotraf?.dataset?.pkConvention,
      circulations: cotraf ? onlineMovements.length : undefined,
      delayed: cotraf ? delayedMovements.length : undefined,
      maxDelayMinutes: cotraf
        ? Math.max(
            0,
            ...delayedMovements.map(({ delayMinutes }) => delayMinutes)
          )
        : undefined,
      conflicts: cotraf?.conflicts.length,
      punctualityPct: punctuality?.value,
      dashboard: cotraf,
    },
    freight: {
      state: freightState,
      activity: freightActivity
        ? {
            label: freightActivity.label,
            value: freightActivity.value,
            unit: freightActivity.unit,
          }
        : undefined,
      tonnes: freightTonnes?.value,
      criticalAlerts: freight?.alerts.filter(
        ({ severity, status }) =>
          severity === "critical" && status === "ouverte"
      ).length,
      datasetLabel: freight?.dataset?.label,
      dashboard: freight,
    },
    finance: {
      state: financeState,
      blockers: finance?.readiness.blockers ?? [],
      postedBatches: finance?.journal.postedBatches,
      generatedAt: finance?.generatedAt,
      datasetLabel: finance?.dataset?.label,
      overview: finance,
    },
    continuity: {
      state: continuityState,
      dataState: continuity?.dataState,
      evaluatedPolicyCount: continuity?.evaluatedPolicyCount,
      readyPolicyCount: continuity?.readyPolicyCount,
      notReadyPolicyCount: continuity?.notReadyPolicyCount,
      summary: continuity,
    },
    health: {
      state: healthState,
      severity: health?.severity,
      checkedAt: health?.checkedAt,
      findings:
        health?.findings.map(({ code, label, severity, count }) => ({
          code,
          label,
          severity,
          count,
        })) ?? [],
    },
    modules: accesses.map(({ code, label, route, accessLevel }) => ({
      code,
      label,
      route,
      accessLevel,
    })),
  }
}
