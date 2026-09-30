import { describe, expect, it } from "vitest"

import {
  detectOpposingConflicts,
  type CotrafDashboardMovement,
  type CotrafTrajectoryPoint,
} from "./model"

const minute = 60_000

function point(
  stationCode: string,
  kilometerPoint: number,
  plannedAt: number,
  forecastAt?: number
): CotrafTrajectoryPoint {
  return {
    stationCode,
    stationName: `Gare ${stationCode}`,
    kilometerPoint,
    plannedAt,
    ...(forecastAt === undefined ? {} : { forecastAt }),
  }
}

function movement(
  movementCode: string,
  trainNumber: string,
  direction: "croissant" | "decroissant",
  trajectory: readonly CotrafTrajectoryPoint[],
  status: "planifie" | "en_ligne" = "planifie"
): CotrafDashboardMovement {
  return {
    id: movementCode,
    movementCode,
    trainNumber,
    serviceType: "service",
    direction,
    status,
    originLabel: trajectory[0]?.stationName ?? "Origine",
    destinationLabel:
      trajectory[trajectory.length - 1]?.stationName ?? "Destination",
    delayMinutes: 0,
    priority: 1,
    lastEventAt: 0,
    trajectory,
  }
}

describe("Détection pure des conflits COTRAF", () => {
  it("détecte un chevauchement opposé sur le même segment", () => {
    const conflicts = detectOpposingConflicts([
      movement(
        "M-A",
        "T-A",
        "croissant",
        [point("AAA", 0, 0), point("BBB", 100, 60 * minute)],
        "en_ligne"
      ),
      movement(
        "M-B",
        "T-B",
        "decroissant",
        [point("BBB", 100, 30 * minute), point("AAA", 0, 90 * minute)],
        "en_ligne"
      ),
    ])

    expect(conflicts).toEqual([
      {
        key: "AAA:BBB:M-A:M-B",
        fromStationCode: "AAA",
        fromStationName: "Gare AAA",
        toStationCode: "BBB",
        toStationName: "Gare BBB",
        trainNumbers: ["T-A", "T-B"],
        startsAt: 30 * minute,
        endsAt: 60 * minute,
        severity: "critical",
      },
    ])
  })

  it("utilise forecastAt avant plannedAt", () => {
    const conflicts = detectOpposingConflicts([
      movement("M-A", "T-A", "croissant", [
        point("AAA", 0, 0, 30 * minute),
        point("BBB", 100, 20 * minute, 80 * minute),
      ]),
      movement("M-B", "T-B", "decroissant", [
        point("BBB", 100, 40 * minute),
        point("AAA", 0, 70 * minute),
      ]),
    ])

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      startsAt: 40 * minute,
      endsAt: 70 * minute,
      severity: "warning",
    })
  })

  it("ignore les collisions jointives, les mêmes directions et les autres segments", () => {
    const reference = movement("M-A", "T-A", "croissant", [
      point("AAA", 0, 0),
      point("BBB", 100, 60 * minute),
    ])

    expect(
      detectOpposingConflicts([
        reference,
        movement("M-JOINT", "T-J", "decroissant", [
          point("BBB", 100, 60 * minute),
          point("AAA", 0, 90 * minute),
        ]),
        movement("M-SAME", "T-S", "croissant", [
          point("BBB", 100, 20 * minute),
          point("AAA", 0, 50 * minute),
        ]),
        movement("M-OTHER", "T-O", "decroissant", [
          point("CCC", 200, 20 * minute),
          point("DDD", 300, 50 * minute),
        ]),
      ])
    ).toEqual([])
  })

  it("n'oppose jamais deux projections du même mouvement", () => {
    expect(
      detectOpposingConflicts([
        movement("M-UNIQUE", "T-1", "croissant", [
          point("AAA", 0, 0),
          point("BBB", 100, 60 * minute),
        ]),
        movement("M-UNIQUE", "T-1", "decroissant", [
          point("BBB", 100, 20 * minute),
          point("AAA", 0, 50 * minute),
        ]),
      ])
    ).toEqual([])
  })
})
