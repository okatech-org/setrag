import { describe, expect, it } from "vitest"

import {
  classeCourte,
  dateCourte,
  heure,
  jourHeure,
  montant,
  taux,
} from "./format"
import { memeVoiture, nomTrain, numeroVoiture } from "./train"

describe("Mots et chiffres du terminal", () => {
  it("écrit le taux au kilomètre à la française", () => {
    expect(taux(43.42)).toBe("43,42")
    expect(taux(47.5)).toBe("47,50")
  })

  it("écrit les montants en francs CFA, espaces insécables compris", () => {
    expect(montant(17_000)).toBe("17 000 FCFA")
  })

  it("donne l'heure de Libreville, quel que soit le fuseau du terminal", () => {
    const instant = Date.parse("2026-09-30T14:40:00Z")
    expect(heure(instant)).toBe("15:40")
    expect(jourHeure(instant)).toBe("30/09 à 15:40")
  })

  it("date une circulation comme le billet", () => {
    expect(dateCourte("2026-09-30")).toBe("Mer. 30 sept.")
    expect(classeCourte("PREMIERE")).toBe("1re")
  })

  it("nomme le train comme le billet, pas par son code interne", () => {
    expect(nomTrain("EXPRESS", "TR-201")).toBe("Express 201")
    expect(nomTrain("OMNIBUS", "TR-202")).toBe("Omnibus 202")
  })

  it("reconnaît une voiture sous ses différents repères", () => {
    expect(numeroVoiture("V4")).toBe("4")
    expect(memeVoiture("4", "V4")).toBe(true)
    expect(memeVoiture("V04", "V4")).toBe(true)
    expect(memeVoiture("V1", "V4")).toBe(false)
    expect(memeVoiture(undefined, "V4")).toBe(false)
  })
})
