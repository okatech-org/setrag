import { describe, expect, it } from "vitest"
import {
  BAGGAGE_MAX_WEIGHT_KG,
  BAGGAGE_REGISTRATION_LONG_HT,
  BAGGAGE_REGISTRATION_SHORT_HT,
  PARCEL_MAX_UNIT_WEIGHT_KG,
  SUBSCRIPTION_COEFFICIENTS,
  SUBSCRIPTION_FACTORS,
  baggageRegistrationFeeHt,
  bestDiscount,
  chargeableDistance,
  computeSubscriptionFare,
  computeTicketFare,
  findFareBase,
  groupDiscountPct,
  isChildAge,
  parcelWeightTier,
  parcelZone,
  ratePerKm,
  roundFare,
  roundingStep,
  subscriptionCoefficient,
  type Discount,
  type FareSchedule,
} from "./fares"

/**
 * Grille de référence reprenant EXACTEMENT les taux de l'annexe 2 du CDC
 * « Projet billettique SETRAG ». Toute divergence entre ces valeurs et un
 * calcul du moteur est un défaut de conformité réglementaire.
 */
const GRILLE_CDC: FareSchedule = {
  taxes: { vatPct: 18, cssPct: 0 },
  bases: [
    // EXPRESS — annexe 2 §1.1.1.1.1
    {
      trainType: "EXPRESS",
      serviceClass: "VIP",
      shortDistanceRate: 72.38,
      longDistanceRate: 62.16,
    },
    {
      trainType: "EXPRESS",
      serviceClass: "PREMIERE",
      shortDistanceRate: 60.1,
      longDistanceRate: 54.93,
    },
    {
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 47.51,
      longDistanceRate: 43.42,
    },
    // OMNIBUS
    {
      trainType: "OMNIBUS",
      serviceClass: "PREMIERE",
      shortDistanceRate: 46.93,
      longDistanceRate: 42.89,
    },
    {
      trainType: "OMNIBUS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 37.54,
      longDistanceRate: 34.31,
    },
    // AUTORAIL
    {
      trainType: "AUTORAIL",
      serviceClass: "PREMIERE",
      shortDistanceRate: 60.1,
      longDistanceRate: 54.93,
    },
    {
      trainType: "AUTORAIL",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 37.54,
      longDistanceRate: 34.31,
    },
  ],
}

/** Grille sans taxe, pour isoler le calcul du barème de la fiscalité. */
const GRILLE_SANS_TAXE: FareSchedule = {
  ...GRILLE_CDC,
  taxes: { vatPct: 0, cssPct: 0 },
}

/* ═════════════════════════ Arrondis réglementaires ═══════════════════════ */

