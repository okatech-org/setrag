import { describe, expect, it } from "vitest"

import {
  calculerBulletin,
  impotParPart,
  irppMensuel,
  joursDePresence,
  partsFiscales,
  tauxAnciennete,
  VARIABLES_VIDES,
  type AgentPaie,
} from "./modelPaie"

const SEPTEMBRE = { debut: "2026-09-01", fin: "2026-09-30" }

const conducteur: AgentPaie = {
  salaireBaseFcfa: 500_000,
  primeFonctionFcfa: 50_000,
  primeSujetionFcfa: 60_000,
  dateEmbauche: "2016-03-01",
  situationFamiliale: "marie",
  enfantsACharge: 2,
}

describe("moteur de paie gabonais", () => {
  it("compte les parts du quotient familial et plafonne à six", () => {
    expect(partsFiscales("celibataire", 0)).toBe(1)
    expect(partsFiscales("marie", 0)).toBe(2)
    expect(partsFiscales("marie", 3)).toBe(3.5)
    expect(partsFiscales("divorce", 2)).toBe(2)
    expect(partsFiscales("marie", 12)).toBe(6)
    expect(() => partsFiscales("marie", -1)).toThrow()
  })

  it("applique le barème IRPP par tranches", () => {
    expect(impotParPart(1_500_000)).toBe(0)
    // 420 000 à 5 % puis 80 000 à 10 %.
    expect(impotParPart(2_000_000)).toBe(21_000 + 8_000)
    expect(irppMensuel(0, 1)).toBe(0)
    // Un revenu modeste reste sous la première tranche une fois abattu.
    expect(irppMensuel(150_000, 1)).toBe(0)
  })

  it("calcule la prime d'ancienneté : 2 % à deux ans, +1 % par an, plafond 25 %", () => {
    expect(tauxAnciennete(1)).toBe(0)
    expect(tauxAnciennete(2)).toBe(2)
    expect(tauxAnciennete(10)).toBe(10)
    expect(tauxAnciennete(40)).toBe(25)
  })

  it("produit un bulletin équilibré avec cotisations plafonnées", () => {
    const bulletin = calculerBulletin(conducteur, SEPTEMBRE, {
      ...VARIABLES_VIDES,
      kmTraction: 3_000,
      nuitsDecouche: 4,
      heuresSup125: 8,
    })
    const t = bulletin.totaux
    expect(bulletin.ancienneteAnnees).toBe(10)
    expect(bulletin.joursPayes).toBe(30)
    // 500 000 + ancienneté 10 % + fonction + sujétion + traction 45 000 + HS.
    const heuresSup = Math.round(8 * (500_000 / 173.33) * 1.25)
    expect(t.brutSoumis).toBe(500_000 + 50_000 + 50_000 + 60_000 + 45_000 + heuresSup)
    expect(t.nonSoumis).toBe(50_000)
    expect(t.assietteCnss).toBe(Math.min(t.brutSoumis, 1_500_000))
    expect(t.cnssSalarie).toBe(Math.round(t.assietteCnss * 0.025))
    expect(t.cnamgsSalarie).toBe(Math.round(t.assietteCnamgs * 0.02))
    expect(t.tcs).toBe(Math.round(t.brutSoumis * 0.05))
    expect(t.parts).toBe(3)
    expect(t.net).toBe(t.brutSoumis + t.nonSoumis - t.totalRetenues)
    expect(t.totalRetenues).toBe(t.cnssSalarie + t.cnamgsSalarie + t.tcs + t.irpp + t.autresRetenues)
    expect(t.cnssPatronal).toBe(Math.round(t.assietteCnss * 0.08) + Math.round(t.assietteCnss * 0.03) + Math.round(t.assietteCnss * 0.05))
    expect(t.coutEmployeur).toBe(t.brut + t.chargesPatronales)
    // Chaque ligne retenue apparaît au bulletin.
    expect(bulletin.lignes.map((l) => l.code)).toEqual(expect.arrayContaining(["1000", "1100", "1400", "1510", "1900", "3100", "3200", "4100", "4200", "6100"]))
  })

  it("plafonne l'assiette CNSS à 1,5 M et CNAMGS à 2,5 M", () => {
    const cadre: AgentPaie = { ...conducteur, salaireBaseFcfa: 3_000_000, primeFonctionFcfa: 0, primeSujetionFcfa: 0, dateEmbauche: "2025-01-01" }
    const t = calculerBulletin(cadre, SEPTEMBRE).totaux
    expect(t.assietteCnss).toBe(1_500_000)
    expect(t.assietteCnamgs).toBe(2_500_000)
    expect(t.cnssSalarie).toBe(37_500)
    expect(t.cnamgsSalarie).toBe(50_000)
    expect(t.irpp).toBeGreaterThan(0)
  })

  it("proratise l'entrée en cours de mois et les absences non payées", () => {
    const recrue = { ...conducteur, dateEmbauche: "2026-09-16" }
    expect(joursDePresence(recrue, SEPTEMBRE)).toBe(15)
    const bulletin = calculerBulletin(recrue, SEPTEMBRE, VARIABLES_VIDES, 5)
    expect(bulletin.joursPayes).toBe(10)
    expect(bulletin.lignes[0]!.montant).toBe(Math.round((500_000 * 10) / 30))
  })

  it("refuse un net négatif et des variables hors bornes", () => {
    expect(() => calculerBulletin(conducteur, SEPTEMBRE, { ...VARIABLES_VIDES, avanceSalaireFcfa: 5_000_000 })).toThrow("négatif")
    expect(() => calculerBulletin(conducteur, SEPTEMBRE, { ...VARIABLES_VIDES, joursAbsence: 31 })).toThrow()
    expect(() => calculerBulletin(conducteur, SEPTEMBRE, { ...VARIABLES_VIDES, heuresSup125: -2 })).toThrow()
  })
})
