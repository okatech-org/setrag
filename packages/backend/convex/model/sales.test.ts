import { describe, expect, it } from "vitest"
import {
  NUMBER_PREFIXES,
  buildAmounts,
  changeDue,
  formatNumber,
  isFullyPaid,
  outstanding,
  refundAmount,
  sequenceKey,
  splitTaxes,
  sumAmounts,
  type Amounts,
} from "./sales"

describe("Numérotation des opérations", () => {
  it("compose une clé de séquence par point de vente, jour et nature", () => {
    expect(sequenceKey("OWE-PV", "2026-08-14", "billet")).toBe(
      "OWE-PV:2026-08-14:billet",
    )
  })

  it("isole les compteurs entre guichets et entre jours", () => {
    const cles = new Set([
      sequenceKey("OWE-PV", "2026-08-14", "billet"),
      sequenceKey("FCV-PV", "2026-08-14", "billet"),
      sequenceKey("OWE-PV", "2026-08-15", "billet"),
      sequenceKey("OWE-PV", "2026-08-14", "vente"),
    ])
    // Quatre compteurs distincts : c'est ce qui limite la contention.
    expect(cles.size).toBe(4)
  })

  it("refuse une clé sans point de vente", () => {
    expect(() => sequenceKey("", "2026-08-14", "vente")).toThrow(
      /Code de point de vente obligatoire/,
    )
  })

  it("formate un numéro lisible et trié", () => {
    expect(formatNumber("billet", "OWE-PV", "2026-08-14", 42)).toBe(
      "B-OWE-PV-20260814-000042",
    )
    expect(formatNumber("vente", "FCV-PV", "2026-12-31", 1)).toBe(
      "V-FCV-PV-20261231-000001",
    )
  })

  it("préfixe chaque nature d'opération distinctement", () => {
    const prefixes = Object.values(NUMBER_PREFIXES)
    expect(new Set(prefixes).size).toBe(prefixes.length)
    expect(NUMBER_PREFIXES.billet).toBe("B")
    expect(NUMBER_PREFIXES.bagage).toBe("G")
    expect(NUMBER_PREFIXES.colis).toBe("C")
  })

  it("garantit un tri alphabétique cohérent avec l'ordre d'émission", () => {
    const numeros = [1, 2, 10, 100, 999999].map((n) =>
      formatNumber("billet", "OWE-PV", "2026-08-14", n),
    )
    expect([...numeros].sort()).toEqual(numeros)
  })

  it("refuse un numéro de séquence invalide", () => {
    expect(() => formatNumber("vente", "OWE-PV", "2026-08-14", 0)).toThrow(
      RangeError,
    )
    expect(() => formatNumber("vente", "OWE-PV", "2026-08-14", -1)).toThrow(
      RangeError,
    )
    expect(() => formatNumber("vente", "OWE-PV", "2026-08-14", 1.5)).toThrow(
      RangeError,
    )
  })
})

describe("Ventilation fiscale", () => {
  it("ventile un TTC en HT, TVA et CSS", () => {
    const a = splitTaxes(28100, 18, 0)
    expect(a.ttc).toBe(28100)
    expect(a.css).toBe(0)
    expect(a.ht + a.vat + a.css).toBeCloseTo(28100, 2)
    expect(a.ht).toBeCloseTo(23813.56, 2)
  })

  it("garantit l'identité comptable sur une large plage de montants", () => {
    for (let ttc = 100; ttc <= 200000; ttc += 1373) {
      const a = splitTaxes(ttc, 18, 1)
      expect(a.ht + a.vat + a.css).toBeCloseTo(a.ttc, 2)
    }
  })

  it("gère l'absence de taxe", () => {
    const a = splitTaxes(28100, 0, 0)
    expect(a.ht).toBe(28100)
    expect(a.vat).toBe(0)
    expect(a.css).toBe(0)
  })

  it("ajoute la CSS en plus de la TVA", () => {
    const sansCss = splitTaxes(28100, 18, 0)
    const avecCss = splitTaxes(28100, 18, 1)
    expect(avecCss.css).toBeGreaterThan(0)
    expect(avecCss.ht).toBeLessThan(sansCss.ht)
  })

  it("traite le montant nul", () => {
    expect(splitTaxes(0, 18, 0)).toEqual({ ht: 0, vat: 0, css: 0, ttc: 0 })
  })

  it("refuse un montant ou un taux aberrant", () => {
    expect(() => splitTaxes(-1, 18, 0)).toThrow(RangeError)
    expect(() => splitTaxes(100, 150, 0)).toThrow(/Taux de TVA invalide/)
    expect(() => splitTaxes(100, 18, -5)).toThrow(/Taux de CSS invalide/)
  })
})

