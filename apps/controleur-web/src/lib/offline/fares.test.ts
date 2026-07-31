import { describe, expect, it } from "vitest"
import { computeTicketFare } from "@workspace/backend/fares"

import { availableClasses, distanceBetween, quoteOnboard } from "./fares"
import type { EmbarkedManifest } from "./types"

/**
 * Le prix annoncé à bord doit être celui du guichet. Ces tests comparent le
 * calcul embarqué au calcul de référence du backend : s'ils divergent, un
 * contrôleur encaisserait un montant que la comptabilité refuserait.
 */

const BASES = [
  {
    trainType: "EXPRESS",
    serviceClass: "DEUXIEME",
    shortDistanceRate: 47.51,
    longDistanceRate: 43.42,
  },
  {
    trainType: "EXPRESS",
    serviceClass: "PREMIERE",
    shortDistanceRate: 71.27,
    longDistanceRate: 65.13,
  },
]

function manifest(fare = true): EmbarkedManifest {
  return {
    tripId: "trip_1",
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    serviceDate: "2026-08-14",
    departureAt: Date.now(),
    originName: "Owendo",
    destinationName: "Franceville",
    segmentCount: 3,
    stops: [
      { sequence: 0, stationId: "s0", code: "OWE", name: "Owendo", kilometerPoint: 0 },
      { sequence: 1, stationId: "s1", code: "NTO", name: "Ntoum", kilometerPoint: 30 },
      { sequence: 2, stationId: "s2", code: "NDJ", name: "Ndjolé", kilometerPoint: 187 },
      { sequence: 3, stationId: "s3", code: "BOO", name: "Booué", kilometerPoint: 335 },
      { sequence: 4, stationId: "s4", code: "LAS", name: "Lastoursville", kilometerPoint: 464 },
      { sequence: 5, stationId: "s5", code: "FCV", name: "Franceville", kilometerPoint: 648 },
    ],
    fare: fare
      ? {
          scheduleId: "sch1",
          label: "Barème 2026",
          validFrom: 0,
          validUntil: Date.now() + 86_400_000,
          roundingBasis: "TTC",
          vatPct: 18,
          cssPct: 1,
          bases: BASES,
        }
      : null,
    penalties: [],
    signing: { publicKey: "00", keyVersion: 1, isDemoKey: true },
    ticketCount: 0,
    downloadedCount: 0,
    cursor: null,
    complete: true,
    updatedAt: Date.now(),
  }
}

describe("Tarification à bord", () => {
  it("donne exactement le prix du barème de référence", () => {
    const attendu = computeTicketFare({
      schedule: {
        bases: BASES as never,
        roundingBasis: "TTC",
        taxes: { vatPct: 18, cssPct: 1 },
      },
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 313,
      discount: null,
    })

    // Booué → Franceville, le trajet restant le plus courant à bord.
    const quote = quoteOnboard(manifest(), {
      fromSequence: 3,
      toSequence: 5,
      serviceClass: "DEUXIEME",
    })
    expect(quote.ttc).toBe(attendu.ttc)
    expect(quote.distanceKm).toBe(313)
  })

  it("applique le taux longue distance au-delà du seuil", () => {
    const court = quoteOnboard(manifest(), {
      fromSequence: 0,
      toSequence: 1,
      serviceClass: "DEUXIEME",
    })
    const long = quoteOnboard(manifest(), {
      fromSequence: 0,
      toSequence: 5,
      serviceClass: "DEUXIEME",
    })
    expect(court.ratePerKm).toBe(47.51)
    expect(long.ratePerKm).toBe(43.42)
  })

  it("refuse un trajet à rebours plutôt que d'inventer un prix", () => {
    expect(() =>
      quoteOnboard(manifest(), {
        fromSequence: 5,
        toSequence: 3,
        serviceClass: "DEUXIEME",
      })
    ).toThrow(/en aval/)
  })

  it("refuse de vendre sans barème embarqué", () => {
    expect(() =>
      quoteOnboard(manifest(false), {
        fromSequence: 0,
        toSequence: 1,
        serviceClass: "DEUXIEME",
      })
    ).toThrow(/barème embarqué/)
  })

  it("n'offre que les classes réellement tarifées", () => {
    expect(availableClasses(manifest())).toEqual(["DEUXIEME", "PREMIERE"])
  })

  it("lit la distance sur les points kilométriques embarqués", () => {
    expect(distanceBetween(manifest().stops, 3, 4)).toBe(129)
  })
})