describe("roundingStep — paliers d'arrondi de l'annexe 2 §9.8.2", () => {
  it("applique 10 F de 0 à 99 km", () => {
    expect(roundingStep(0)).toBe(10)
    expect(roundingStep(40)).toBe(10)
    expect(roundingStep(99)).toBe(10)
    expect(roundingStep(99.9)).toBe(10)
  })

  it("applique 50 F de 100 à 299 km", () => {
    expect(roundingStep(100)).toBe(50)
    expect(roundingStep(175)).toBe(50)
    expect(roundingStep(299)).toBe(50)
    expect(roundingStep(299.9)).toBe(50)
  })

  it("applique 100 F à partir de 300 km", () => {
    expect(roundingStep(300)).toBe(100)
    expect(roundingStep(648)).toBe(100)
    expect(roundingStep(999)).toBe(100)
  })

  it("refuse une distance négative ou non numérique", () => {
    expect(() => roundingStep(-1)).toThrow(RangeError)
    expect(() => roundingStep(Number.NaN)).toThrow(RangeError)
    expect(() => roundingStep(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe("roundFare — arrondi au plus proche", () => {
  it("arrondit au pas de 10 F sur courte distance", () => {
    expect(roundFare(1904, 40)).toBe(1900)
    expect(roundFare(1906, 40)).toBe(1910)
  })

  it("arrondit au pas de 50 F sur moyenne distance", () => {
    expect(roundFare(6004.25, 175)).toBe(6000)
    expect(roundFare(6030, 175)).toBe(6050)
  })

  it("arrondit au pas de 100 F sur longue distance", () => {
    expect(roundFare(28136.16, 648)).toBe(28100)
    expect(roundFare(28150, 648)).toBe(28200)
  })

  it("arrondit vers le haut à mi-chemin exact", () => {
    // Choix documenté : Math.round, pour ne pas éroder la recette.
    expect(roundFare(1905, 40)).toBe(1910)
    expect(roundFare(25, 40)).toBe(30)
  })

  it("laisse inchangé un montant déjà au pas", () => {
    expect(roundFare(28100, 648)).toBe(28100)
    expect(roundFare(0, 10)).toBe(0)
  })
})

/* ═════════════════════════ Sélection du taux ═════════════════════════════ */

describe("ratePerKm — bascule au seuil de 100 km", () => {
  it("retient le taux court en dessous de 100 km", () => {
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "DEUXIEME", 99)).toBe(47.51)
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "VIP", 0)).toBe(72.38)
    expect(ratePerKm(GRILLE_CDC, "OMNIBUS", "DEUXIEME", 50)).toBe(37.54)
  })

  it("retient le taux long à partir de 100 km exactement", () => {
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "DEUXIEME", 100)).toBe(43.42)
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "VIP", 648)).toBe(62.16)
    expect(ratePerKm(GRILLE_CDC, "OMNIBUS", "PREMIERE", 300)).toBe(42.89)
  })

  it("couvre les trois classes de l'EXPRESS", () => {
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "VIP", 50)).toBe(72.38)
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "PREMIERE", 50)).toBe(60.1)
    expect(ratePerKm(GRILLE_CDC, "EXPRESS", "DEUXIEME", 50)).toBe(47.51)
  })

  it("refuse une combinaison non commercialisée plutôt que d'inventer un prix", () => {
    // L'OMNIBUS n'a pas de classe VIP dans le barème officiel.
    expect(() => ratePerKm(GRILLE_CDC, "OMNIBUS", "VIP", 100)).toThrow(
      /Aucune base kilométrique/,
    )
    expect(() => findFareBase(GRILLE_CDC, "SPECIAL", "DEUXIEME")).toThrow()
  })
})

/* ═════════════════ Prix du billet — cas réels du réseau ══════════════════ */

