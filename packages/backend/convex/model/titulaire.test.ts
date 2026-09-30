import { describe, expect, it } from "vitest"
import {
  civiliteAEnregistrer,
  civiliteDuTitulaire,
  cleDeNom,
  manquesDuTitulaire,
  memePersonne,
} from "./titulaire"

describe("titulaire du compte", () => {
  it("compare les noms sans accents, casse ni ponctuation", () => {
    expect(cleDeNom({ firstName: "Élise", lastName: "N'DONG-MBA" })).toBe(
      "elise|n dong mba"
    )
    expect(
      memePersonne(
        { firstName: "Berny", lastName: "ITOUTOU" },
        { firstName: " berny ", lastName: "Itoutou" }
      )
    ).toBe(true)
    expect(
      memePersonne({ firstName: "Berny" }, { firstName: "Berny", lastName: "" })
    ).toBe(false)
  })

  it("prend la civilité du profil, sinon celle de sa propre fiche", () => {
    const fiches = [
      { firstName: "Alice", lastName: "Mba", gender: "F" as const },
      { firstName: "Berny", lastName: "Itoutou", gender: "M" as const },
    ]
    expect(
      civiliteDuTitulaire(
        { firstName: "Berny", lastName: "ITOUTOU", gender: "F" },
        fiches
      )
    ).toBe("F")
    expect(
      civiliteDuTitulaire({ firstName: "Berny", lastName: "ITOUTOU" }, fiches)
    ).toBe("M")
    expect(
      civiliteDuTitulaire({ firstName: "Paul", lastName: "Obame" }, fiches)
    ).toBeNull()
  })

  it("dit ce qui manque pour figurer sur un billet", () => {
    expect(
      manquesDuTitulaire({ firstName: "Berny", lastName: "Itoutou" }, "M")
    ).toEqual([])
    expect(manquesDuTitulaire({ firstName: "Berny" }, null)).toEqual([
      "lastName",
      "gender",
    ])
  })

  it("complète une civilité absente, jamais une civilité connue", () => {
    const voyageurs = [
      { firstName: "Berny", lastName: "Itoutou", gender: "M" as const },
      { firstName: "Alice", lastName: "Mba", gender: "F" as const },
    ]
    expect(
      civiliteAEnregistrer({ firstName: "BERNY", lastName: "itoutou" }, voyageurs)
    ).toBe("M")
    expect(
      civiliteAEnregistrer(
        { firstName: "Berny", lastName: "Itoutou", gender: "F" },
        voyageurs
      )
    ).toBeNull()
    expect(
      civiliteAEnregistrer({ firstName: "Paul", lastName: "Obame" }, voyageurs)
    ).toBeNull()
    // Deux homonymes de civilités différentes : on ne tranche pas.
    expect(
      civiliteAEnregistrer({ firstName: "Camille", lastName: "Ndong" }, [
        { firstName: "Camille", lastName: "Ndong", gender: "M" },
        { firstName: "Camille", lastName: "Ndong", gender: "F" },
      ])
    ).toBeNull()
  })
})
