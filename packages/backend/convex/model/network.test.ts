import { describe, expect, it } from "vitest"
import {
  directionOf,
  distanceBetween,
  distanceForRange,
  resolveStopRange,
  segmentCountFor,
  validateStopSequence,
  type Stop,
} from "./network"

/**
 * Extrait réel du Transgabonais, avec les points kilométriques du plan.
 * Owendo 0 · Ntoum 40 · Ndjolé 175 · Booué 340 · Lastourville 530 ·
 * Moanda 610 · Franceville 648.
 */
const DESSERTE_MONTANTE: Stop[] = [
  { stationId: "OWE", sequence: 0, kilometerPoint: 0 },
  { stationId: "NTM", sequence: 1, kilometerPoint: 40 },
  { stationId: "NDJ", sequence: 2, kilometerPoint: 175 },
  { stationId: "BOO", sequence: 3, kilometerPoint: 340 },
  { stationId: "LTV", sequence: 4, kilometerPoint: 530 },
  { stationId: "MOA", sequence: 5, kilometerPoint: 610 },
  { stationId: "FCV", sequence: 6, kilometerPoint: 648 },
]

/** Même ligne dans l'autre sens : les PK décroissent. */
const DESSERTE_DESCENDANTE: Stop[] = [
  { stationId: "FCV", sequence: 0, kilometerPoint: 648 },
  { stationId: "MOA", sequence: 1, kilometerPoint: 610 },
  { stationId: "LTV", sequence: 2, kilometerPoint: 530 },
  { stationId: "BOO", sequence: 3, kilometerPoint: 340 },
  { stationId: "OWE", sequence: 4, kilometerPoint: 0 },
]

describe("distanceBetween — différence de points kilométriques", () => {
  it("calcule la distance Owendo → Franceville", () => {
    expect(distanceBetween(0, 648)).toBe(648)
  })

  it("est symétrique : le barème ne dépend pas du sens", () => {
    expect(distanceBetween(648, 0)).toBe(648)
    expect(distanceBetween(175, 340)).toBe(distanceBetween(340, 175))
  })

  it("calcule les distances intermédiaires du réseau", () => {
    expect(distanceBetween(0, 40)).toBe(40)
    expect(distanceBetween(0, 175)).toBe(175)
    expect(distanceBetween(340, 648)).toBe(308)
  })

  it("retourne zéro pour deux fois la même gare", () => {
    expect(distanceBetween(340, 340)).toBe(0)
  })

  it("refuse un point kilométrique négatif ou non numérique", () => {
    expect(() => distanceBetween(-1, 100)).toThrow(RangeError)
    expect(() => distanceBetween(0, Number.NaN)).toThrow(RangeError)
  })
})

describe("segmentCountFor — un segment de moins que d'arrêts", () => {
  it("compte 22 segments pour les 23 gares du réseau", () => {
    expect(segmentCountFor(23)).toBe(22)
  })

  it("compte un segment pour une desserte à deux arrêts", () => {
    expect(segmentCountFor(2)).toBe(1)
  })

  it("refuse une desserte à moins de deux arrêts", () => {
    expect(() => segmentCountFor(1)).toThrow(RangeError)
    expect(() => segmentCountFor(0)).toThrow(RangeError)
  })
})

describe("resolveStopRange — traduction des gares en indices", () => {
  it("résout un trajet complet", () => {
    expect(resolveStopRange(DESSERTE_MONTANTE, "OWE", "FCV")).toEqual({
      fromIndex: 0,
      toIndex: 6,
    })
  })

  it("résout un trajet intermédiaire", () => {
    expect(resolveStopRange(DESSERTE_MONTANTE, "NDJ", "LTV")).toEqual({
      fromIndex: 2,
      toIndex: 4,
    })
  })

  it("fonctionne aussi sur une desserte descendante", () => {
    expect(resolveStopRange(DESSERTE_DESCENDANTE, "FCV", "BOO")).toEqual({
      fromIndex: 0,
      toIndex: 3,
    })
  })

  it("refuse une gare non desservie", () => {
    expect(() => resolveStopRange(DESSERTE_MONTANTE, "XXX", "FCV")).toThrow(
      /Gare de départ non desservie/,
    )
    expect(() => resolveStopRange(DESSERTE_MONTANTE, "OWE", "XXX")).toThrow(
      /Gare d'arrivée non desservie/,
    )
  })

  it("refuse un sens de circulation incompatible", () => {
    // Sur une desserte montante, on ne vend pas Franceville → Owendo.
    expect(() => resolveStopRange(DESSERTE_MONTANTE, "FCV", "OWE")).toThrow(
      /Sens de circulation incompatible/,
    )
  })

  it("refuse un trajet de gare à elle-même", () => {
    expect(() => resolveStopRange(DESSERTE_MONTANTE, "BOO", "BOO")).toThrow(
      /Sens de circulation incompatible/,
    )
  })

  it("ne dépend pas de l'ordre du tableau fourni", () => {
    const melange = [...DESSERTE_MONTANTE].reverse()
    expect(resolveStopRange(melange, "OWE", "FCV")).toEqual({
      fromIndex: 0,
      toIndex: 6,
    })
  })
})

