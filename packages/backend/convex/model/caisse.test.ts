import { describe, expect, it } from "vitest"
import {
  attenduParMoyen,
  compteEnCaisse,
  ecartCaisse,
  totalBilletage,
  validerBilletage,
} from "./caisse"

const jour = "jour-1"

describe("Billetage", () => {
  it("additionne coupures et quantités", () => {
    expect(
      totalBilletage([
        { denomination: 10_000, count: 38 },
        { denomination: 500, count: 2 },
        { denomination: 50, count: 1 },
      ])
    ).toBe(381_050)
  })

  it("refuse une coupure inconnue, une quantité fractionnaire ou un doublon", () => {
    expect(() => validerBilletage([{ denomination: 3_000, count: 1 }])).toThrow(/Coupure inconnue/)
    expect(() => validerBilletage([{ denomination: 1_000, count: 1.5 }])).toThrow(/Quantité invalide/)
    expect(() =>
      validerBilletage([
        { denomination: 1_000, count: 1 },
        { denomination: 1_000, count: 2 },
      ])
    ).toThrow(/deux fois/)
  })
})

describe("Attendu par moyen", () => {
  it("écarte les places tenues et déduit les remboursements", () => {
    const attendu = attenduParMoyen([
      { kind: "vente", status: "confirmee", paymentMethod: "especes", accountingDayId: jour, amounts: { ttc: 32_500, received: 32_500 } },
      { kind: "vente", status: "confirmee", paymentMethod: "airtel_money", accountingDayId: jour, amounts: { ttc: 48_000, received: 48_000 } },
      { kind: "vente", status: "en_attente_paiement", amountsNote: "tenue", accountingDayId: undefined, amounts: { ttc: 65_000, received: 0 } } as never,
      { kind: "remboursement", status: "confirmee", paymentMethod: "especes", accountingDayId: jour, amounts: { ttc: -29_250, received: -29_250 } },
      // Vente antérieure au moyen de règlement : comptée en espèces.
      { kind: "vente", status: "confirmee", accountingDayId: jour, amounts: { ttc: 700, received: 700 } },
    ])
    expect(attendu).toEqual([
      { method: "especes", amountXaf: 3_950, count: 3 },
      { method: "airtel_money", amountXaf: 48_000, count: 1 },
    ])
  })

  it("ne compte ni une tenue ni une réservation expirée", () => {
    expect(compteEnCaisse({ kind: "vente", status: "expiree", accountingDayId: jour, amounts: { ttc: 1, received: 0 } })).toBe(false)
    expect(compteEnCaisse({ kind: "vente", status: "annulee", accountingDayId: undefined, amounts: { ttc: 1, received: 0 } })).toBe(false)
    expect(compteEnCaisse({ kind: "vente", status: "annulee", accountingDayId: jour, amounts: { ttc: 1, received: 1 } })).toBe(true)
  })

  it("calcule l'écart tous moyens confondus", () => {
    expect(
      ecartCaisse(
        [
          { amountXaf: 382_750 },
          { amountXaf: 143_000 },
        ],
        [
          { amountXaf: 382_250 },
          { amountXaf: 143_000 },
        ]
      )
    ).toBe(-500)
  })
})
