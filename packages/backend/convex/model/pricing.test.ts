import { describe, expect, it } from "vitest"
import {
  applicableRules,
  consumeQuota,
  occupancyRate,
  pricingBounds,
  quotePrice,
  releaseQuota,
  remainingInQuota,
  ruleApplies,
  saleYield,
  selectQuota,
  type FareClassQuota,
  type PricingContext,
  type PricingRule,
} from "./pricing"

/** Contingents type d'une desserte, du moins cher au plus cher. */
const QUOTAS: FareClassQuota[] = [
  {
    label: "Bas prix",
    priority: 1,
    seatCount: 60,
    soldCount: 0,
    coefficient: 0.8,
    isActive: true,
  },
  {
    label: "Standard",
    priority: 2,
    seatCount: 180,
    soldCount: 0,
    coefficient: 1,
    isActive: true,
  },
  {
    label: "Flexible",
    priority: 3,
    seatCount: 80,
    soldCount: 0,
    coefficient: 1.35,
    isActive: true,
  },
]

const CONTEXTE: PricingContext = {
  occupancyRate: 0,
  daysUntilDeparture: 10,
  departureWeekday: 3,
  channel: "guichet",
  now: Date.UTC(2026, 7, 1),
}

/* ═══════════════════ Contingents de classes tarifaires ═══════════════════ */

describe("Contingents — le prix monte par paliers", () => {
  it("sert d'abord le contingent le moins cher", () => {
    const quota = selectQuota(QUOTAS, 1)
    expect(quota?.label).toBe("Bas prix")
    expect(quota?.coefficient).toBe(0.8)
  })

  it("bascule sur le suivant quand le premier est épuisé", () => {
    const epuise = QUOTAS.map((q) =>
      q.label === "Bas prix" ? { ...q, soldCount: 60 } : q,
    )
    expect(selectQuota(epuise, 1)?.label).toBe("Standard")
  })

  it("n'éclate jamais un groupe entre deux contingents", () => {
    // Il ne reste que 5 places bon marché, mais le groupe en demande 10.
    const presqueEpuise = QUOTAS.map((q) =>
      q.label === "Bas prix" ? { ...q, soldCount: 55 } : q,
    )
    const quota = selectQuota(presqueEpuise, 10)
    expect(quota?.label).toBe("Standard")
  })

  it("ignore un contingent désactivé", () => {
    const desactive = QUOTAS.map((q) =>
      q.label === "Bas prix" ? { ...q, isActive: false } : q,
    )
    expect(selectQuota(desactive, 1)?.label).toBe("Standard")
  })

  it("retourne null quand tout est épuisé", () => {
    const complet = QUOTAS.map((q) => ({ ...q, soldCount: q.seatCount }))
    expect(selectQuota(complet, 1)).toBeNull()
  })

  it("compte les places restantes sans jamais passer sous zéro", () => {
    expect(remainingInQuota(QUOTAS[0]!)).toBe(60)
    expect(
      remainingInQuota({ ...QUOTAS[0]!, soldCount: 100 }),
    ).toBe(0)
  })

  it("refuse un effectif absurde", () => {
    expect(() => selectQuota(QUOTAS, 0)).toThrow(RangeError)
    expect(() => selectQuota(QUOTAS, -3)).toThrow(RangeError)
  })
})

describe("Consommation et restitution d'un contingent", () => {
  it("consomme les places demandées", () => {
    const apres = consumeQuota(QUOTAS[0]!, 5)
    expect(apres.soldCount).toBe(5)
    expect(remainingInQuota(apres)).toBe(55)
  })

  it("laisse le contingent d'origine intact", () => {
    consumeQuota(QUOTAS[0]!, 5)
    expect(QUOTAS[0]!.soldCount).toBe(0)
  })

  it("refuse de dépasser la capacité du contingent", () => {
    expect(() => consumeQuota({ ...QUOTAS[0]!, soldCount: 58 }, 5)).toThrow(
      /épuisé/,
    )
  })

  it("autorise exactement la dernière place", () => {
    const apres = consumeQuota({ ...QUOTAS[0]!, soldCount: 59 }, 1)
    expect(remainingInQuota(apres)).toBe(0)
  })

  it("restitue à l'annulation sans créer de places fantômes", () => {
    const vendu = consumeQuota(QUOTAS[0]!, 5)
    expect(releaseQuota(vendu, 5).soldCount).toBe(0)
    expect(releaseQuota(vendu, 50).soldCount).toBe(0)
  })

  it("un cycle vente puis annulation revient à l'état initial", () => {
    const vendu = consumeQuota(QUOTAS[1]!, 12)
    expect(releaseQuota(vendu, 12)).toEqual(QUOTAS[1])
  })
})