describe("computeTicketFare — trajets réels du Transgabonais", () => {
  it("Owendo → Franceville en EXPRESS 2e classe (648 km)", () => {
    const r = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
    })
    // 648 × 43,42 = 28 136,16 → arrondi au 100 F le plus proche
    expect(r.ratePerKm).toBe(43.42)
    expect(r.grossAmount).toBeCloseTo(28136.16, 2)
    expect(r.roundingStep).toBe(100)
    expect(r.ttc).toBe(28100)
  })

  it("Owendo → Ndjolé en OMNIBUS 2e classe (175 km)", () => {
    const r = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "OMNIBUS",
      serviceClass: "DEUXIEME",
      distanceKm: 175,
    })
    // 175 × 34,31 = 6 004,25 → arrondi au 50 F le plus proche
    expect(r.grossAmount).toBeCloseTo(6004.25, 2)
    expect(r.roundingStep).toBe(50)
    expect(r.ttc).toBe(6000)
  })

  it("Owendo → Ntoum en EXPRESS 2e classe (40 km, courte distance)", () => {
    const r = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 40,
    })
    // 40 × 47,51 = 1 900,40 → arrondi au 10 F le plus proche
    expect(r.ratePerKm).toBe(47.51)
    expect(r.grossAmount).toBeCloseTo(1900.4, 2)
    expect(r.roundingStep).toBe(10)
    expect(r.ttc).toBe(1900)
  })

  it("Owendo → Franceville en VIP coûte plus cher qu'en 1re, elle-même plus chère qu'en 2e", () => {
    const prix = (serviceClass: "VIP" | "PREMIERE" | "DEUXIEME") =>
      computeTicketFare({
        schedule: GRILLE_SANS_TAXE,
        trainType: "EXPRESS",
        serviceClass,
        distanceKm: 648,
      }).ttc
    expect(prix("VIP")).toBeGreaterThan(prix("PREMIERE"))
    expect(prix("PREMIERE")).toBeGreaterThan(prix("DEUXIEME"))
  })

  it("est monotone à l'intérieur de chaque palier de taux", () => {
    const prix = (km: number) =>
      computeTicketFare({
        schedule: GRILLE_SANS_TAXE,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: km,
      }).ttc

    // Palier court : 1 à 99 km.
    let precedent = -1
    for (let km = 1; km <= 99; km += 1) {
      expect(prix(km)).toBeGreaterThanOrEqual(precedent)
      precedent = prix(km)
    }
    // Palier long : 100 km et au-delà.
    precedent = -1
    for (let km = 100; km <= 700; km += 1) {
      expect(prix(km)).toBeGreaterThanOrEqual(precedent)
      precedent = prix(km)
    }
  })

  /**
   * ANOMALIE DE BARÈME — comportement volontairement figé.
   *
   * Le taux long (43,42 F/km) est inférieur au taux court (47,51 F/km) et
   * s'applique dès 100 km : un trajet de 100 km coûte donc MOINS cher qu'un
   * trajet de 99 km. L'inversion atteint 350 XAF et se résorbe à 108 km.
   *
   * Ce n'est pas un défaut du moteur mais une propriété du barème de
   * l'annexe 2 appliqué à la distance réelle. Elle disparaîtrait si les
   * distances étaient regroupées en paliers facturables, ce que le CDC
   * suggère (« la moyenne de palier de distance ») sans fournir la table.
   *
   * Ce test existe pour que personne ne « corrige » silencieusement le
   * moteur : tant que la table de paliers n'est pas fournie par SETRAG, le
   * comportement conforme au texte est celui-ci.
   */
  it("reproduit fidèlement l'inversion de prix du barème au seuil de 100 km", () => {
    const prix = (km: number) =>
      computeTicketFare({
        schedule: GRILLE_SANS_TAXE,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: km,
      }).ttc

    expect(prix(99)).toBe(4700)
    expect(prix(100)).toBe(4350)
    expect(prix(100)).toBeLessThan(prix(99))
    expect(prix(99) - prix(100)).toBe(350)

    // L'inversion couvre 100 à 107 km et se résorbe à 108 km.
    for (let km = 100; km <= 107; km += 1) {
      expect(prix(km)).toBeLessThan(prix(99))
    }
    expect(prix(108)).toBeGreaterThanOrEqual(prix(99))
  })

  it("l'inversion disparaît dès qu'une table de paliers est fournie", () => {
    const avecPaliers: FareSchedule = {
      ...GRILLE_SANS_TAXE,
      distanceBrackets: [
        { minKm: 0, maxKm: 99, chargeableKm: 50 },
        { minKm: 100, maxKm: 199, chargeableKm: 150 },
        { minKm: 200, maxKm: 699, chargeableKm: 450 },
      ],
    }
    const prix = (km: number) =>
      computeTicketFare({
        schedule: avecPaliers,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: km,
      }).ttc
    expect(prix(100)).toBeGreaterThan(prix(99))
    expect(prix(200)).toBeGreaterThan(prix(199))
  })

  it("produit toujours un montant multiple du pas d'arrondi", () => {
    for (let km = 1; km <= 700; km += 7) {
      const r = computeTicketFare({
        schedule: GRILLE_SANS_TAXE,
        trainType: "OMNIBUS",
        serviceClass: "DEUXIEME",
        distanceKm: km,
      })
      expect(r.ttc % r.roundingStep).toBe(0)
    }
  })

  it("refuse une distance invalide", () => {
    const base = {
      schedule: GRILLE_CDC,
      trainType: "EXPRESS" as const,
      serviceClass: "DEUXIEME" as const,
    }
    expect(() => computeTicketFare({ ...base, distanceKm: -5 })).toThrow(
      RangeError,
    )
    expect(() =>
      computeTicketFare({ ...base, distanceKm: Number.NaN }),
    ).toThrow(RangeError)
  })
})

