import { describe, expect, it } from "vitest"

import type { Verdict } from "./offline/types"
import {
  enregistreLeControle,
  FAMILLE_DU_VERDICT,
  LIBELLE_VERDICT,
  RETOUR_PHYSIQUE,
  suitesDuVerdict,
} from "./verdicts"

const TOUS = Object.keys(LIBELLE_VERDICT) as Verdict[]

/**
 * La table des treize verdicts de la maquette validée : famille, puis suite
 * proposée (bouton primaire, puis secondaires).
 */
const TABLE: Array<[Verdict, string, string, string[]]> = [
  ["valide", "accepte", "valider", []],
  ["abonnement", "accepte", "valider", []],
  ["deja_controle", "vigilance", "continuer", []],
  ["inconnu", "vigilance", "regulariser", ["pv"]],
  ["cle_hors_service", "vigilance", "chercher", ["signaler"]],
  ["hors_segment", "refus", "regulariser", ["pv"]],
  ["mauvaise_desserte", "refus", "vendre", ["pv"]],
  ["expire", "refus", "vendre", ["pv"]],
  ["annule", "refus", "pv", ["vendre"]],
  ["rembourse", "refus", "pv", ["vendre"]],
  ["non_paye", "refus", "pv", ["vendre"]],
  ["contrefait", "refus", "pv", ["vendre"]],
  ["illisible", "lecture", "rescanner", ["saisir", "chercher"]],
]

describe("Les treize verdicts", () => {
  it("sont tous rangés dans une famille et suivis d'une suite", () => {
    expect(TOUS).toHaveLength(13)
    expect(TABLE.map(([v]) => v).sort()).toEqual([...TOUS].sort())
  })

  it.each(TABLE)("%s : famille %s, primaire « %s »", (verdict, famille, principale, secondaires) => {
    expect(FAMILLE_DU_VERDICT[verdict]).toBe(famille)
    const suites = suitesDuVerdict(verdict)
    expect(suites.principale).toBe(principale)
    expect(suites.secondaires).toEqual(secondaires)
  })

  it("ne propose jamais deux fois la même action, et un seul primaire", () => {
    for (const verdict of TOUS) {
      const { principale, secondaires, discretes } = suitesDuVerdict(verdict)
      const toutes = [principale, ...secondaires, ...discretes]
      expect(new Set(toutes).size).toBe(toutes.length)
    }
  })

  it("« Statut inconnu » garde l'acceptation, mais hors du bouton primaire", () => {
    const { principale, discretes } = suitesDuVerdict("inconnu")
    expect(principale).toBe("regulariser")
    expect(discretes).toContain("accepter")
  })

  it("une lecture impossible ne propose ni procès-verbal ni vente", () => {
    const { principale, secondaires, discretes } = suitesDuVerdict("illisible")
    expect([principale, ...secondaires, ...discretes]).not.toContain("pv")
    expect([principale, ...secondaires, ...discretes]).not.toContain("vendre")
  })

  it("seuls les verdicts acceptés reviennent seuls au viseur", () => {
    const auto = TOUS.filter((v) => suitesDuVerdict(v).retourAuto)
    expect(auto.sort()).toEqual(["abonnement", "valide"])
  })
})

describe("Journal des contrôles", () => {
  it("enregistre tout verdict sur un titre, refus compris", () => {
    expect(enregistreLeControle("contrefait", "pv")).toBe(true)
    expect(enregistreLeControle("valide", "valider")).toBe(true)
    expect(enregistreLeControle("cle_hors_service", "chercher")).toBe(true)
  })

  it("n'enregistre rien quand l'agent ferme, ou quand le code ne s'est pas lu", () => {
    expect(enregistreLeControle("valide", "fermer")).toBe(false)
    expect(enregistreLeControle("illisible", "chercher")).toBe(false)
    expect(enregistreLeControle("illisible", "rescanner")).toBe(false)
  })
})

describe("Retour physique", () => {
  it("fait vibrer l'abonnement comme un titre valide", () => {
    expect(FAMILLE_DU_VERDICT.abonnement).toBe(FAMILLE_DU_VERDICT.valide)
    expect(RETOUR_PHYSIQUE.accepte.vibration).toEqual([40])
  })

  it("distingue les familles, et laisse la lecture impossible silencieuse", () => {
    expect(RETOUR_PHYSIQUE.vigilance.vibration).toEqual([40, 60, 40])
    expect(RETOUR_PHYSIQUE.refus.vibration![0]).toBeGreaterThan(200)
    expect(RETOUR_PHYSIQUE.lecture).toEqual({ vibration: null, notes: [] })
    expect(RETOUR_PHYSIQUE.vigilance.notes).toHaveLength(2)
  })
})