describe("distanceForRange — distance d'un trajet sur une desserte", () => {
  it("calcule la distance du trajet complet", () => {
    const range = resolveStopRange(DESSERTE_MONTANTE, "OWE", "FCV")
    expect(distanceForRange(DESSERTE_MONTANTE, range)).toBe(648)
  })

  it("calcule la distance d'un trajet intermédiaire", () => {
    const range = resolveStopRange(DESSERTE_MONTANTE, "NDJ", "BOO")
    expect(distanceForRange(DESSERTE_MONTANTE, range)).toBe(165)
  })

  it("donne la même distance dans les deux sens", () => {
    const montant = distanceForRange(
      DESSERTE_MONTANTE,
      resolveStopRange(DESSERTE_MONTANTE, "BOO", "FCV"),
    )
    const descendant = distanceForRange(
      DESSERTE_DESCENDANTE,
      resolveStopRange(DESSERTE_DESCENDANTE, "FCV", "BOO"),
    )
    expect(montant).toBe(descendant)
    expect(montant).toBe(308)
  })

  it("refuse un intervalle hors desserte", () => {
    expect(() =>
      distanceForRange(DESSERTE_MONTANTE, { fromIndex: 0, toIndex: 99 }),
    ).toThrow(RangeError)
  })

  it("la somme des segments égale la distance totale", () => {
    let cumul = 0
    for (let i = 0; i < DESSERTE_MONTANTE.length - 1; i += 1) {
      cumul += distanceForRange(DESSERTE_MONTANTE, {
        fromIndex: i,
        toIndex: i + 1,
      })
    }
    expect(cumul).toBe(648)
  })
})

describe("validateStopSequence — cohérence d'une desserte", () => {
  it("accepte une desserte montante bien formée", () => {
    expect(() => validateStopSequence(DESSERTE_MONTANTE)).not.toThrow()
  })

  it("accepte une desserte descendante bien formée", () => {
    expect(() => validateStopSequence(DESSERTE_DESCENDANTE)).not.toThrow()
  })

  it("refuse une desserte à un seul arrêt", () => {
    expect(() =>
      validateStopSequence([
        { stationId: "OWE", sequence: 0, kilometerPoint: 0 },
      ]),
    ).toThrow(/au moins 2 attendus/)
  })

  it("refuse une numérotation discontinue", () => {
    expect(() =>
      validateStopSequence([
        { stationId: "OWE", sequence: 0, kilometerPoint: 0 },
        { stationId: "NTM", sequence: 2, kilometerPoint: 40 },
      ]),
    ).toThrow(/discontinue/)
  })

  it("refuse une gare desservie deux fois", () => {
    expect(() =>
      validateStopSequence([
        { stationId: "OWE", sequence: 0, kilometerPoint: 0 },
        { stationId: "OWE", sequence: 1, kilometerPoint: 40 },
      ]),
    ).toThrow(/deux fois/)
  })

  it("refuse des points kilométriques non monotones", () => {
    expect(() =>
      validateStopSequence([
        { stationId: "OWE", sequence: 0, kilometerPoint: 0 },
        { stationId: "NDJ", sequence: 1, kilometerPoint: 175 },
        { stationId: "NTM", sequence: 2, kilometerPoint: 40 },
      ]),
    ).toThrow(/non monotones/)
  })

  it("refuse un rebroussement même partiel", () => {
    expect(() =>
      validateStopSequence([
        { stationId: "FCV", sequence: 0, kilometerPoint: 648 },
        { stationId: "MOA", sequence: 1, kilometerPoint: 610 },
        { stationId: "LTV", sequence: 2, kilometerPoint: 700 },
      ]),
    ).toThrow(/non monotones/)
  })
})

describe("directionOf — sens de circulation", () => {
  it("détecte un train montant vers Franceville", () => {
    expect(directionOf(DESSERTE_MONTANTE)).toBe("montant")
  })

  it("détecte un train descendant vers Owendo", () => {
    expect(directionOf(DESSERTE_DESCENDANTE)).toBe("descendant")
  })

  it("refuse une desserte incomplète", () => {
    expect(() =>
      directionOf([{ stationId: "OWE", sequence: 0, kilometerPoint: 0 }]),
    ).toThrow(/au moins 2 arrêts/)
  })
})

describe("Intégration réseau et inventaire", () => {
  it("le nombre de segments correspond aux indices de trajet maximaux", () => {
    const segments = segmentCountFor(DESSERTE_MONTANTE.length)
    const range = resolveStopRange(DESSERTE_MONTANTE, "OWE", "FCV")
    expect(segments).toBe(6)
    expect(range.toIndex).toBe(segments)
  })

  it("deux trajets consécutifs se partagent la frontière sans se chevaucher", () => {
    const premier = resolveStopRange(DESSERTE_MONTANTE, "OWE", "BOO")
    const second = resolveStopRange(DESSERTE_MONTANTE, "BOO", "FCV")
    expect(premier.toIndex).toBe(second.fromIndex)
    // C'est exactement la condition qui permet de revendre la place.
    expect(premier.toIndex <= second.fromIndex).toBe(true)
  })
})
