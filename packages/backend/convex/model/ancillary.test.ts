import { describe, expect, it } from "vitest"
import {
  BAGGAGE_MAX_WEIGHT_KG,
  PARCEL_MAX_UNIT_WEIGHT_KG,
  bulkFractions,
  computeBaggageFare,
  computeParcelFare,
  computeParcelItemFare,
  computeTonnageFare,
  type AncillaryFareRow,
} from "./ancillary"

/**
 * Grille colis partielle, à seule fin de test : les vraies valeurs ne sont
 * pas fournies par le cahier des charges. Zone 4 (300-399 km), paliers de
 * 10 kg.
 */
const GRILLE_COLIS: AncillaryFareRow[] = [
  { product: "colis", zone: 4, weightTier: 1, amountHt: 2500, label: "0-10 kg" },
  { product: "colis", zone: 4, weightTier: 2, amountHt: 4200, label: "11-20 kg" },
  { product: "colis", zone: 4, weightTier: 3, amountHt: 5800, label: "21-30 kg" },
  { product: "colis", zone: 7, weightTier: 1, amountHt: 4000, label: "0-10 kg" },
]

describe("Frais de bagage", () => {
  it("facture les frais d'enregistrement courte distance", () => {
    const r = computeBaggageFare({ distanceKm: 175, weightKg: 12 })
    expect(r.registrationHt).toBe(490)
    expect(r.excessHt).toBe(0)
    expect(r.totalHt).toBe(490)
  })

  it("facture les frais longue distance au-delà de 190 km", () => {
    const r = computeBaggageFare({ distanceKm: 648, weightKg: 12 })
    expect(r.registrationHt).toBe(700)
    expect(r.totalHt).toBe(700)
  })

  it("facture l'excédent au-delà de la franchise", () => {
    const r = computeBaggageFare({
      distanceKm: 648,
      weightKg: 25,
      franchiseKg: 10,
      excessRatePerKgHt: 150,
    })
    expect(r.excessKg).toBe(15)
    expect(r.excessHt).toBe(2250)
    expect(r.totalHt).toBe(2950)
  })

  it("ne facture aucun excédent sous la franchise", () => {
    const r = computeBaggageFare({
      distanceKm: 648,
      weightKg: 8,
      franchiseKg: 10,
      excessRatePerKgHt: 150,
    })
    expect(r.excessKg).toBe(0)
    expect(r.excessHt).toBe(0)
  })

  it("garde les frais d'enregistrement même en dessous de la franchise", () => {
    // Ils rémunèrent la prise en charge, pas le poids.
    const r = computeBaggageFare({
      distanceKm: 100,
      weightKg: 2,
      franchiseKg: 20,
    })
    expect(r.totalHt).toBe(490)
  })

  it("refuse un bagage au-delà de 30 kg, qui relève du colis express", () => {
    expect(() =>
      computeBaggageFare({ distanceKm: 648, weightKg: 31 }),
    ).toThrow(/régime colis express/)
    expect(BAGGAGE_MAX_WEIGHT_KG).toBe(30)
  })

  it("refuse un poids ou des paramètres invalides", () => {
    expect(() => computeBaggageFare({ distanceKm: 100, weightKg: 0 })).toThrow(
      RangeError,
    )
    expect(() =>
      computeBaggageFare({ distanceKm: 100, weightKg: 5, franchiseKg: -1 }),
    ).toThrow(RangeError)
    expect(() =>
      computeBaggageFare({
        distanceKm: 100,
        weightKg: 5,
        excessRatePerKgHt: -10,
      }),
    ).toThrow(RangeError)
  })
})