/* ═════════════════════════════ Fiscalité ═════════════════════════════════ */

describe("computeTicketFare — ventilation fiscale", () => {
  it("garantit l'identité comptable HT + TVA + CSS = TTC", () => {
    for (let km = 5; km <= 700; km += 13) {
      const r = computeTicketFare({
        schedule: GRILLE_CDC,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: km,
      })
      expect(r.ht + r.vat + r.css).toBeCloseTo(r.ttc, 2)
    }
  })

  it("arrondit le TTC par défaut, car c'est ce que le voyageur paie", () => {
    const r = computeTicketFare({
      schedule: GRILLE_CDC,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
    })
    expect(r.roundingBasis).toBe("TTC")
    expect(r.ttc % 100).toBe(0)
  })

  it("peut arrondir sur le HT si la grille le demande", () => {
    const r = computeTicketFare({
      schedule: { ...GRILLE_CDC, roundingBasis: "HT" },
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
    })
    expect(r.roundingBasis).toBe("HT")
    expect(r.ht % 100).toBe(0)
    expect(r.ht + r.vat + r.css).toBeCloseTo(r.ttc, 2)
  })

  it("applique la CSS en plus de la TVA quand elle est activée", () => {
    const avecCss = computeTicketFare({
      schedule: { ...GRILLE_CDC, taxes: { vatPct: 18, cssPct: 1 } },
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
    })
    expect(avecCss.css).toBeGreaterThan(0)
    expect(avecCss.ht + avecCss.vat + avecCss.css).toBeCloseTo(avecCss.ttc, 2)
  })

  it("sans taxe, le TTC égale le HT", () => {
    const r = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "OMNIBUS",
      serviceClass: "DEUXIEME",
      distanceKm: 175,
    })
    expect(r.vat).toBe(0)
    expect(r.css).toBe(0)
    expect(r.ht).toBe(r.ttc)
  })

  it("refuse un taux de taxe aberrant", () => {
    expect(() =>
      computeTicketFare({
        schedule: { ...GRILLE_CDC, taxes: { vatPct: 150, cssPct: 0 } },
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: 100,
      }),
    ).toThrow(RangeError)
  })
})

/* ═══════════════════════════ Réductions ══════════════════════════════════ */

describe("Réductions de l'annexe 2", () => {
  it("reconnaît la tranche d'âge enfant (4 à 11 ans inclus)", () => {
    expect(isChildAge(3)).toBe(false)
    expect(isChildAge(4)).toBe(true)
    expect(isChildAge(11)).toBe(true)
    expect(isChildAge(12)).toBe(false)
  })

  it("applique les paliers de groupe : −30 % de 10 à 49, −45 % au-delà", () => {
    expect(groupDiscountPct(9)).toBeNull()
    expect(groupDiscountPct(10)).toBe(30)
    expect(groupDiscountPct(49)).toBe(30)
    expect(groupDiscountPct(50)).toBe(45)
    expect(groupDiscountPct(500)).toBe(45)
  })

  it("refuse un effectif de groupe invalide", () => {
    expect(() => groupDiscountPct(-1)).toThrow(RangeError)
    expect(() => groupDiscountPct(2.5)).toThrow(RangeError)
  })

  it("applique −50 % au billet enfant", () => {
    const enfant: Discount = {
      code: "ENFANT",
      ratePct: 50,
      label: "Enfant 4-11 ans",
    }
    const plein = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
    })
    const reduit = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
      discount: enfant,
    })
    expect(reduit.discountCode).toBe("ENFANT")
    expect(reduit.discountPct).toBe(50)
    // 28 136,16 / 2 = 14 068,08 → arrondi au 100 F
    expect(reduit.ttc).toBe(14100)
    expect(reduit.ttc).toBeLessThan(plein.ttc)
  })

  it("applique −10 % au militaire en mission", () => {
    const r = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
      discount: { code: "MILITAIRE", ratePct: 10, label: "Militaire" },
    })
    // 28 136,16 × 0,9 = 25 322,54 → arrondi au 100 F
    expect(r.ttc).toBe(25300)
  })

  it("conserve la trace de la réduction appliquée pour l'audit", () => {
    const r = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "OMNIBUS",
      serviceClass: "DEUXIEME",
      distanceKm: 175,
      discount: { code: "GROUPE", ratePct: 45, label: "Groupe 50+" },
    })
    expect(r.discountCode).toBe("GROUPE")
    expect(r.discountPct).toBe(45)
    expect(r.discountAmount).toBeCloseTo(6004.25 * 0.45, 2)
  })

  it("traite l'absence de réduction comme un taux nul", () => {
    const sans = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 100,
    })
    const nulle = computeTicketFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 100,
      discount: null,
    })
    expect(sans.discountCode).toBeNull()
    expect(sans.discountAmount).toBe(0)
    expect(nulle.ttc).toBe(sans.ttc)
  })

  it("refuse un taux de réduction hors bornes", () => {
    expect(() =>
      computeTicketFare({
        schedule: GRILLE_CDC,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: 100,
        discount: { code: "PROMOTIONNEL", ratePct: 120, label: "Aberrant" },
      }),
    ).toThrow(RangeError)
  })
})

