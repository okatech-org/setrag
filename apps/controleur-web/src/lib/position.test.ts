import { describe, expect, it } from "vitest"

import type { EmbarkedManifest, EmbarkedStop } from "./offline/types"
import { avancementPropose, gareProposee, progressionA } from "./position"

const H = 60 * 60 * 1000
const DEPART = Date.parse("2026-09-30T07:00:00Z")

function arret(
  sequence: number,
  name: string,
  km: number,
  decalage?: number
): EmbarkedStop {
  return {
    sequence,
    stationId: `s${sequence}`,
    code: name.slice(0, 3).toUpperCase(),
    name,
    kilometerPoint: km,
    departureAt: decalage === undefined ? undefined : DEPART + decalage * H,
    arrivalAt: decalage === undefined ? undefined : DEPART + decalage * H,
  }
}

function manifeste(stops: EmbarkedStop[]): EmbarkedManifest {
  return {
    tripId: "t",
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    serviceDate: "2026-09-30",
    departureAt: DEPART,
    originName: stops[0]!.name,
    destinationName: stops[stops.length - 1]!.name,
    segmentCount: stops.length - 1,
    stops,
    fare: null,
    penalties: [],
    signing: { publicKey: "00", keyVersion: 1, isDemoKey: true },
    ticketCount: 0,
    downloadedCount: 0,
    cursor: null,
    complete: true,
    updatedAt: DEPART,
  }
}

const EXPRESS = manifeste([
  arret(0, "Owendo Virié", 0, 0),
  arret(1, "Lopé", 308, 6.7),
  arret(2, "Booué", 340, 7.7),
  arret(3, "Ivindo", 390, 8.5),
  arret(4, "Franceville", 648, 14),
])

describe("Dernière gare atteinte, d'après l'horaire", () => {
  it("propose la gare d'origine avant le départ", () => {
    expect(gareProposee(EXPRESS, DEPART - H)?.name).toBe("Owendo Virié")
  })

  it("propose la dernière gare dont l'heure de passage est échue", () => {
    expect(gareProposee(EXPRESS, DEPART + 8 * H)?.name).toBe("Booué")
    expect(gareProposee(EXPRESS, DEPART + 20 * H)?.name).toBe("Franceville")
  })

  it("ne propose d'avancer qu'au-delà de la gare confirmée, jamais de reculer", () => {
    expect(avancementPropose(EXPRESS, 0, DEPART + 8 * H)?.name).toBe("Booué")
    expect(avancementPropose(EXPRESS, 2, DEPART + 8 * H)).toBeUndefined()
    expect(avancementPropose(EXPRESS, 3, DEPART + 8 * H)).toBeUndefined()
  })
})

describe("Progression sur la voie", () => {
  it("se lit sur les points kilométriques", () => {
    expect(progressionA(EXPRESS, 0)).toBe(0)
    expect(progressionA(EXPRESS, 2)).toBeCloseTo(340 / 648)
    expect(progressionA(EXPRESS, 4)).toBe(1)
  })

  it("vaut aussi pour un train qui roule vers Owendo, PK décroissants", () => {
    const omnibus = manifeste([
      arret(0, "Franceville", 648),
      arret(1, "Offoué", 325),
      arret(2, "Owendo Virié", 0),
    ])
    expect(progressionA(omnibus, 1)).toBeCloseTo(323 / 648)
  })
})
