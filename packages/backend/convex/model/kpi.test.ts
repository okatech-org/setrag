import { describe, expect, it } from "vitest"
import {
  ZERO_AMOUNTS,
  ZERO_METRICS,
  absAmounts,
  addMetrics,
  aggregateLoadFactor,
  averageBasketTtc,
  byRevenue,
  compare,
  groupBy,
  loadFactor,
  netTtc,
  refundRatePct,
  summarizeVariances,
  topWithRest,
  type Metrics,
  type SegmentLoad,
} from "./kpi"

function metrics(over: Partial<Metrics> = {}): Metrics {
  return { ...ZERO_METRICS, ...over }
}

function amounts(ttc: number) {
  return { ...ZERO_AMOUNTS, ttc, ht: ttc, received: ttc }
}

describe("cumuls", () => {
  it("additionne comptes et montants", () => {
    const a = metrics({ salesCount: 2, ticketCount: 3, gross: amounts(1000) })
    const b = metrics({ salesCount: 1, ticketCount: 1, gross: amounts(500) })
    const t = addMetrics(a, b)
    expect(t.salesCount).toBe(3)
    expect(t.ticketCount).toBe(4)
    expect(t.gross.ttc).toBe(1500)
  })

  it("ramène les sorties en valeur absolue", () => {
    // Les annulations portent des montants négatifs en base ; un graphique
    // de « ce qui est ressorti » doit montrer des barres positives.
    expect(absAmounts({ ...ZERO_AMOUNTS, ttc: -4200, ht: -4000 })).toMatchObject(
      { ttc: 4200, ht: 4000 },
    )
  })

  it("calcule le net en retranchant les sorties du brut", () => {
    expect(
      netTtc(metrics({ gross: amounts(10_000), refunded: amounts(1_500) })),
    ).toBe(8_500)
  })

  it("rapporte le taux de sortie au brut, pas au net", () => {
    // Rapporté au net, l'indicateur exploserait à mesure que le net tend
    // vers zéro — ce qui n'aiderait personne à décider.
    const m = metrics({ gross: amounts(10_000), refunded: amounts(2_000) })
    expect(refundRatePct(m)).toBe(20)
  })

  it("ne divise pas par zéro sur une période sans vente", () => {
    expect(refundRatePct(ZERO_METRICS)).toBe(0)
    expect(averageBasketTtc(ZERO_METRICS)).toBe(0)
  })

  it("calcule le panier moyen sur les ventes fermes", () => {
    expect(
      averageBasketTtc(metrics({ salesCount: 4, gross: amounts(169_000) })),
    ).toBe(42_250)
  })
})

describe("ventilation", () => {
  const lignes = [
    { canal: "guichet", m: metrics({ salesCount: 3, gross: amounts(300) }) },
    { canal: "ligne", m: metrics({ salesCount: 1, gross: amounts(900) }) },
    { canal: "guichet", m: metrics({ salesCount: 2, gross: amounts(200) }) },
  ]

  it("regroupe par clé en cumulant", () => {
    const parts = groupBy(
      lignes,
      (r) => ({ key: r.canal, label: r.canal }),
      (r) => r.m,
    )
    expect(parts).toHaveLength(2)
    const guichet = parts.find((p) => p.key === "guichet")!
    expect(guichet.metrics.salesCount).toBe(5)
    expect(guichet.metrics.gross.ttc).toBe(500)
  })

  it("trie par chiffre d'affaires net décroissant", () => {
    const parts = byRevenue(
      groupBy(lignes, (r) => ({ key: r.canal, label: r.canal }), (r) => r.m),
    )
    expect(parts.map((p) => p.key)).toEqual(["ligne", "guichet"])
  })

  it("ne regroupe pas quand il y a moins d'entrées que la limite", () => {
    const parts = topWithRest(
      groupBy(lignes, (r) => ({ key: r.canal, label: r.canal }), (r) => r.m),
      5,
    )
    expect(parts.map((p) => p.key)).toEqual(["ligne", "guichet"])
  })

  it("regroupe le reste sans perdre de chiffre d'affaires", () => {
    const parts = [1, 2, 3, 4, 5].map((n) => ({
      canal: `pos-${n}`,
      m: metrics({ gross: amounts(n * 1000) }),
    }))
    const tronqué = topWithRest(
      groupBy(parts, (r) => ({ key: r.canal, label: r.canal }), (r) => r.m),
      2,
    )
    expect(tronqué).toHaveLength(3)
    expect(tronqué[2]!.key).toBe("__autres__")
    // 3 + 2 + 1 = 6 : le total doit rester juste malgré la troncature.
    expect(tronqué[2]!.metrics.gross.ttc).toBe(6000)
    expect(tronqué[2]!.label).toContain("3")
    const total = tronqué.reduce((t, p) => t + p.metrics.gross.ttc, 0)
    expect(total).toBe(15_000)
  })
})

