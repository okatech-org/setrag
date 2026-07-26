import { describe, expect, it } from "vitest"
import {
  APPROVAL_ACTIONS,
  APPROVAL_STATUSES,
  allowedActions,
  applyTransition,
  assertValidityWindow,
  canTransition,
  isEditable,
  isEffective,
  periodsOverlap,
} from "./approval"

describe("Machine à états d'approbation", () => {
  it("suit le circuit nominal brouillon → soumis → actif", () => {
    let etat = applyTransition("brouillon", "soumettre")
    expect(etat).toBe("a_valider")
    etat = applyTransition(etat, "valider")
    expect(etat).toBe("actif")
  })

  it("permet le rejet puis la reprise en brouillon", () => {
    let etat = applyTransition("brouillon", "soumettre")
    etat = applyTransition(etat, "rejeter")
    expect(etat).toBe("rejete")
    etat = applyTransition(etat, "reprendre")
    expect(etat).toBe("brouillon")
  })

  it("permet l'expiration d'un objet actif", () => {
    expect(applyTransition("actif", "expirer")).toBe("expire")
  })

  it("refuse de valider un brouillon sans passage par la soumission", () => {
    expect(() => applyTransition("brouillon", "valider")).toThrow(
      /Transition impossible/,
    )
  })

  it("refuse de réactiver un objet expiré", () => {
    for (const action of APPROVAL_ACTIONS) {
      expect(() => applyTransition("expire", action)).toThrow(
        /Aucune action n'est possible/,
      )
    }
  })

  it("refuse de modifier l'état d'un objet actif autrement que par expiration", () => {
    expect(allowedActions("actif")).toEqual(["expirer"])
    expect(() => applyTransition("actif", "soumettre")).toThrow()
    expect(() => applyTransition("actif", "rejeter")).toThrow()
  })

  it("refuse de rejeter un objet qui n'est pas soumis", () => {
    expect(() => applyTransition("brouillon", "rejeter")).toThrow()
    expect(() => applyTransition("rejete", "rejeter")).toThrow()
  })

  it("expose les actions possibles depuis chaque état", () => {
    expect(allowedActions("brouillon")).toEqual(["soumettre"])
    expect(allowedActions("a_valider")).toEqual(["valider", "rejeter"])
    expect(allowedActions("rejete")).toEqual(["reprendre"])
    expect(allowedActions("expire")).toEqual([])
  })

  it("le message d'erreur guide vers les actions possibles", () => {
    expect(() => applyTransition("brouillon", "valider")).toThrow(
      /Actions possibles : soumettre/,
    )
  })

  it("canTransition est cohérent avec applyTransition", () => {
    for (const etat of APPROVAL_STATUSES) {
      for (const action of APPROVAL_ACTIONS) {
        if (canTransition(etat, action)) {
          expect(() => applyTransition(etat, action)).not.toThrow()
        } else {
          expect(() => applyTransition(etat, action)).toThrow()
        }
      }
    }
  })

  it("aucun état n'est un piège sans issue, sauf l'expiration", () => {
    for (const etat of APPROVAL_STATUSES) {
      if (etat === "expire") continue
      expect(allowedActions(etat).length).toBeGreaterThan(0)
    }
  })
})

describe("Modifiabilité", () => {
  it("un brouillon et un rejet sont modifiables", () => {
    expect(isEditable("brouillon")).toBe(true)
    expect(isEditable("rejete")).toBe(true)
  })

  it("un objet soumis est gelé, pour que le validateur lise ce qu'il approuve", () => {
    expect(isEditable("a_valider")).toBe(false)
  })

  it("un objet actif ou expiré n'est jamais modifiable", () => {
    expect(isEditable("actif")).toBe(false)
    expect(isEditable("expire")).toBe(false)
  })
})

describe("Applicabilité effective", () => {
  const debut = Date.UTC(2026, 5, 1)
  const fin = Date.UTC(2026, 7, 31)

  it("un objet actif fait foi à l'intérieur de sa période", () => {
    expect(isEffective("actif", debut, fin, Date.UTC(2026, 6, 15))).toBe(true)
  })

  it("est applicable aux bornes exactes", () => {
    expect(isEffective("actif", debut, fin, debut)).toBe(true)
    expect(isEffective("actif", debut, fin, fin)).toBe(true)
  })

  it("n'est pas applicable hors de sa période", () => {
    expect(isEffective("actif", debut, fin, debut - 1)).toBe(false)
    expect(isEffective("actif", debut, fin, fin + 1)).toBe(false)
  })

  it("un objet non actif ne fait jamais foi, même dans la période", () => {
    const milieu = Date.UTC(2026, 6, 15)
    for (const etat of APPROVAL_STATUSES) {
      if (etat === "actif") continue
      expect(isEffective(etat, debut, fin, milieu)).toBe(false)
    }
  })
})

describe("Cohérence des périodes de validité", () => {
  it("accepte une période bien ordonnée", () => {
    expect(() => assertValidityWindow(1000, 2000)).not.toThrow()
  })

  it("refuse une fin antérieure ou égale au début", () => {
    expect(() => assertValidityWindow(2000, 1000)).toThrow(/postérieure/)
    expect(() => assertValidityWindow(1000, 1000)).toThrow(/postérieure/)
  })

  it("refuse des bornes non numériques", () => {
    expect(() => assertValidityWindow(Number.NaN, 2000)).toThrow(RangeError)
    expect(() =>
      assertValidityWindow(1000, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError)
  })
})

describe("Chevauchement de périodes", () => {
  it("détecte deux périodes qui se recouvrent", () => {
    expect(periodsOverlap(100, 200, 150, 250)).toBe(true)
    expect(periodsOverlap(150, 250, 100, 200)).toBe(true)
  })

  it("détecte une période incluse dans une autre", () => {
    expect(periodsOverlap(100, 300, 150, 200)).toBe(true)
  })

  it("détecte un contact sur une seule borne", () => {
    expect(periodsOverlap(100, 200, 200, 300)).toBe(true)
  })

  it("accepte deux périodes disjointes", () => {
    expect(periodsOverlap(100, 200, 201, 300)).toBe(false)
    expect(periodsOverlap(201, 300, 100, 200)).toBe(false)
  })

  it("est symétrique", () => {
    const cas = [
      [100, 200, 150, 250],
      [100, 200, 300, 400],
      [100, 400, 200, 300],
    ] as const
    for (const [a, b, c, d] of cas) {
      expect(periodsOverlap(a, b, c, d)).toBe(periodsOverlap(c, d, a, b))
    }
  })
})
