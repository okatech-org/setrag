import { describe, expect, it } from "vitest"

import { quoteOnboard } from "./fares"
import { toEmbarkedManifest } from "./manifest"

/**
 * L'en-tête du manifeste évolue avec le serveur. Un terminal à jour doit lire
 * l'en-tête d'un serveur plus ancien, et un manifeste déjà en cache doit
 * rester utilisable : les données de yield sont donc facultatives.
 */

type Entete = Parameters<typeof toEmbarkedManifest>[0]

function entete(avecYield: boolean): Entete {
  const base = {
    trip: {
      _id: "trip_201",
      trainNumber: "TR-201",
      trainType: "EXPRESS",
      serviceDate: "2026-10-01",
      departureAt: Date.parse("2026-10-01T07:00:00Z"),
      arrivalAt: Date.parse("2026-10-01T19:00:00Z"),
      segmentCount: 2,
    },
    stops: [
      {
        sequence: 0,
        stationId: "owe",
        code: "OWE",
        name: "Owendo",
        kilometerPoint: 0,
      },
      {
        sequence: 1,
        stationId: "boo",
        code: "BOO",
        name: "Booué",
        kilometerPoint: 340,
      },
      {
        sequence: 2,
        stationId: "fcv",
        code: "FCV",
        name: "Franceville",
        kilometerPoint: 648,
      },
    ],
    tickets: [],
    ticketCount: 0,
    subscriptions: [],
    fare: {
      scheduleId: "sch",
      label: "Barème",
      validFrom: 0,
      validUntil: Date.parse("2027-01-01T00:00:00Z"),
      roundingBasis: "TTC",
      vatPct: 18,
      cssPct: 0,
      bases: [
        {
          trainType: "EXPRESS",
          serviceClass: "DEUXIEME",
          shortDistanceRate: 47.51,
          longDistanceRate: 43.42,
        },
      ],
    },
    alreadyScanned: [],
    generatedAt: 0,
    penalties: [],
    signing: { publicKey: "00", keyVersion: 1, isDemoKey: true },
  }
  if (!avecYield) return base as unknown as Entete
  return {
    ...base,
    pricing: {
      quotas: [
        {
          serviceClass: "DEUXIEME",
          label: "Bas prix",
          priority: 1,
          seatCount: 2,
          soldCount: 0,
          coefficient: 0.8,
          isActive: true,
        },
      ],
      rules: [],
      bounds: { floorXaf: 2000, capXaf: 150_000 },
      counters: [
        { serviceClass: "DEUXIEME", segmentIndex: 1, capacity: 8, sold: 0 },
      ],
    },
  } as unknown as Entete
}

describe("En-tête embarqué", () => {
  it("emporte les données de yield, datées de la demande", () => {
    const manifeste = toEmbarkedManifest(entete(true), undefined, 1_234)
    expect(manifeste.pricing?.requestedAt).toBe(1_234)
    expect(manifeste.pricing?.quotas[0]?.label).toBe("Bas prix")
    expect(manifeste.pricing?.bounds).toEqual({
      floorXaf: 2000,
      capXaf: 150_000,
    })
  })

  it("lit l'en-tête d'un serveur plus ancien, sans données de yield", () => {
    const manifeste = toEmbarkedManifest(entete(false))
    expect(manifeste.pricing).toBeUndefined()
    // La vente reste possible, au barème seul, et le devis le dit.
    const devis = quoteOnboard(manifeste, {
      fromSequence: 1,
      toSequence: 2,
      serviceClass: "DEUXIEME",
    })
    expect(devis.methode).toBe("bareme")
    expect(devis.ttc).toBe(15_800)
  })
})
