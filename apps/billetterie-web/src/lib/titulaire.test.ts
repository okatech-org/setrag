import { describe, expect, it } from "vitest"

import { estLeTitulaire, voyageurMoi } from "./titulaire"

const fiches = [
  { firstName: "Alice", lastName: "Mba", gender: "F" as const },
  { firstName: "Berny", lastName: "Itoutou", gender: "M" as const },
]

describe("le voyageur « Moi »", () => {
  it("vient du profil, civilité comprise", () => {
    expect(voyageurMoi({ firstName: " Berny ", lastName: "ITOUTOU", gender: "M" })).toEqual({
      prenom: "Berny",
      nom: "ITOUTOU",
      sexe: "M",
    })
  })

  it("retrouve la civilité d'un compte ancien dans sa propre fiche", () => {
    expect(voyageurMoi({ firstName: "Berny", lastName: "ITOUTOU" }, fiches)?.sexe).toBe("M")
    expect(voyageurMoi({ firstName: "Paul", lastName: "Obame" }, fiches)?.sexe).toBeNull()
  })

  it("n'existe pas tant que le compte n'a pas de nom", () => {
    expect(voyageurMoi(null)).toBeNull()
    expect(voyageurMoi({ firstName: " ", lastName: undefined })).toBeNull()
  })

  it("reconnaît la fiche que le titulaire avait créée pour lui-même", () => {
    const profil = { firstName: "Berny", lastName: "ITOUTOU" }
    expect(estLeTitulaire(profil, fiches[1]!)).toBe(true)
    expect(estLeTitulaire(profil, fiches[0]!)).toBe(false)
    expect(estLeTitulaire(null, fiches[1]!)).toBe(false)
  })
})
