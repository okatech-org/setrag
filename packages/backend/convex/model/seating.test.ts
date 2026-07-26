import { describe, expect, it } from "vitest"
import {
  MAX_COLUMNS,
  capacityByClass,
  columnLabel,
  generateSeats,
  seatLabel,
  validateCoachPlan,
} from "./seating"

describe("columnLabel — numérotation des colonnes en lettres", () => {
  it("traduit les premières colonnes", () => {
    expect(columnLabel(1)).toBe("A")
    expect(columnLabel(2)).toBe("B")
    expect(columnLabel(4)).toBe("D")
  })

  it("va jusqu'à Z", () => {
    expect(columnLabel(MAX_COLUMNS)).toBe("Z")
  })

  it("refuse une colonne hors bornes", () => {
    expect(() => columnLabel(0)).toThrow(RangeError)
    expect(() => columnLabel(27)).toThrow(RangeError)
    expect(() => columnLabel(1.5)).toThrow(RangeError)
  })
})

describe("seatLabel — libellé affiché au voyageur", () => {
  it("compose le rang et la colonne", () => {
    expect(seatLabel(12, 1)).toBe("12A")
    expect(seatLabel(1, 4)).toBe("1D")
    expect(seatLabel(20, 3)).toBe("20C")
  })

  it("refuse une rangée invalide", () => {
    expect(() => seatLabel(0, 1)).toThrow(RangeError)
    expect(() => seatLabel(-2, 1)).toThrow(RangeError)
  })
})

describe("validateCoachPlan — cohérence avant import", () => {
  it("accepte un plan cohérent", () => {
    expect(() =>
      validateCoachPlan({ rowCount: 20, columnCount: 4, seatCount: 80 }),
    ).not.toThrow()
  })

  it("refuse un plan dont le compte de places ne correspond pas", () => {
    expect(() =>
      validateCoachPlan({ rowCount: 20, columnCount: 4, seatCount: 79 }),
    ).toThrow(/Plan incohérent/)
  })

  it("refuse des dimensions absurdes", () => {
    expect(() =>
      validateCoachPlan({ rowCount: 0, columnCount: 4, seatCount: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      validateCoachPlan({ rowCount: 10, columnCount: 0, seatCount: 0 }),
    ).toThrow(RangeError)
  })

  it("refuse un plan trop large pour une numérotation lisible", () => {
    expect(() =>
      validateCoachPlan({ rowCount: 2, columnCount: 30, seatCount: 60 }),
    ).toThrow(/n'est plus lisible/)
  })
})

describe("generateSeats — génération du plan", () => {
  it("engendre exactement le nombre de places déclaré", () => {
    const seats = generateSeats({
      rowCount: 20,
      columnCount: 4,
      seatCount: 80,
    })
    expect(seats).toHaveLength(80)
  })

  it("numérote rang par rang, colonne par colonne", () => {
    const seats = generateSeats({ rowCount: 3, columnCount: 2, seatCount: 6 })
    expect(seats.map((s) => s.label)).toEqual([
      "1A",
      "1B",
      "2A",
      "2B",
      "3A",
      "3B",
    ])
  })

  it("conserve les coordonnées de chaque place", () => {
    const seats = generateSeats({ rowCount: 2, columnCount: 2, seatCount: 4 })
    expect(seats[3]).toEqual({ label: "2B", row: 2, column: 2 })
  })

  it("ne produit aucun libellé en double", () => {
    const seats = generateSeats({
      rowCount: 25,
      columnCount: 4,
      seatCount: 100,
    })
    expect(new Set(seats.map((s) => s.label)).size).toBe(100)
  })

  it("refuse de générer depuis un plan incohérent", () => {
    expect(() =>
      generateSeats({ rowCount: 5, columnCount: 5, seatCount: 30 }),
    ).toThrow(/Plan incohérent/)
  })
})

describe("capacityByClass — capacité d'une composition", () => {
  it("agrège assises et debout par classe", () => {
    const totaux = capacityByClass([
      { serviceClass: "DEUXIEME", seatCount: 80, standingCapacity: 20 },
      { serviceClass: "DEUXIEME", seatCount: 80, standingCapacity: 20 },
      { serviceClass: "PREMIERE", seatCount: 48, standingCapacity: 0 },
      { serviceClass: "VIP", seatCount: 32, standingCapacity: 0 },
    ])
    expect(totaux.DEUXIEME).toEqual({ seated: 160, standing: 40, total: 200 })
    expect(totaux.PREMIERE).toEqual({ seated: 48, standing: 0, total: 48 })
    expect(totaux.VIP).toEqual({ seated: 32, standing: 0, total: 32 })
  })

  it("retourne un objet vide pour une composition vide", () => {
    expect(capacityByClass([])).toEqual({})
  })

  it("ne crée pas d'entrée pour une classe absente", () => {
    const totaux = capacityByClass([
      { serviceClass: "DEUXIEME", seatCount: 80, standingCapacity: 0 },
    ])
    expect(totaux.VIP).toBeUndefined()
  })
})
