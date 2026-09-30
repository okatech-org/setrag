import { describe, expect, it } from "vitest"

import {
  memeTelephone,
  normaliserTelephone,
  telephoneDeContactValide,
} from "./telephone"

describe("téléphones gabonais", () => {
  it("rapproche les écritures d'un même numéro", () => {
    expect(normaliserTelephone("077 12 34 56")).toBe("77123456")
    expect(normaliserTelephone("+241 77 12 34 56")).toBe("77123456")
    expect(normaliserTelephone("00 241 77 12 34 56")).toBe("77123456")
    expect(memeTelephone("+241 77 12 34 56", "077123456")).toBe(true)
    expect(memeTelephone("0024177123456", "+24177123456")).toBe(true)
    expect(memeTelephone("+241 077 12 34 56", "077 12 34 56")).toBe(true)
    expect(memeTelephone("+241 07 12 34 56", "07 12 34 56")).toBe(true)
  })

  it("ne retire l'indicatif 241 que derrière + ou 00", () => {
    // Sans préfixe international, 241 fait partie du numéro.
    expect(normaliserTelephone("24177123456")).toBe("24177123456")
    expect(normaliserTelephone("241 23 45 67 89")).toBe("24123456789")
    expect(memeTelephone("24177123456", "077123456")).toBe(false)
    expect(memeTelephone("+24177123456", "077123456")).toBe(true)
    // Un indicatif étranger reste tel quel.
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("33612345678")
  })

  it("distingue deux numéros et refuse l'absence de preuve", () => {
    expect(memeTelephone("077123456", "077123457")).toBe(false)
    expect(memeTelephone(undefined, "077123456")).toBe(false)
    expect(memeTelephone("12", "12")).toBe(false)
  })

  it("exige huit chiffres significatifs pour un contact", () => {
    expect(telephoneDeContactValide("077 12 34 56")).toBe(true)
    expect(telephoneDeContactValide("+241 77 12 34 56")).toBe(true)
    expect(telephoneDeContactValide("+33 6 12 34 56 78")).toBe(true)
    // Ancien format à sept chiffres significatifs, ou numéro tronqué.
    expect(telephoneDeContactValide("+241 07 12 34 56")).toBe(false)
    expect(telephoneDeContactValide("0771234")).toBe(false)
    expect(telephoneDeContactValide("   ")).toBe(false)
  })
})
