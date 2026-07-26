import { describe, expect, it } from "vitest"
import {
  inkedCount,
  mergeRuns,
  rasterize,
  type Polygon,
} from "./aztec"

/** Carré plein de 4×4 unités, coin bas-gauche à l'origine. */
const CARRE: Polygon = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

describe("rastérisation", () => {
  it("encre les modules couverts par un polygone plein", () => {
    const m = rasterize([CARRE], 4, 4, 2)
    expect(m.columns).toBe(2)
    expect(m.rows).toBe(2)
    expect(m.modules).toEqual([
      [true, true],
      [true, true],
    ])
  })

  it("laisse blanc ce qu'aucun polygone ne couvre", () => {
    const m = rasterize([CARRE], 8, 4, 2)
    expect(m.modules).toEqual([
      [true, true, false, false],
      [true, true, false, false],
    ])
  })

  it("creuse les trous selon la règle de parité", () => {
    // Un anneau : carré de 6×6 avec un trou central de 2×2. En remplissage
    // non nul le trou serait bouché et le symbole illisible — c'est
    // exactement le défaut que cette règle évite.
    const exterieur: Polygon = [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]
    const trou: Polygon = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
    ]
    const m = rasterize([exterieur, trou], 6, 6, 2)
    expect(m.modules).toEqual([
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ])
  })

  it("indexe les lignes depuis le bas, comme le PDF", () => {
    // Bande basse uniquement : elle doit être la ligne 0.
    const bande: Polygon = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ]
    const m = rasterize([bande], 4, 4, 2)
    expect(m.modules[0]).toEqual([true, true])
    expect(m.modules[1]).toEqual([false, false])
  })

  it("refuse un symbole non aligné sur la grille", () => {
    expect(() => rasterize([], 5, 4, 2)).toThrow(/non aligné/)
    expect(() => rasterize([], 4, 4, 0)).toThrow(/module invalide/)
  })

  it("compte les modules encrés", () => {
    expect(inkedCount(rasterize([CARRE], 8, 4, 2))).toBe(4)
  })
})

describe("fusion en segments", () => {
  it("regroupe les modules jointifs d'une même ligne", () => {
    const matrix = {
      columns: 5,
      rows: 2,
      modules: [
        [true, true, false, true, true],
        [false, true, true, true, false],
      ],
    }
    expect(mergeRuns(matrix)).toEqual([
      { row: 0, col: 0, length: 2 },
      { row: 0, col: 3, length: 2 },
      { row: 1, col: 1, length: 3 },
    ])
  })

  it("ferme un segment qui touche le bord droit", () => {
    const matrix = { columns: 3, rows: 1, modules: [[false, true, true]] }
    expect(mergeRuns(matrix)).toEqual([{ row: 0, col: 1, length: 2 }])
  })

  it("ne produit rien sur une ligne vide", () => {
    expect(mergeRuns({ columns: 3, rows: 1, modules: [[false, false, false]] }))
      .toEqual([])
  })

  it("conserve le nombre total de modules encrés", () => {
    const m = rasterize([CARRE], 8, 8, 2)
    const total = mergeRuns(m).reduce((n, r) => n + r.length, 0)
    expect(total).toBe(inkedCount(m))
  })
})
