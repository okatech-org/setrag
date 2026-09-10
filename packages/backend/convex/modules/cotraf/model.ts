import type { Id } from "../../_generated/dataModel"

export const COTRAF_DEMO_DATASET_KEY = "setrag-cotraf-synthetic-2026-09-10-v1"

export type CotrafDataOrigin = "synthetic_demo" | "operational"
export type CotrafServiceType =
  "voyageurs" | "minerai" | "bois" | "hydrocarbures" | "service"
export type CotrafDirection = "croissant" | "decroissant"
export type CotrafMovementStatus = "planifie" | "en_ligne" | "retenu" | "arrive"
export type CotrafSegmentStatus = "libre" | "reserve" | "occupe" | "bloque"
export type CotrafTone = "neutral" | "positive" | "warning" | "critical"

export interface CotrafDashboardDataset {
  readonly key: string
  readonly label: string
  readonly notice: string
  readonly dataOrigin: CotrafDataOrigin
  readonly referenceAt: number
  readonly pkConvention: string
  readonly referenceSources: readonly {
    readonly label: string
    readonly url: string
  }[]
}

export interface CotrafDashboardKpi {
  readonly code: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly tone: CotrafTone
  readonly description: string
}

export interface CotrafDashboardStation {
  readonly code: string
  readonly name: string
  readonly kilometerPoint: number
}

export interface CotrafTrajectoryPoint {
  readonly stationCode: string
  readonly stationName: string
  readonly kilometerPoint: number
  readonly plannedAt: number
  readonly forecastAt?: number
}

export interface CotrafDashboardMovement {
  readonly id: string
  readonly movementCode: string
  readonly trainNumber: string
  readonly serviceType: CotrafServiceType
  readonly direction: CotrafDirection
  readonly status: CotrafMovementStatus
  readonly originLabel: string
  readonly destinationLabel: string
  readonly currentPk?: number
  readonly delayMinutes: number
  readonly priority: number
  readonly lastEventAt: number
  readonly trajectory: readonly CotrafTrajectoryPoint[]
}

export interface CotrafDashboardSegment {
  readonly id: string
  readonly segmentCode: string
  readonly fromStationCode: string
  readonly fromStationName: string
  readonly fromKm: number
  readonly toStationCode: string
  readonly toStationName: string
  readonly toKm: number
  readonly status: CotrafSegmentStatus
  readonly movementCode?: string
  readonly enteredAt?: number
  readonly expectedReleaseAt?: number
  readonly speedLimitKph?: number
  readonly note: string
}

export interface CotrafDashboardEvent {
  readonly id: string
  readonly eventCode: string
  readonly category: "croisement" | "alerte" | "otr" | "journal"
  readonly severity: "information" | "warning" | "critical"
  readonly title: string
  readonly message: string
  readonly siteLabel: string
  readonly status: "planifie" | "confirme" | "ouverte" | "resolue"
  readonly occurredAt: number
  readonly dueAt?: number
  readonly primaryTrainNumber?: string
  readonly secondaryTrainNumber?: string
  readonly estimatedGainMinutes?: number
}

export interface CotrafConflict {
  readonly key: string
  readonly fromStationCode: string
  readonly fromStationName: string
  readonly toStationCode: string
  readonly toStationName: string
  readonly trainNumbers: readonly [string, string]
  readonly startsAt: number
  readonly endsAt: number
  readonly severity: "warning" | "critical"
}

export interface CotrafDashboard {
  readonly moduleCode: "cotraf"
  readonly dataState: "empty" | "synthetic_demo" | "operational"
  readonly accessibleSiteIds: readonly Id<"sites">[]
  readonly generatedAt: number
  readonly dataset: CotrafDashboardDataset | null
  readonly kpis: readonly CotrafDashboardKpi[]
  readonly stations: readonly CotrafDashboardStation[]
  readonly movements: readonly CotrafDashboardMovement[]
  readonly segments: readonly CotrafDashboardSegment[]
  readonly events: readonly CotrafDashboardEvent[]
  readonly conflicts: readonly CotrafConflict[]
}

export function emptyCotrafDashboard(
  accessibleSiteIds: readonly Id<"sites">[],
  generatedAt = Date.now()
): CotrafDashboard {
  return {
    moduleCode: "cotraf",
    dataState: "empty",
    accessibleSiteIds,
    generatedAt,
    dataset: null,
    kpis: [],
    stations: [],
    movements: [],
    segments: [],
    events: [],
    conflicts: [],
  }
}

type ConflictMovement = Pick<
  CotrafDashboardMovement,
  "movementCode" | "trainNumber" | "direction" | "status" | "trajectory"
>

interface MovementLeg {
  readonly movement: ConflictMovement
  readonly segmentKey: string
  readonly from: CotrafTrajectoryPoint
  readonly to: CotrafTrajectoryPoint
  readonly startsAt: number
  readonly endsAt: number
}

function effectiveAt(point: CotrafTrajectoryPoint): number {
  return point.forecastAt ?? point.plannedAt
}