describe("comparaison de périodes", () => {
  it("donne l'écart absolu et relatif", () => {
    const v = compare(120, 100)
    expect(v.delta).toBe(20)
    expect(v.pct).toBe(20)
  })

  it("gère une baisse", () => {
    expect(compare(80, 100).pct).toBe(-20)
  })

  it("rend null plutôt qu'un pourcentage inventé sans référence", () => {
    // Afficher +100 % ou l'infini laisserait croire à une croissance
    // spectaculaire là où il n'y a qu'une absence d'historique.
    const v = compare(500, 0)
    expect(v.pct).toBeNull()
    expect(v.delta).toBe(500)
  })

  it("rend 0 % pour deux périodes identiques", () => {
    expect(compare(100, 100).pct).toBe(0)
  })
})

describe("taux de remplissage", () => {
  /**
   * Trois tronçons de longueurs très différentes : c'est le cas qui
   * distingue le siège-kilomètre d'un simple comptage de billets.
   */
  const segments: SegmentLoad[] = [
    { segmentIndex: 0, capacity: 100, sold: 100, lengthKm: 10 },
    { segmentIndex: 1, capacity: 100, sold: 20, lengthKm: 500 },
    { segmentIndex: 2, capacity: 100, sold: 50, lengthKm: 100 },
  ]

  it("pondère chaque tronçon par sa longueur", () => {
    const f = loadFactor(segments)
    // Offert : 100 × 610 = 61 000. Vendu : 1 000 + 10 000 + 5 000 = 16 000.
    expect(f.seatKmOffered).toBe(61_000)
    expect(f.seatKmSold).toBe(16_000)
    expect(f.pct).toBeCloseTo(26.23, 1)
  })

  it("ne se laisse pas tromper par un tronçon court saturé", () => {
    // Un comptage naïf par tronçon donnerait (100+20+50)/300 = 56,7 %.
    // Le siège-kilomètre dit 26 % : le train est très majoritairement vide
    // là où il roule le plus longtemps.
    const naïf =
      (segments.reduce((t, s) => t + s.sold, 0) /
        segments.reduce((t, s) => t + s.capacity, 0)) *
      100
    expect(naïf).toBeCloseTo(56.67, 1)
    expect(loadFactor(segments).pct).toBeLessThan(naïf / 2)
  })

  it("désigne le tronçon de pointe, celui qui borne la vente", () => {
    const f = loadFactor(segments)
    expect(f.peakSegmentIndex).toBe(0)
    expect(f.peakPct).toBe(100)
  })

  it("rend zéro sans capacité, sans diviser par zéro", () => {
    const f = loadFactor([
      { segmentIndex: 0, capacity: 0, sold: 0, lengthKm: 100 },
    ])
    expect(f.pct).toBe(0)
    expect(f.peakSegmentIndex).toBeNull()
  })

  it("rend zéro sur une desserte sans tronçon", () => {
    expect(loadFactor([]).pct).toBe(0)
  })

  it("atteint 100 % quand tout est vendu partout", () => {
    expect(
      loadFactor([
        { segmentIndex: 0, capacity: 50, sold: 50, lengthKm: 30 },
        { segmentIndex: 1, capacity: 50, sold: 50, lengthKm: 70 },
      ]).pct,
    ).toBe(100)
  })

  it("cumule plusieurs dessertes sur les sièges-kilomètres, pas sur les taux", () => {
    // Moyenner des pourcentages donnerait le même poids à un train complet
    // sur 10 km qu'à un train vide sur 600 km. Ici, 1 000 sur 61 000.
    const cumul = aggregateLoadFactor([
      { seatKmOffered: 1_000, seatKmSold: 1_000 },
      { seatKmOffered: 60_000, seatKmSold: 0 },
    ])
    expect(cumul.pct).toBeCloseTo(1.64, 1)
  })

  it("cumule à zéro sans desserte", () => {
    expect(aggregateLoadFactor([]).pct).toBe(0)
  })
})

describe("écarts de caisse", () => {
  it("distingue le net du brut", () => {
    // Net nul mais brut élevé : deux erreurs de comptage qui se compensent.
    // Un seul des deux chiffres masquerait complètement le problème.
    const r = summarizeVariances([
      { varianceXaf: 5_000 },
      { varianceXaf: -5_000 },
      { varianceXaf: 0 },
    ])
    expect(r.netXaf).toBe(0)
    expect(r.grossXaf).toBe(10_000)
    expect(r.withVarianceCount).toBe(2)
    expect(r.sessionCount).toBe(3)
  })

  it("retient le plus gros écart avec son signe", () => {
    const r = summarizeVariances([
      { varianceXaf: 1_200 },
      { varianceXaf: -8_400 },
    ])
    expect(r.worstXaf).toBe(-8_400)
  })

  it("traite une session sans écart déclaré comme un écart nul", () => {
    const r = summarizeVariances([{}, { varianceXaf: 300 }])
    expect(r.withVarianceCount).toBe(1)
    expect(r.grossXaf).toBe(300)
  })

  it("ne signale rien sur un ensemble vide", () => {
    expect(summarizeVariances([])).toMatchObject({
      sessionCount: 0,
      withVarianceCount: 0,
      netXaf: 0,
      grossXaf: 0,
      worstXaf: 0,
    })
  })
})