describe("occupancyRate", () => {
  it("calcule le taux de remplissage", () => {
    expect(occupancyRate(100, 70)).toBeCloseTo(0.7, 10)
    expect(occupancyRate(100, 0)).toBe(0)
    expect(occupancyRate(100, 100)).toBe(1)
  })

  it("borne le taux entre 0 et 1", () => {
    expect(occupancyRate(100, 150)).toBe(1)
    expect(occupancyRate(100, -10)).toBe(0)
  })

  it("considère une capacité nulle comme pleine", () => {
    expect(occupancyRate(0, 0)).toBe(1)
  })

  it("refuse une capacité négative", () => {
    expect(() => occupancyRate(-5, 0)).toThrow(RangeError)
  })
})

/* ═════════════════════════ Règles de modulation ══════════════════════════ */

describe("Déclenchement des règles", () => {
  const regle = (over: Partial<PricingRule>): PricingRule => ({
    id: "r",
    type: "remplissage",
    modifierPct: 30,
    priority: 10,
    isActive: true,
    ...over,
  })

  it("ignore une règle désactivée", () => {
    expect(
      ruleApplies(regle({ isActive: false, threshold: 0 }), CONTEXTE),
    ).toBe(false)
  })

  it("déclenche au remplissage à partir du seuil", () => {
    const r = regle({ type: "remplissage", threshold: 0.9 })
    expect(ruleApplies(r, { ...CONTEXTE, occupancyRate: 0.89 })).toBe(false)
    expect(ruleApplies(r, { ...CONTEXTE, occupancyRate: 0.9 })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, occupancyRate: 1 })).toBe(true)
  })

  it("applique une remise d'anticipation quand le départ est lointain", () => {
    const r = regle({ type: "anticipation", threshold: 21, modifierPct: -10 })
    expect(ruleApplies(r, { ...CONTEXTE, daysUntilDeparture: 30 })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, daysUntilDeparture: 21 })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, daysUntilDeparture: 20 })).toBe(false)
  })

  it("applique une majoration de dernière minute quand le départ est proche", () => {
    const r = regle({ type: "anticipation", threshold: 2, modifierPct: 10 })
    expect(ruleApplies(r, { ...CONTEXTE, daysUntilDeparture: 1 })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, daysUntilDeparture: 0 })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, daysUntilDeparture: 2 })).toBe(false)
  })

  it("déclenche sur le jour de la semaine", () => {
    const r = regle({ type: "periode", threshold: 5, modifierPct: 20 })
    expect(ruleApplies(r, { ...CONTEXTE, departureWeekday: 5 })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, departureWeekday: 4 })).toBe(false)
  })

  it("déclenche sur le canal de vente", () => {
    const r = regle({ type: "canal", code: "bord", modifierPct: 25 })
    expect(ruleApplies(r, { ...CONTEXTE, channel: "bord" })).toBe(true)
    expect(ruleApplies(r, { ...CONTEXTE, channel: "guichet" })).toBe(false)
  })

  it("applique une promotion sans code à tout le monde", () => {
    const r = regle({ type: "promotion", modifierPct: -25, code: undefined })
    expect(ruleApplies(r, CONTEXTE)).toBe(true)
  })

  it("réserve une promotion à code à ceux qui le présentent", () => {
    const r = regle({ type: "promotion", modifierPct: -25, code: "RENTREE" })
    expect(ruleApplies(r, CONTEXTE)).toBe(false)
    expect(ruleApplies(r, { ...CONTEXTE, promoCode: "RENTREE" })).toBe(true)
  })

  it("respecte la période de validité de la règle", () => {
    const r = regle({
      type: "promotion",
      modifierPct: -25,
      validFrom: Date.UTC(2026, 8, 1),
      validUntil: Date.UTC(2026, 8, 30),
    })
    expect(ruleApplies(r, { ...CONTEXTE, now: Date.UTC(2026, 7, 15) })).toBe(
      false,
    )
    expect(ruleApplies(r, { ...CONTEXTE, now: Date.UTC(2026, 8, 15) })).toBe(
      true,
    )
    expect(ruleApplies(r, { ...CONTEXTE, now: Date.UTC(2026, 9, 15) })).toBe(
      false,
    )
  })

  it("ignore une règle de seuil sans seuil déclaré", () => {
    expect(
      ruleApplies(regle({ type: "remplissage", threshold: undefined }), CONTEXTE),
    ).toBe(false)
    expect(
      ruleApplies(
        regle({ type: "anticipation", threshold: undefined }),
        CONTEXTE,
      ),
    ).toBe(false)
  })

  it("ordonne les règles applicables par priorité", () => {
    const regles: PricingRule[] = [
      regle({ id: "c", priority: 30, threshold: 0 }),
      regle({ id: "a", priority: 10, threshold: 0 }),
      regle({ id: "b", priority: 20, threshold: 0 }),
    ]
    expect(applicableRules(regles, CONTEXTE).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })
})