describe("bestDiscount — non-cumul, la plus favorable l'emporte", () => {
  it("retient la réduction la plus élevée", () => {
    const choix = bestDiscount([
      { code: "MILITAIRE", ratePct: 10, label: "Militaire" },
      { code: "ENFANT", ratePct: 50, label: "Enfant" },
      { code: "GROUPE", ratePct: 30, label: "Groupe" },
    ])
    expect(choix?.code).toBe("ENFANT")
  })

  it("retourne null quand aucune réduction n'est éligible", () => {
    expect(bestDiscount([])).toBeNull()
  })

  it("gère le cas d'une réduction unique", () => {
    const seule: Discount = { code: "ETUDIANT", ratePct: 20, label: "Étudiant" }
    expect(bestDiscount([seule])).toEqual(seule)
  })
})

/* ═══════════════════════ Cartes d'abonnement ═════════════════════════════ */

describe("Table des coefficients d'abonnement (annexe 2 §1.1.1.1.4)", () => {
  it("couvre 10 à 999 km sans trou ni chevauchement", () => {
    for (let i = 1; i < SUBSCRIPTION_COEFFICIENTS.length; i += 1) {
      const precedent = SUBSCRIPTION_COEFFICIENTS[i - 1]!
      const courant = SUBSCRIPTION_COEFFICIENTS[i]!
      expect(courant.minKm).toBe(precedent.maxKm + 1)
    }
    expect(SUBSCRIPTION_COEFFICIENTS[0]!.minKm).toBe(10)
    expect(
      SUBSCRIPTION_COEFFICIENTS[SUBSCRIPTION_COEFFICIENTS.length - 1]!.maxKm,
    ).toBe(999)
  })

  it("est strictement décroissante : plus loin, coefficient plus faible", () => {
    for (let i = 1; i < SUBSCRIPTION_COEFFICIENTS.length; i += 1) {
      expect(SUBSCRIPTION_COEFFICIENTS[i]!.coefficient).toBeLessThan(
        SUBSCRIPTION_COEFFICIENTS[i - 1]!.coefficient,
      )
    }
  })

  it("restitue les valeurs exactes du cahier des charges", () => {
    expect(subscriptionCoefficient(10)).toBe(300)
    expect(subscriptionCoefficient(14)).toBe(300)
    expect(subscriptionCoefficient(15)).toBe(234)
    expect(subscriptionCoefficient(85)).toBe(105)
    expect(subscriptionCoefficient(109)).toBe(105)
    expect(subscriptionCoefficient(110)).toBe(102)
    // Tranche 210-219 : le CDC imprime « 210 à 2019 », coquille corrigée.
    expect(subscriptionCoefficient(210)).toBe(77)
    expect(subscriptionCoefficient(219)).toBe(77)
    expect(subscriptionCoefficient(220)).toBe(76)
    // Owendo → Franceville, 648 km : tranche 600-649.
    expect(subscriptionCoefficient(600)).toBe(57)
    expect(subscriptionCoefficient(648)).toBe(57)
    expect(subscriptionCoefficient(649)).toBe(57)
    expect(subscriptionCoefficient(650)).toBe(55)
    expect(subscriptionCoefficient(999)).toBe(46)
  })

  it("retourne null hors du domaine tarifé", () => {
    expect(subscriptionCoefficient(0)).toBeNull()
    expect(subscriptionCoefficient(9)).toBeNull()
    expect(subscriptionCoefficient(1000)).toBeNull()
  })
})

