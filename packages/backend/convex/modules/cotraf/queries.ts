import type { Doc, Id } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { assertCan } from "../platform/model"
import {
  buildCotrafKpis,
  detectOpposingConflicts,
  emptyCotrafDashboard,
  type CotrafDashboard,
  type CotrafDataOrigin,
} from "./model"
import { COTRAF_DASHBOARD_PERMISSION, COTRAF_RESOURCE } from "./permissions"

async function latestActiveDataset(
  ctx: QueryCtx,
  dataOrigin: CotrafDataOrigin
) {
  return await ctx.db
    .query("cotrafDatasets")
    .withIndex("by_origin_active", (builder) =>
      builder.eq("dataOrigin", dataOrigin).eq("isActive", true)
    )
    .order("desc")
    .first()
}

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const generatedAt = Date.now()
    const access = await assertCan(ctx, {
      moduleCode: "cotraf",
      resource: COTRAF_RESOURCE,
      permission: COTRAF_DASHBOARD_PERMISSION,
      allowScopedLanding: true,
    })
    const [operationalDataset, demoDataset] = await Promise.all([
      latestActiveDataset(ctx, "operational"),
      latestActiveDataset(ctx, "synthetic_demo"),
    ])
    const dataset = operationalDataset ?? demoDataset
    if (!dataset) {
      return emptyCotrafDashboard(access.accessibleSiteIds, generatedAt)
    }

    const [allMovements, allSegments, allEvents] = await Promise.all([
      ctx.db
        .query("cotrafMovements")
        .withIndex("by_dataset_status", (builder) =>
          builder.eq("datasetId", dataset._id)
        )
        .collect(),
      ctx.db
        .query("cotrafSegments")
        .withIndex("by_dataset_status", (builder) =>
          builder.eq("datasetId", dataset._id)
        )
        .collect(),
      ctx.db
        .query("cotrafEvents")
        .withIndex("by_dataset_occurred", (builder) =>
          builder.eq("datasetId", dataset._id)
        )
        .collect(),
    ])

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
    const visibleAtAccessibleSite = (siteCodes: readonly string[]) =>
      accessibleSiteCodes === null ||
      siteCodes.some((siteCode) => accessibleSiteCodes.has(siteCode))

    const movementDocs = allMovements.filter(
      (movement) =>
        movement.dataOrigin === dataset.dataOrigin &&
        visibleAtAccessibleSite(movement.siteCodes)
    )
    const movementIds = new Set(movementDocs.map((movement) => movement._id))
    const segmentDocs = allSegments.filter(
      (segment) =>
        segment.dataOrigin === dataset.dataOrigin &&
        visibleAtAccessibleSite(segment.siteCodes) &&
        (!segment.movementId || movementIds.has(segment.movementId))
    )
    const eventDocs = allEvents.filter(
      (event) =>
        event.dataOrigin === dataset.dataOrigin &&
        visibleAtAccessibleSite(event.siteCodes)
    )

    const stationIds = new Set<Id<"stations">>()
    for (const movement of movementDocs) {
      stationIds.add(movement.originStationId)
      stationIds.add(movement.destinationStationId)
      for (const point of movement.trajectory) stationIds.add(point.stationId)
    }
    for (const segment of segmentDocs) {
      stationIds.add(segment.fromStationId)
      stationIds.add(segment.toStationId)
    }

    const stationEntries = await Promise.all(
      [...stationIds].map(async (stationId) => {
        const station = await ctx.db.get(stationId)
        if (!station) {
          throw new Error(
            `Projection COTRAF invalide : gare introuvable (${stationId}).`
          )
        }
        return [stationId, station] as const
      })
    )
    const stationById = new Map<Id<"stations">, Doc<"stations">>(stationEntries)
    const requireStation = (stationId: Id<"stations">) => {
      const station = stationById.get(stationId)
      if (!station) {
        throw new Error(
          `Projection COTRAF invalide : gare non chargée (${stationId}).`
        )
      }
      return station
    }

    const movements = movementDocs
      .map((movement) => {
        const origin = requireStation(movement.originStationId)
        const destination = requireStation(movement.destinationStationId)
        return {
          id: movement._id,
          movementCode: movement.movementCode,
          trainNumber: movement.trainNumber,
          serviceType: movement.serviceType,
          direction: movement.direction,
          status: movement.status,
          originLabel: origin.name,
          destinationLabel: destination.name,
          currentPk: movement.currentPk,
          delayMinutes: movement.delayMinutes,
          priority: movement.priority,
          lastEventAt: movement.lastEventAt,
          trajectory: movement.trajectory.map((point) => {
            const station = requireStation(point.stationId)
            return {
              stationCode: station.code,
              stationName: station.name,
              kilometerPoint: station.kilometerPoint,
              plannedAt: point.plannedAt,
              forecastAt: point.forecastAt,
            }
          }),
        }
      })
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.lastEventAt - right.lastEventAt ||
          left.movementCode.localeCompare(right.movementCode)
      )

    const movementCodeById = new Map(
      movementDocs.map((movement) => [movement._id, movement.movementCode])
    )
    const segments = segmentDocs
      .map((segment) => {
        const fromStation = requireStation(segment.fromStationId)
        const toStation = requireStation(segment.toStationId)
        return {
          id: segment._id,
          segmentCode: segment.segmentCode,
          fromStationCode: fromStation.code,
          fromStationName: fromStation.name,
          fromKm: fromStation.kilometerPoint,
          toStationCode: toStation.code,
          toStationName: toStation.name,
          toKm: toStation.kilometerPoint,
          status: segment.status,
          movementCode: segment.movementId
            ? movementCodeById.get(segment.movementId)
            : undefined,
          enteredAt: segment.enteredAt,
          expectedReleaseAt: segment.expectedReleaseAt,
          speedLimitKph: segment.speedLimitKph,
          note: segment.note,
        }
      })
      .sort(
        (left, right) =>
          left.fromKm - right.fromKm ||
          left.segmentCode.localeCompare(right.segmentCode)
      )

    const events = eventDocs
      .map((event) => ({
        id: event._id,
        eventCode: event.eventCode,
        category: event.category,
        severity: event.severity,
        title: event.title,
        message: event.message,
        siteLabel: event.siteLabel,
        status: event.status,
        occurredAt: event.occurredAt,
        dueAt: event.dueAt,
        primaryTrainNumber: event.primaryTrainNumber,
        secondaryTrainNumber: event.secondaryTrainNumber,
        estimatedGainMinutes: event.estimatedGainMinutes,
      }))
      .sort((left, right) => right.occurredAt - left.occurredAt)

    const conflicts = detectOpposingConflicts(movements)
    const stations = [...stationById.values()]
      .map((station) => ({
        code: station.code,
        name: station.name,
        kilometerPoint: station.kilometerPoint,
      }))
      .sort(
        (left, right) =>
          left.kilometerPoint - right.kilometerPoint ||
          left.code.localeCompare(right.code)
      )

    return {
      moduleCode: "cotraf",
      dataState: dataset.dataOrigin,
      accessibleSiteIds: access.accessibleSiteIds,
      generatedAt,
      dataset: {
        key: dataset.datasetKey,
        label: dataset.label,
        notice: dataset.notice,
        dataOrigin: dataset.dataOrigin,
        referenceAt: dataset.referenceAt,
        pkConvention: dataset.pkConvention,
        referenceSources: dataset.referenceSources,
      },
      kpis: buildCotrafKpis(movements, segments, conflicts),
      stations,
      movements,
      segments,
      events,
      conflicts,
    } satisfies CotrafDashboard
  },
})
