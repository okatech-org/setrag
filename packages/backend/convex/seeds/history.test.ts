import { describe, expect, it } from "vitest"
import {
  seasonalFactor,
  seedFromDate,
  seededRandom,
  targetLoad,
  weightedPick,
} from "./history"

/**
 * Le tirage de l'historique de démonstration.
 *
 * L'enjeu principal est le DÉTERMINISME : une démonstration dont les chiffres
 * changent à chaque rechargement n'inspire aucune confiance, et un écart
 * constaté ne serait pas reproductible.
 */

describe("tirage semé", () => {
  it("produit toujours la même suite pour une même semence", () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b())
  })

  it("produit des suites différentes pour des semences différentes", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)())
  })

  it("reste dans [0, 1[", () => {
    const rng = seededRandom(7)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it("se répartit à peu près uniformément", () => {
    // Un générateur biaisé donnerait des journées toutes semblables.
    const rng = seededRandom(99)
    const seaux = new Array(10).fill(0)
    for (let i = 0; i < 10_000; i += 1) seaux[Math.floor(rng() * 10)] += 1
    for (const n of seaux) {
      expect(n).toBeGreaterThan(800)
      expect(n).toBeLessThan(1200)
    }
  })
})

describe("semence dérivée de la date", () => {
  it("est stable dans le temps", () => {
    expect(seedFromDate("2026-07-14")).toBe(seedFromDate("2026-07-14"))
  })

  it("distingue deux jours consécutifs", () => {
    expect(seedFromDate("2026-07-14")).not.toBe(seedFromDate("2026-07-15"))
  })

  it("donne une journée reproductible de bout en bout", () => {
    const jour = () => {
      const rng = seededRandom(seedFromDate("2026-08-03"))
      return [rng(), rng(), rng()]
    }
    expect(jour()).toEqual(jour())
  })
})

describe("tirage pondéré", () => {
  it("respecte les poids sur un grand nombre de tirages", () => {
    const rng = seededRandom(3)
    const entrées = [
      ["guichet", 56],
      ["ligne", 22],
      ["agence", 14],
      ["bord", 8],
    ] as const

    const compte: Record<string, number> = {}
    for (let i = 0; i < 20_000; i += 1) {
      const v = weightedPick(rng, entrées)
      compte[v] = (compte[v] ?? 0) + 1
    }
    expect(compte.guichet! / 20_000).toBeCloseTo(0.56, 1)
    expect(compte.ligne! / 20_000).toBeCloseTo(0.22, 1)
    expect(compte.bord! / 20_000).toBeCloseTo(0.08, 1)
  })

  it("rend toujours une valeur de la liste", () => {
    const rng = seededRandom(5)
    for (let i = 0; i < 100; i += 1) {
      expect(["a", "b"]).toContain(
        weightedPick(rng, [
          ["a", 1],
          ["b", 1],
        ] as const),
      )
    }
  })

  it("ne rend jamais une entrée de poids nul", () => {
    const rng = seededRandom(11)
    for (let i = 0; i < 200; i += 1) {
      expect(
        weightedPick(rng, [
          ["jamais", 0],
          ["toujours", 10],
        ] as const),
      ).toBe("toujours")
    }
  })
})

describe("saisonnalité", () => {
  it("fait monter les vacances scolaires", () => {
    // SETRAG a déjà suspendu la vente en pleine période de vacances.
    expect(seasonalFactor("2026-08-15")).toBeGreaterThan(1.3)
    expect(seasonalFactor("2026-12-24")).toBeGreaterThan(1.3)
    expect(seasonalFactor("2026-01-03")).toBeGreaterThan(1.3)
  })

  it("fait baisser la saison des pluies", () => {
    expect(seasonalFactor("2026-04-12")).toBeLessThan(0.8)
  })

  it("laisse le reste de l'année autour de la normale", () => {
    expect(seasonalFactor("2026-06-15")).toBeCloseTo(0.95, 2)
    expect(seasonalFactor("2026-11-05")).toBeCloseTo(0.95, 2)
  })

  it("ne fait pas monter début décembre, hors vacances", () => {
    expect(seasonalFactor("2026-12-05")).toBeLessThan(1)
  })
})

describe("taux de remplissage visé", () => {
  it("ne dépasse jamais la capacité", () => {
    const rng = seededRandom(17)
    for (let i = 0; i < 500; i += 1) {
      expect(targetLoad(rng, "2026-08-10", "EXPRESS")).toBeLessThanOrEqual(0.99)
    }
  })

  it("reste positif même au creux de saison", () => {
    const rng = seededRandom(19)
    for (let i = 0; i < 200; i += 1) {
      expect(targetLoad(rng, "2026-04-10", "OMNIBUS")).toBeGreaterThan(0.3)
    }
  })

  it("remplit davantage l'Express que l'Omnibus", () => {
    const moyenne = (type: string) => {
      const rng = seededRandom(23)
      let total = 0
      for (let i = 0; i < 500; i += 1) total += targetLoad(rng, "2026-06-10", type)
      return total / 500
    }
    expect(moyenne("EXPRESS")).toBeGreaterThan(moyenne("OMNIBUS"))
  })

  it("varie d'une desserte à l'autre le même jour", () => {
    // Un taux figé se verrait immédiatement sur une courbe.
    const rng = seededRandom(29)
    const tirages = new Set(
      Array.from({ length: 20 }, () => targetLoad(rng, "2026-06-10", "EXPRESS")),
    )
    expect(tirages.size).toBeGreaterThan(15)
  })
})
