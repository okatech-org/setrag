import { describe, expect, it } from "vitest"

import { estimerKmLineaire, estimerPosition, positionEnMots } from "./position"

const H = 3_600_000
const T0 = Date.UTC(2026, 9, 2, 6, 40)

// Owendo 07:40 → Ndjolé 10:40 (arrêt 10 min) → Booué 13:30.
const ARRETS = [
  { departureAt: T0, kilometerPoint: 0 },
  {
    arrivalAt: T0 + 3 * H,
    departureAt: T0 + 3 * H + 10 * 60_000,
    kilometerPoint: 175,
  },
  { arrivalAt: T0 + 5 * H + 50 * 60_000, kilometerPoint: 340 },
]

describe("estimerPosition", () => {
  it("ne place pas de rame avant le départ", () => {
    const e = estimerPosition(ARRETS, 0, "planifie", T0 - 60_000)
    expect(e.etat).toBe("avant-depart")
    expect(e.rame).toBeUndefined()
    expect(e.passes).toEqual([false, false, false])
  })

  it("place la rame entre deux arrêts, jamais sur une gare", () => {
    const e = estimerPosition(ARRETS, 0, "a_lheure", T0 + 1.5 * H)
    expect(e.etat).toBe("en-route")
    expect(e.rame).toBeCloseTo(0.5, 5)
    expect(e.prochain).toBe(1)
    expect(e.passes).toEqual([true, false, false])
    expect(e.km).toBeCloseTo(87.5, 5)
  })

  it("applique le retard annoncé à tout l'horaire", () => {
    // 07:40 + 30 min de retard : à 08:00, le train n'est pas encore parti.
    expect(estimerPosition(ARRETS, 30, "retarde", T0 + 20 * 60_000).etat).toBe(
      "avant-depart"
    )
    expect(estimerPosition(ARRETS, 30, "retarde", T0 + 40 * 60_000).etat).toBe(
      "en-route"
    )
  })

  it("garde la rame avant la gare pendant l'arrêt", () => {
    const e = estimerPosition(ARRETS, 0, "a_lheure", T0 + 3 * H + 5 * 60_000)
    expect(e.rame).toBeLessThan(1)
    expect(e.rame).toBeGreaterThan(0.9)
    expect(e.passes[1]).toBe(false)
  })

  it("s'arrête au terminus et respecte les statuts", () => {
    expect(estimerPosition(ARRETS, 0, "a_lheure", T0 + 6 * H).etat).toBe(
      "arrive"
    )
    expect(estimerPosition(ARRETS, 0, "termine", T0).passes).toEqual([
      true,
      true,
      true,
    ])
    expect(estimerPosition(ARRETS, 0, "annule", T0 + H).etat).toBe("supprime")
  })
})

describe("estimerKmLineaire", () => {
  it("interpole entre les terminus, dans les deux sens", () => {
    const trajet = {
      departureAt: T0,
      arrivalAt: T0 + 4 * H,
      delayMinutes: 0,
      status: "a_lheure" as const,
    }
    expect(estimerKmLineaire(trajet, 0, 400, T0 + H).km).toBeCloseTo(100)
    expect(estimerKmLineaire(trajet, 400, 0, T0 + H).km).toBeCloseTo(300)
    expect(estimerKmLineaire(trajet, 0, 400, T0 - 1).etat).toBe("avant-depart")
  })
})

describe("positionEnMots", () => {
  const gares = [
    { nom: "Owendo", km: 0 },
    { nom: "Ndjolé", km: 175 },
    { nom: "Booué", km: 340 },
  ]
  it("nomme les gares dans le sens de marche", () => {
    expect(positionEnMots(200, gares, "aller")).toBe("entre Ndjolé et Booué")
    expect(positionEnMots(200, gares, "retour")).toBe("entre Booué et Ndjolé")
    expect(positionEnMots(175.4, gares, "aller")).toBe("à Ndjolé")
  })
})