/* ═══════════════════════════ Calcul complet ══════════════════════════════ */

describe("quotePrice — chaîne complète", () => {
  const base = {
    basePriceTtc: 28100,
    distanceKm: 648,
    seatsNeeded: 1,
    rules: [] as PricingRule[],
    context: CONTEXTE,
  }

  it("retourne le prix de référence sans contingent ni règle", () => {
    const q = quotePrice(base)
    expect(q.unitPriceTtc).toBe(28100)
    expect(q.quotaLabel).toBeNull()
    expect(q.quotaCoefficient).toBe(1)
    expect(q.appliedRules).toEqual([])
  })

  it("applique le coefficient du contingent retenu", () => {
    const q = quotePrice({ ...base, quotas: QUOTAS })
    expect(q.quotaLabel).toBe("Bas prix")
    // 28 100 × 0,8 = 22 480 → arrondi au 100 F
    expect(q.unitPriceTtc).toBe(22500)
  })

  it("le prix monte quand le contingent bon marché est épuisé", () => {
    const basPrix = quotePrice({ ...base, quotas: QUOTAS }).unitPriceTtc
    const standard = quotePrice({
      ...base,
      quotas: QUOTAS.map((q) =>
        q.label === "Bas prix" ? { ...q, soldCount: 60 } : q,
      ),
    }).unitPriceTtc
    const flexible = quotePrice({
      ...base,
      quotas: QUOTAS.map((q) =>
        q.label === "Flexible" ? q : { ...q, soldCount: q.seatCount },
      ),
    }).unitPriceTtc

    expect(basPrix).toBeLessThan(standard)
    expect(standard).toBeLessThan(flexible)
  })

  it("cumule les modificateurs par addition, pas par composition", () => {
    const regles: PricingRule[] = [
      {
        id: "remplissage",
        type: "remplissage",
        threshold: 0.9,
        modifierPct: 30,
        priority: 10,
        isActive: true,
      },
      {
        id: "vendredi",
        type: "periode",
        threshold: 5,
        modifierPct: 20,
        priority: 20,
        isActive: true,
      },
    ]
    const q = quotePrice({
      ...base,
      rules: regles,
      context: { ...CONTEXTE, occupancyRate: 0.95, departureWeekday: 5 },
    })
    expect(q.totalModifierPct).toBe(50)
    expect(q.appliedRules).toEqual(["remplissage", "vendredi"])
    // 28 100 × 1,5 = 42 150 → arrondi au 100 F
    expect(q.unitPriceTtc).toBe(42200)
  })

  it("combine contingent et règles dans le bon ordre", () => {
    const regles: PricingRule[] = [
      {
        id: "anticipation",
        type: "anticipation",
        threshold: 21,
        modifierPct: -10,
        priority: 10,
        isActive: true,
      },
    ]
    const q = quotePrice({
      ...base,
      quotas: QUOTAS,
      rules: regles,
      context: { ...CONTEXTE, daysUntilDeparture: 30 },
    })
    // 28 100 × 0,8 = 22 480, puis −10 % = 20 232 → arrondi au 100 F
    expect(q.unitPriceTtc).toBe(20200)
  })

  it("bride le résultat au plafond et le signale", () => {
    const regles: PricingRule[] = [
      {
        id: "flambee",
        type: "remplissage",
        threshold: 0.5,
        modifierPct: 90,
        priority: 10,
        isActive: true,
      },
    ]
    const q = quotePrice({
      ...base,
      rules: regles,
      capXaf: 40000,
      context: { ...CONTEXTE, occupancyRate: 0.95 },
    })
    expect(q.bounded).toBe(true)
    expect(q.unitPriceTtc).toBe(40000)
  })

  it("relève le résultat au plancher et le signale", () => {
    const regles: PricingRule[] = [
      {
        id: "brade",
        type: "promotion",
        modifierPct: -90,
        priority: 10,
        isActive: true,
      },
    ]
    const q = quotePrice({ ...base, rules: regles, floorXaf: 18000 })
    expect(q.bounded).toBe(true)
    expect(q.unitPriceTtc).toBe(18000)
  })

  it("ne produit jamais un prix négatif, même avec des remises cumulées", () => {
    const regles: PricingRule[] = [
      {
        id: "a",
        type: "promotion",
        modifierPct: -80,
        priority: 10,
        isActive: true,
      },
      {
        id: "b",
        type: "canal",
        code: "guichet",
        modifierPct: -50,
        priority: 20,
        isActive: true,
      },
    ]
    const q = quotePrice({ ...base, rules: regles })
    expect(q.totalModifierPct).toBe(-130)
    expect(q.unitPriceTtc).toBe(0)
  })

  it("produit toujours un montant au pas d'arrondi réglementaire", () => {
    for (let occupancy = 0; occupancy <= 1; occupancy += 0.05) {
      const q = quotePrice({
        ...base,
        quotas: QUOTAS,
        rules: [
          {
            id: "r",
            type: "remplissage",
            threshold: 0.5,
            modifierPct: 17,
            priority: 10,
            isActive: true,
          },
        ],
        context: { ...CONTEXTE, occupancyRate: occupancy },
      })
      expect(q.unitPriceTtc % 100).toBe(0)
    }
  })

  it("conserve la trace des règles appliquées pour l'audit", () => {
    const q = quotePrice({
      ...base,
      quotas: QUOTAS,
      rules: [
        {
          id: "regle-anticipation-21j",
          type: "anticipation",
          threshold: 21,
          modifierPct: -10,
          priority: 10,
          isActive: true,
        },
      ],
      context: { ...CONTEXTE, daysUntilDeparture: 30 },
    })
    expect(q.appliedRules).toEqual(["regle-anticipation-21j"])
    expect(q.quotaLabel).toBe("Bas prix")
    expect(q.basePriceTtc).toBe(28100)
  })

  it("refuse un prix de référence invalide", () => {
    expect(() => quotePrice({ ...base, basePriceTtc: -1 })).toThrow(RangeError)
    expect(() => quotePrice({ ...base, basePriceTtc: Number.NaN })).toThrow(
      RangeError,
    )
  })

  it("le prix reste monotone avec le remplissage", () => {
    const regles: PricingRule[] = [
      {
        id: "p1",
        type: "remplissage",
        threshold: 0.7,
        modifierPct: 15,
        priority: 10,
        isActive: true,
      },
      {
        id: "p2",
        type: "remplissage",
        threshold: 0.9,
        modifierPct: 15,
        priority: 20,
        isActive: true,
      },
    ]
    let precedent = -1
    for (const taux of [0, 0.5, 0.7, 0.85, 0.9, 1]) {
      const prix = quotePrice({
        ...base,
        rules: regles,
        context: { ...CONTEXTE, occupancyRate: taux },
      }).unitPriceTtc
      expect(prix).toBeGreaterThanOrEqual(precedent)
      precedent = prix
    }
  })
})