describe("Montants d'une vente", () => {
  it("construit les montants avec le perçu", () => {
    const a = buildAmounts(28100, 18, 0, 28100)
    expect(a.received).toBe(28100)
    expect(isFullyPaid(a)).toBe(true)
    expect(outstanding(a)).toBe(0)
  })

  it("gère un paiement partiel", () => {
    const a = buildAmounts(28100, 18, 0, 20000)
    expect(outstanding(a)).toBe(8100)
    expect(isFullyPaid(a)).toBe(false)
  })

  it("ne produit jamais un reste négatif sur un trop-perçu", () => {
    const a = buildAmounts(28100, 18, 0, 30000)
    expect(outstanding(a)).toBe(0)
    expect(isFullyPaid(a)).toBe(true)
  })

  it("refuse un montant perçu invalide", () => {
    expect(() => buildAmounts(100, 18, 0, -1)).toThrow(RangeError)
  })

  it("additionne les ventilations d'une vente à plusieurs titres", () => {
    const billets: Amounts[] = [
      buildAmounts(28100, 18, 0, 28100),
      buildAmounts(14100, 18, 0, 14100),
      buildAmounts(28100, 18, 0, 28100),
    ]
    const total = sumAmounts(billets)
    expect(total.ttc).toBe(70300)
    expect(total.received).toBe(70300)
    expect(total.ht + total.vat + total.css).toBeCloseTo(total.ttc, 2)
  })

  it("retourne une ventilation nulle pour une liste vide", () => {
    expect(sumAmounts([])).toEqual({
      ht: 0,
      vat: 0,
      css: 0,
      ttc: 0,
      received: 0,
    })
  })
})

describe("Rendu de monnaie", () => {
  it("calcule la monnaie à rendre", () => {
    expect(changeDue(28100, 30000)).toBe(1900)
    expect(changeDue(28100, 28100)).toBe(0)
  })

  it("refuse un règlement insuffisant", () => {
    expect(() => changeDue(28100, 20000)).toThrow(/Règlement insuffisant/)
  })

  it("refuse un montant remis invalide", () => {
    expect(() => changeDue(100, -5)).toThrow(RangeError)
    expect(() => changeDue(100, Number.NaN)).toThrow(RangeError)
  })
})

describe("Remboursement et pénalité", () => {
  it("rembourse intégralement sans pénalité", () => {
    expect(refundAmount(28100, 0)).toBe(28100)
  })

  it("applique le taux de pénalité paramétré", () => {
    expect(refundAmount(28100, 10)).toBe(25290)
    expect(refundAmount(28100, 50)).toBe(14050)
  })

  it("ne rembourse rien à 100 % de pénalité", () => {
    expect(refundAmount(28100, 100)).toBe(0)
  })

  it("refuse un taux de pénalité hors bornes", () => {
    expect(() => refundAmount(28100, -1)).toThrow(RangeError)
    expect(() => refundAmount(28100, 101)).toThrow(RangeError)
  })

  it("refuse un montant payé invalide", () => {
    expect(() => refundAmount(-1, 10)).toThrow(RangeError)
  })

  it("le remboursement ne dépasse jamais le montant payé", () => {
    for (let taux = 0; taux <= 100; taux += 5) {
      expect(refundAmount(28100, taux)).toBeLessThanOrEqual(28100)
      expect(refundAmount(28100, taux)).toBeGreaterThanOrEqual(0)
    }
  })
})
