import { describe, expect, it } from "vitest"

import { lireTelephone } from "./telephone"

const numero = (saisie: string, options?: { gabonais?: boolean }) => {
  const lecture = lireTelephone(saisie, options)
  return lecture.ok ? lecture.numero : lecture.raison
}

describe("lecture d'un numéro de téléphone", () => {
  it("ramène toutes les écritures d'un numéro gabonais à la même forme", () => {
    // La forme compte : sans compte, le serveur compare le contact au caractère près.
    for (const saisie of [
      "077 12 34 56",
      "077123456",
      "+241 77 12 34 56",
      "+241 077 12 34 56",
      "00241 77 12 34 56",
      "241 77 12 34 56",
      "77 12 34 56",
      "077-12-34-56",
    ]) {
      expect(numero(saisie), saisie).toBe("+24177123456")
    }
  })

  it("refuse l'ancienne numérotation à 8 chiffres et dit ce qui manque", () => {
    expect(numero("07 12 34 56")).toBe("incomplet")
    expect(numero("0771234567")).toBe("trop-long")
    expect(numero("")).toBe("vide")
    expect(numero("07 12 ab 56")).toBe("invalide")
  })

  it("accepte un numéro étranger, sauf pour un compte Mobile Money", () => {
    expect(numero("+33 6 12 34 56 78")).toBe("+33612345678")
    expect(numero("+33 6 12 34 56 78", { gabonais: true })).toBe("etranger")
    expect(numero("066 00 00 01", { gabonais: true })).toBe("+24166000001")
  })
})