describe("Contexte de yield d'une vente", () => {
  const BASE = {
    tripId: "t1",
    serviceClass: "DEUXIEME",
    fromIndex: 1,
    toIndex: 3,
    departureAt: Date.parse("2026-10-01T07:00:00Z"),
    // Un jeudi.
    serviceDate: "2026-10-01",
    channel: "bord",
    now: Date.parse("2026-10-01T12:00:00Z"),
    bounds: { floorXaf: 2000, capXaf: 150_000 },
  }

  it("ne retient que les contingents de la classe vendue", () => {
    const y = saleYield({
      ...BASE,
      quotas: [
        { ...QUOTAS[0]!, serviceClass: "DEUXIEME" },
        { ...QUOTAS[0]!, label: "VIP bas prix", serviceClass: "VIP" },
      ],
      rules: [],
      counters: [],
    })
    expect(y.quotas?.map((q) => q.label)).toEqual(["Bas prix"])
  })

  it("garde les règles du réseau et de la desserte, pour la classe vendue", () => {
    const regle = {
      type: "remplissage" as const,
      threshold: 0.5,
      modifierPct: 10,
      priority: 1,
      isActive: true,
    }
    const y = saleYield({
      ...BASE,
      quotas: [],
      rules: [
        { ...regle, id: "reseau" },
        { ...regle, id: "desserte", tripId: "t1" },
        { ...regle, id: "autre-desserte", tripId: "t2" },
        { ...regle, id: "classe", serviceClass: "DEUXIEME" },
        { ...regle, id: "autre-classe", serviceClass: "VIP" },
      ],
      counters: [],
    })
    expect(y.rules.map((r) => r.id)).toEqual(["reseau", "desserte", "classe"])
  })

  it("mesure le remplissage sur le segment le plus chargé du tronçon", () => {
    const y = saleYield({
      ...BASE,
      quotas: [],
      rules: [],
      counters: [
        { serviceClass: "DEUXIEME", segmentIndex: 0, capacity: 10, sold: 10 },
        { serviceClass: "DEUXIEME", segmentIndex: 1, capacity: 10, sold: 4 },
        { serviceClass: "DEUXIEME", segmentIndex: 2, capacity: 10, sold: 7 },
        { serviceClass: "DEUXIEME", segmentIndex: 3, capacity: 10, sold: 9 },
        { serviceClass: "VIP", segmentIndex: 1, capacity: 10, sold: 10 },
      ],
    })
    expect(y.context.occupancyRate).toBe(0.7)
  })

  it("porte le canal, le délai avant départ, le jour de circulation et les bornes", () => {
    const y = saleYield({ ...BASE, quotas: [], rules: [], counters: [] })
    expect(y.context.channel).toBe("bord")
    // Train parti depuis cinq heures : le délai est négatif.
    expect(y.context.daysUntilDeparture).toBe(-1)
    expect(y.context.departureWeekday).toBe(4)
    expect([y.floorXaf, y.capXaf]).toEqual([2000, 150_000])
  })
})

describe("Bornes de sécurité", () => {
  it("prend celles de la règle la plus prioritaire qui en déclare", () => {
    expect(
      pricingBounds([
        { priority: 30, floorXaf: 1000 },
        { priority: 5 },
        { priority: 10, floorXaf: 2000, capXaf: 90_000 },
      ])
    ).toEqual({ floorXaf: 2000, capXaf: 90_000 })
  })

  it("n'en impose aucune quand aucune règle n'en déclare", () => {
    expect(pricingBounds([{ priority: 1 }])).toEqual({
      floorXaf: undefined,
      capXaf: undefined,
    })
  })
})