function stationOrder(
  left: CotrafTrajectoryPoint,
  right: CotrafTrajectoryPoint
): readonly [CotrafTrajectoryPoint, CotrafTrajectoryPoint] {
  if (
    left.kilometerPoint < right.kilometerPoint ||
    (left.kilometerPoint === right.kilometerPoint &&
      left.stationCode < right.stationCode)
  ) {
    return [left, right]
  }
  return [right, left]
}

function movementLegs(movement: ConflictMovement): MovementLeg[] {
  const legs: MovementLeg[] = []
  for (let index = 0; index < movement.trajectory.length - 1; index += 1) {
    const first = movement.trajectory[index]
    const second = movement.trajectory[index + 1]
    if (!first || !second || first.stationCode === second.stationCode) continue

    const firstAt = effectiveAt(first)
    const secondAt = effectiveAt(second)
    const startsAt = Math.min(firstAt, secondAt)
    const endsAt = Math.max(firstAt, secondAt)
    if (startsAt === endsAt) continue

    const [from, to] = stationOrder(first, second)
    legs.push({
      movement,
      segmentKey: `${from.stationCode}:${to.stationCode}`,
      from,
      to,
      startsAt,
      endsAt,
    })
  }
  return legs
}

/**
 * Détecte les occupations opposées qui se recouvrent sur la même section.
 *
 * Les prévisions remplacent ponctuellement le planifié. L'intervalle est
 * semi-ouvert : une circulation qui libère une section exactement lorsque la
 * suivante y entre ne produit pas de collision jointive.
 */
export function detectOpposingConflicts(
  movements: readonly ConflictMovement[]
): CotrafConflict[] {
  const conflicts: CotrafConflict[] = []

  for (let leftIndex = 0; leftIndex < movements.length; leftIndex += 1) {
    const left = movements[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < movements.length;
      rightIndex += 1
    ) {
      const right = movements[rightIndex]
      if (
        !right ||
        left.movementCode === right.movementCode ||
        left.direction === right.direction
      ) {
        continue
      }

      const [firstMovement, secondMovement] =
        left.movementCode < right.movementCode
          ? ([left, right] as const)
          : ([right, left] as const)
      const leftLegs = movementLegs(left)
      const rightLegs = movementLegs(right)

      for (const leftLeg of leftLegs) {
        for (const rightLeg of rightLegs) {
          if (leftLeg.segmentKey !== rightLeg.segmentKey) continue
          const startsAt = Math.max(leftLeg.startsAt, rightLeg.startsAt)
          const endsAt = Math.min(leftLeg.endsAt, rightLeg.endsAt)
          if (startsAt >= endsAt) continue

          conflicts.push({
            key: `${leftLeg.segmentKey}:${firstMovement.movementCode}:${secondMovement.movementCode}`,
            fromStationCode: leftLeg.from.stationCode,
            fromStationName: leftLeg.from.stationName,
            toStationCode: leftLeg.to.stationCode,
            toStationName: leftLeg.to.stationName,
            trainNumbers: [
              firstMovement.trainNumber,
              secondMovement.trainNumber,
            ],
            startsAt,
            endsAt,
            severity:
              left.status === "en_ligne" && right.status === "en_ligne"
                ? "critical"
                : "warning",
          })
        }
      }
    }
  }

  return conflicts.sort(
    (left, right) =>
      left.startsAt - right.startsAt || left.key.localeCompare(right.key)
  )
}

export function buildCotrafKpis(
  movements: readonly CotrafDashboardMovement[],
  segments: readonly CotrafDashboardSegment[],
  conflicts: readonly CotrafConflict[]
): CotrafDashboardKpi[] {
  const activeMovements = movements.filter(
    (movement) => movement.status !== "arrive"
  )
  const punctuality =
    movements.length === 0
      ? 0
      : Math.round(
          (movements.filter((movement) => movement.delayMinutes <= 5).length /
            movements.length) *
            100
        )
  const constrainedSegments = segments.filter(
    (segment) => segment.status !== "libre"
  )

  return [
    {
      code: "circulations_actives",
      label: "Circulations actives",
      value: activeMovements.length,
      unit: "trains",
      tone: "neutral",
      description: "Circulations planifiées, en ligne ou retenues.",
    },
    {
      code: "ponctualite",
      label: "Ponctualité à 5 minutes",
      value: punctuality,
      unit: "%",
      tone:
        punctuality >= 90
          ? "positive"
          : punctuality >= 75
            ? "neutral"
            : "warning",
      description:
        "Part des circulations dont le retard synthétique ne dépasse pas cinq minutes.",
    },
    {
      code: "segments_contraints",
      label: "Segments contraints",
      value: constrainedSegments.length,
      unit: "segments",
      tone: segments.some((segment) => segment.status === "bloque")
        ? "critical"
        : constrainedSegments.length > 0
          ? "warning"
          : "positive",
      description: "Sections réservées, occupées ou bloquées.",
    },
    {
      code: "conflits_detectes",
      label: "Conflits de circulation",
      value: conflicts.length,
      unit: "conflits",
      tone: conflicts.some((conflict) => conflict.severity === "critical")
        ? "critical"
        : conflicts.length > 0
          ? "warning"
          : "positive",
      description:
        "Chevauchements opposés calculés sur une même section à voie unique.",
    },
  ]
}