describe("Colis express", () => {
  it("tarife un article depuis la grille zone × palier", () => {
    const r = computeParcelItemFare({
      distanceKm: 340,
      weightKg: 18,
      grid: GRILLE_COLIS,
    })
    expect(r.zone).toBe(4)
    expect(r.weightTier).toBe(2)
    expect(r.totalHt).toBe(4200)
  })

  it("place correctement les bornes de palier", () => {
    const prix = (kg: number) =>
      computeParcelItemFare({
        distanceKm: 340,
        weightKg: kg,
        grid: GRILLE_COLIS,
      }).totalHt
    expect(prix(10)).toBe(2500)
    expect(prix(11)).toBe(4200)
    expect(prix(20)).toBe(4200)
    expect(prix(21)).toBe(5800)
  })

  it("cumule les articles d'une expédition", () => {
    const r = computeParcelFare(
      [{ weightKg: 18 }, { weightKg: 7 }],
      340,
      GRILLE_COLIS,
    )
    expect(r.totalWeightKg).toBe(25)
    expect(r.totalHt).toBe(6700)
    expect(r.items).toHaveLength(2)
  })

  it("refuse une expédition sans article", () => {
    expect(() => computeParcelFare([], 340, GRILLE_COLIS)).toThrow(
      /sans article/,
    )
  })

  it("refuse un article au-delà du plafond du régime express", () => {
    expect(() =>
      computeParcelItemFare({
        distanceKm: 340,
        weightKg: 101,
        grid: GRILLE_COLIS,
      }),
    ).toThrow(/limité à 100 kg/)
    expect(PARCEL_MAX_UNIT_WEIGHT_KG).toBe(100)
  })

  it("signale explicitement une grille absente plutôt que d'inventer un prix", () => {
    expect(() =>
      computeParcelItemFare({ distanceKm: 340, weightKg: 5, grid: [] }),
    ).toThrow(/n'est pas renseignée/)
    // Le message oriente vers l'origine du manque.
    expect(() =>
      computeParcelItemFare({ distanceKm: 340, weightKg: 5, grid: [] }),
    ).toThrow(/SETRAG/)
  })

  it("signale un palier manquant en listant ceux disponibles", () => {
    expect(() =>
      computeParcelItemFare({
        distanceKm: 340,
        weightKg: 95,
        grid: GRILLE_COLIS,
      }),
    ).toThrow(/paliers disponibles : 1, 2, 3/)
  })

  it("signale une zone absente de la grille", () => {
    expect(() =>
      computeParcelItemFare({
        distanceKm: 50,
        weightKg: 5,
        grid: GRILLE_COLIS,
      }),
    ).toThrow(/zone 1/)
  })
})

describe("Fractions indivisibles de 100 kg", () => {
  it("est nulle jusqu'au seuil de 500 kg", () => {
    expect(bulkFractions(100)).toBe(0)
    expect(bulkFractions(500)).toBe(0)
  })

  it("compte chaque fraction entamée au-delà", () => {
    expect(bulkFractions(501)).toBe(1)
    expect(bulkFractions(600)).toBe(1)
    expect(bulkFractions(601)).toBe(2)
    expect(bulkFractions(800)).toBe(3)
  })

  it("refuse un poids invalide", () => {
    expect(() => bulkFractions(0)).toThrow(RangeError)
  })
})

describe("Transports au tonnage", () => {
  const GRILLE_TAA: AncillaryFareRow[] = [
    { product: "taa", zone: 7, amountHt: 120000, label: "TAA zone 7" },
    { product: "funeraire", zone: 7, amountHt: 95000, label: "Funéraire zone 7" },
  ]

  it("tarife un transport auto accompagné au tonnage", () => {
    const r = computeTonnageFare({
      product: "taa",
      distanceKm: 648,
      tonnage: 1.4,
      grid: GRILLE_TAA,
    })
    expect(r.zone).toBe(7)
    expect(r.ratePerTonneHt).toBe(120000)
    expect(r.totalHt).toBe(168000)
  })

  it("distingue le barème funéraire du barème auto", () => {
    const funeraire = computeTonnageFare({
      product: "funeraire",
      distanceKm: 648,
      tonnage: 1,
      grid: GRILLE_TAA,
    })
    expect(funeraire.totalHt).toBe(95000)
  })

  it("signale un barème absent", () => {
    expect(() =>
      computeTonnageFare({
        product: "taa",
        distanceKm: 340,
        tonnage: 1,
        grid: GRILLE_TAA,
      }),
    ).toThrow(/Barème « taa » absent pour la zone 4/)
  })

  it("refuse un tonnage invalide", () => {
    expect(() =>
      computeTonnageFare({
        product: "taa",
        distanceKm: 648,
        tonnage: 0,
        grid: GRILLE_TAA,
      }),
    ).toThrow(RangeError)
  })
})