describe("computeSubscriptionFare", () => {
  it("calcule l'abonnement annuel comme billet simple × coefficient", () => {
    const r = computeSubscriptionFare({
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
      kind: "AN",
    })
    expect(r.coefficient).toBe(57)
    expect(r.simpleFareTtc).toBe(28100)
    expect(r.yearlyTtc).toBe(roundFare(28100 * 57, 648))
    expect(r.ttc).toBe(r.yearlyTtc)
  })

  it("applique les décotes de durée : 6 mois −40 %, 3 mois −60 %", () => {
    const commun = {
      schedule: GRILLE_SANS_TAXE,
      trainType: "EXPRESS" as const,
      serviceClass: "DEUXIEME" as const,
      distanceKm: 648,
    }
    const an = computeSubscriptionFare({ ...commun, kind: "AN" })
    const six = computeSubscriptionFare({ ...commun, kind: "SIX_MOIS" })
    const trois = computeSubscriptionFare({ ...commun, kind: "TROIS_MOIS" })

    expect(six.ttc).toBe(roundFare(an.yearlyTtc * 0.6, 648))
    expect(trois.ttc).toBe(roundFare(an.yearlyTtc * 0.4, 648))
    expect(six.ttc).toBeLessThan(an.ttc)
    expect(trois.ttc).toBeLessThan(six.ttc)
  })

  it("réduit le demi-tarif des deux tiers de l'annuel", () => {
    const commun = {
      schedule: GRILLE_SANS_TAXE,
      trainType: "OMNIBUS" as const,
      serviceClass: "DEUXIEME" as const,
      distanceKm: 340,
    }
    const an = computeSubscriptionFare({ ...commun, kind: "AN" })
    const demi = computeSubscriptionFare({ ...commun, kind: "DEMI_TARIF" })
    expect(demi.ttc).toBe(roundFare(an.yearlyTtc / 3, 340))
  })

  it("expose des facteurs de durée cohérents", () => {
    expect(SUBSCRIPTION_FACTORS.AN).toBe(1)
    expect(SUBSCRIPTION_FACTORS.SIX_MOIS).toBeCloseTo(0.6, 10)
    expect(SUBSCRIPTION_FACTORS.TROIS_MOIS).toBeCloseTo(0.4, 10)
    expect(SUBSCRIPTION_FACTORS.DEMI_TARIF).toBeCloseTo(1 / 3, 10)
  })

  it("refuse une distance hors table plutôt que d'inventer un prix", () => {
    expect(() =>
      computeSubscriptionFare({
        schedule: GRILLE_SANS_TAXE,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        distanceKm: 5,
        kind: "AN",
      }),
    ).toThrow(/Aucun coefficient d'abonnement/)
  })
})

/* ═══════════════════════ Bagages et colis ════════════════════════════════ */

describe("Frais d'enregistrement des bagages (annexe 2 §9.8.3)", () => {
  it("facture 490 F HT jusqu'à 190 km", () => {
    expect(baggageRegistrationFeeHt(0)).toBe(BAGGAGE_REGISTRATION_SHORT_HT)
    expect(baggageRegistrationFeeHt(190)).toBe(BAGGAGE_REGISTRATION_SHORT_HT)
  })

  it("facture 700 F HT à partir de 200 km", () => {
    expect(baggageRegistrationFeeHt(200)).toBe(BAGGAGE_REGISTRATION_LONG_HT)
    expect(baggageRegistrationFeeHt(648)).toBe(BAGGAGE_REGISTRATION_LONG_HT)
  })

  it("applique le tarif long dans l'intervalle laissé ouvert par le CDC", () => {
    // Le cahier des charges ne couvre pas 191-199 km : parti pris documenté.
    expect(baggageRegistrationFeeHt(191)).toBe(BAGGAGE_REGISTRATION_LONG_HT)
    expect(baggageRegistrationFeeHt(199)).toBe(BAGGAGE_REGISTRATION_LONG_HT)
  })

  it("plafonne le bagage à 30 kg", () => {
    expect(BAGGAGE_MAX_WEIGHT_KG).toBe(30)
  })
})

describe("Colis express — zones et paliers de poids (annexe 2 §9.8.4)", () => {
  it("classe les distances dans les sept zones", () => {
    expect(parcelZone(0)).toBe(1)
    expect(parcelZone(99)).toBe(1)
    expect(parcelZone(100)).toBe(2)
    expect(parcelZone(340)).toBe(4)
    expect(parcelZone(648)).toBe(7)
    expect(parcelZone(699)).toBe(7)
  })

  it("refuse une distance au-delà du réseau tarifé", () => {
    expect(() => parcelZone(700)).toThrow(/hors des zones colis/)
  })

  it("découpe le poids en tranches de 10 kg", () => {
    expect(parcelWeightTier(1)).toBe(1)
    expect(parcelWeightTier(10)).toBe(1)
    expect(parcelWeightTier(11)).toBe(2)
    expect(parcelWeightTier(20)).toBe(2)
    expect(parcelWeightTier(21)).toBe(3)
    expect(parcelWeightTier(100)).toBe(10)
    expect(parcelWeightTier(500)).toBe(50)
  })

  it("refuse un poids nul ou négatif", () => {
    expect(() => parcelWeightTier(0)).toThrow(RangeError)
    expect(() => parcelWeightTier(-3)).toThrow(RangeError)
  })

  it("rappelle le plafond de poids unitaire du régime colis express", () => {
    expect(PARCEL_MAX_UNIT_WEIGHT_KG).toBe(100)
  })
})

/* ═══════════════════ Paliers de distance facturable ══════════════════════ */

describe("chargeableDistance — paliers de distance", () => {
  it("facture la distance réelle quand aucune table n'est fournie", () => {
    expect(chargeableDistance(GRILLE_CDC, 648)).toBe(648)
    expect(chargeableDistance(GRILLE_CDC, 1)).toBe(1)
  })

  it("facture la moyenne du palier quand une table est fournie", () => {
    const avecPaliers: FareSchedule = {
      ...GRILLE_CDC,
      distanceBrackets: [
        { minKm: 0, maxKm: 99, chargeableKm: 50 },
        { minKm: 100, maxKm: 199, chargeableKm: 150 },
        { minKm: 200, maxKm: 699, chargeableKm: 450 },
      ],
    }
    expect(chargeableDistance(avecPaliers, 40)).toBe(50)
    expect(chargeableDistance(avecPaliers, 175)).toBe(150)
    expect(chargeableDistance(avecPaliers, 648)).toBe(450)
  })

  it("signale une distance non couverte par la table", () => {
    const partielle: FareSchedule = {
      ...GRILLE_CDC,
      distanceBrackets: [{ minKm: 0, maxKm: 99, chargeableKm: 50 }],
    }
    expect(() => chargeableDistance(partielle, 500)).toThrow(
      /Aucune tranche de distance/,
    )
  })

  it("le prix suit le palier, pas la distance réelle", () => {
    const avecPaliers: FareSchedule = {
      ...GRILLE_SANS_TAXE,
      distanceBrackets: [{ minKm: 100, maxKm: 199, chargeableKm: 150 }],
    }
    const a = computeTicketFare({
      schedule: avecPaliers,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 120,
    })
    const b = computeTicketFare({
      schedule: avecPaliers,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 190,
    })
    expect(a.chargeableKm).toBe(150)
    expect(a.ttc).toBe(b.ttc)
  })
})
