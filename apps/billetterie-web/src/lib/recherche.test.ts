import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  codesReduction,
  derniereRecherche,
  libelleVoyageurs,
  lireRecherche,
  memoriserRecherche,
  parametresRecherche,
  voyageurs,
  type Recherche,
} from "./recherche"
import { VOYAGEURS_MAX } from "./voyage"

const adresse = (requete: string) => new URLSearchParams(requete)

const COMPLETE: Recherche = {
  de: "OWE",
  a: "FCV",
  le: "2026-10-02",
  adultes: 2,
  enfants: 1,
}

describe("lireRecherche", () => {
  it("lit une recherche complète", () => {
    expect(
      lireRecherche(adresse("de=OWE&a=FCV&le=2026-10-02&adultes=2&enfants=1"))
    ).toEqual(COMPLETE)
  })

  it("prend un adulte et aucun enfant par défaut", () => {
    expect(lireRecherche(adresse("de=OWE&a=FCV&le=2026-10-02"))).toEqual({
      de: "OWE",
      a: "FCV",
      le: "2026-10-02",
      adultes: 1,
      enfants: 0,
    })
  })

  it("refuse une recherche incomplète", () => {
    expect(lireRecherche(adresse("a=FCV&le=2026-10-02"))).toBeNull()
    expect(lireRecherche(adresse("de=OWE&le=2026-10-02"))).toBeNull()
    expect(lireRecherche(adresse("de=OWE&a=FCV"))).toBeNull()
  })

  it("refuse un trajet vers la gare de départ", () => {
    expect(lireRecherche(adresse("de=OWE&a=OWE&le=2026-10-02"))).toBeNull()
  })

  it("refuse une date mal écrite", () => {
    expect(lireRecherche(adresse("de=OWE&a=FCV&le=2026-10-2"))).toBeNull()
    expect(lireRecherche(adresse("de=OWE&a=FCV&le=02/10/2026"))).toBeNull()
  })

  it("exige au moins un adulte", () => {
    expect(
      lireRecherche(adresse("de=OWE&a=FCV&le=2026-10-02&adultes=0&enfants=2"))
    ).toBeNull()
  })

  it(`plafonne le groupe à ${VOYAGEURS_MAX} voyageurs`, () => {
    const limite = `de=OWE&a=FCV&le=2026-10-02&adultes=${VOYAGEURS_MAX - 1}&enfants=1`
    expect(lireRecherche(adresse(limite))?.adultes).toBe(VOYAGEURS_MAX - 1)
    const auDela = `de=OWE&a=FCV&le=2026-10-02&adultes=${VOYAGEURS_MAX}&enfants=1`
    expect(lireRecherche(adresse(auDela))).toBeNull()
  })

  it("remplace un effectif illisible par la valeur par défaut", () => {
    const recherche = lireRecherche(
      adresse("de=OWE&a=FCV&le=2026-10-02&adultes=deux&enfants=-1")
    )
    expect(recherche).toMatchObject({ adultes: 1, enfants: 0 })
    expect(
      lireRecherche(adresse("de=OWE&a=FCV&le=2026-10-02&adultes=1.5"))?.adultes
    ).toBe(1)
  })
})

describe("parametresRecherche", () => {
  it("écrit une recherche que lireRecherche relit à l'identique", () => {
    const parametres = parametresRecherche(COMPLETE)
    expect(parametres).toEqual({
      de: "OWE",
      a: "FCV",
      le: "2026-10-02",
      adultes: "2",
      enfants: "1",
    })
    expect(lireRecherche(new URLSearchParams(parametres))).toEqual(COMPLETE)
  })
})

describe("voyageurs", () => {
  it("additionne adultes et enfants", () => {
    expect(voyageurs({ adultes: 2, enfants: 3 })).toBe(5)
  })

  it("accorde le libellé", () => {
    expect(libelleVoyageurs({ adultes: 1, enfants: 0 })).toBe("1 adulte")
    expect(libelleVoyageurs({ adultes: 2, enfants: 1 })).toBe(
      "2 adultes, 1 enfant"
    )
    expect(libelleVoyageurs({ adultes: 1, enfants: 3 })).toBe(
      "1 adulte, 3 enfants"
    )
  })
})

describe("codesReduction", () => {
  it("place les adultes d'abord, sans réduction, puis les enfants", () => {
    expect(codesReduction({ adultes: 2, enfants: 1 }, "ENFANT")).toEqual([
      "",
      "",
      "ENFANT",
    ])
  })

  it("ne transmet rien sans enfant ou sans réduction enfant", () => {
    expect(codesReduction({ adultes: 2, enfants: 0 }, "ENFANT")).toBeUndefined()
    expect(codesReduction({ adultes: 1, enfants: 2 }, null)).toBeUndefined()
  })
})

/**
 * Stockage en mémoire. Node 25 déclare son propre `localStorage`, vide sans
 * `--localstorage-file`, qui masque celui de jsdom : on pose le nôtre.
 */
class StockageMemoire implements Storage {
  #valeurs = new Map<string, string>()
  get length() {
    return this.#valeurs.size
  }
  clear() {
    this.#valeurs.clear()
  }
  getItem(cle: string) {
    return this.#valeurs.get(cle) ?? null
  }
  key(index: number) {
    return [...this.#valeurs.keys()][index] ?? null
  }
  removeItem(cle: string) {
    this.#valeurs.delete(cle)
  }
  setItem(cle: string, valeur: string) {
    this.#valeurs.set(cle, String(valeur))
  }
}

describe("dernière recherche", () => {
  const stockage = new StockageMemoire()
  beforeEach(() => {
    stockage.clear()
    Object.defineProperty(window, "localStorage", {
      value: stockage,
      configurable: true,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("retrouve la recherche mémorisée", () => {
    memoriserRecherche(COMPLETE)
    expect(derniereRecherche()).toEqual(COMPLETE)
  })

  it("ne renvoie rien sans recherche mémorisée", () => {
    expect(derniereRecherche()).toBeNull()
  })

  it("ignore une valeur corrompue ou incomplète", () => {
    window.localStorage.setItem("setrag:derniere-recherche", "{pas du json")
    expect(derniereRecherche()).toBeNull()
    window.localStorage.setItem(
      "setrag:derniere-recherche",
      JSON.stringify({ de: "OWE", a: "FCV" })
    )
    expect(derniereRecherche()).toBeNull()
  })

  it("supporte un stockage refusé", () => {
    vi.spyOn(stockage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota dépassé", "QuotaExceededError")
    })
    expect(() => memoriserRecherche(COMPLETE)).not.toThrow()
    vi.spyOn(stockage, "getItem").mockImplementation(() => {
      throw new DOMException("Accès refusé", "SecurityError")
    })
    expect(derniereRecherche()).toBeNull()
  })
})
