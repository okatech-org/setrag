import { describe, expect, it } from "vitest"
import { computeTicketFare } from "@workspace/backend/fares"

import {
  availableClasses,
  distanceBetween,
  libelleRegle,
  quoteOnboard,
  ventesNonComptees,
} from "./fares"
import type { EmbarkedManifest, EmbarkedPricing, LocalSale } from "./types"

/**
 * Le prix annoncé à bord doit être celui du guichet. Ces tests comparent le
 * calcul embarqué au calcul de référence du backend : s'ils divergent, un
 * contrôleur encaisserait un montant que la comptabilité refuserait.
 */

const BASES = [
  {
    trainType: "EXPRESS",
    serviceClass: "DEUXIEME",
    shortDistanceRate: 47.51,
    longDistanceRate: 43.42,
  },
  {
    trainType: "EXPRESS",
    serviceClass: "PREMIERE",
    shortDistanceRate: 71.27,
    longDistanceRate: 65.13,
  },
]

function manifest(fare = true): EmbarkedManifest {
  return {
    tripId: "trip_1",
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    serviceDate: "2026-08-14",
    departureAt: Date.now(),
    originName: "Owendo",
    destinationName: "Franceville",
    segmentCount: 3,
    stops: [
      {
        sequence: 0,
        stationId: "s0",
        code: "OWE",
        name: "Owendo",
        kilometerPoint: 0,
      },
      {
        sequence: 1,
        stationId: "s1",
        code: "NTO",
        name: "Ntoum",
        kilometerPoint: 30,
      },
      {
        sequence: 2,
        stationId: "s2",
        code: "NDJ",
        name: "Ndjolé",
        kilometerPoint: 187,
      },
      {
        sequence: 3,
        stationId: "s3",
        code: "BOO",
        name: "Booué",
        kilometerPoint: 335,
      },
      {
        sequence: 4,
        stationId: "s4",
        code: "LAS",
        name: "Lastoursville",
        kilometerPoint: 464,
      },
      {
        sequence: 5,
        stationId: "s5",
        code: "FCV",
        name: "Franceville",
        kilometerPoint: 648,
      },
    ],
    fare: fare
      ? {
          scheduleId: "sch1",
          label: "Barème 2026",
          validFrom: 0,
          validUntil: Date.now() + 86_400_000,
          roundingBasis: "TTC",
          vatPct: 18,
          cssPct: 1,
          bases: BASES,
        }
      : null,
    penalties: [],
    signing: { publicKey: "00", keyVersion: 1, isDemoKey: true },
    ticketCount: 0,
    downloadedCount: 0,
    cursor: null,
    complete: true,
    updatedAt: Date.now(),
  }
}

describe("Tarification à bord", () => {
  it("donne exactement le prix du barème de référence", () => {
    const attendu = computeTicketFare({
      schedule: {
        bases: BASES as never,
        roundingBasis: "TTC",
        taxes: { vatPct: 18, cssPct: 1 },
      },
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 313,
      discount: null,
    })

    // Booué → Franceville, le trajet restant le plus courant à bord.
    const quote = quoteOnboard(manifest(), {
      fromSequence: 3,
      toSequence: 5,
      serviceClass: "DEUXIEME",
    })
    expect(quote.ttc).toBe(attendu.ttc)
    expect(quote.distanceKm).toBe(313)
  })

  it("applique le taux longue distance au-delà du seuil", () => {
    const court = quoteOnboard(manifest(), {
      fromSequence: 0,
      toSequence: 1,
      serviceClass: "DEUXIEME",
    })
    const long = quoteOnboard(manifest(), {
      fromSequence: 0,
      toSequence: 5,
      serviceClass: "DEUXIEME",
    })
    expect(court.ratePerKm).toBe(47.51)
    expect(long.ratePerKm).toBe(43.42)
  })

  it("refuse un trajet à rebours plutôt que d'inventer un prix", () => {
    expect(() =>
      quoteOnboard(manifest(), {
        fromSequence: 5,
        toSequence: 3,
        serviceClass: "DEUXIEME",
      })
    ).toThrow(/en aval/)
  })

  it("refuse de vendre sans barème embarqué", () => {
    expect(() =>
      quoteOnboard(manifest(false), {
        fromSequence: 0,
        toSequence: 1,
        serviceClass: "DEUXIEME",
      })
    ).toThrow(/barème embarqué/)
  })

  it("n'offre que les classes réellement tarifées", () => {
    expect(availableClasses(manifest())).toEqual(["DEUXIEME", "PREMIERE"])
  })

  it("lit la distance sur les points kilométriques embarqués", () => {
    expect(distanceBetween(manifest().stops, 3, 4)).toBe(129)
  })
})

/* ─────────────── Yield à bord, aligné sur la vente serveur ─────────────── */

/**
 * Miroir de `packages/backend/convex/functions/control.test.ts` (« Tarification
 * à bord, alignée sur la vente ») : même desserte, mêmes contingents, mêmes
 * règles, même suite de prix. Côté serveur, ces prix sont ceux que
 * `performSale` facture ; ici, ceux que le terminal annonce hors ligne.
 */
const SUITE_DES_PRIX = [
  13_900, 13_900, 17_400, 17_400, 17_400, 17_400, 26_700, 26_700,
]

/** Un jeudi midi à Libreville ; l'Express est parti à 8 h. */
const MAINTENANT = Date.parse("2026-10-01T11:00:00Z")
const TELECHARGE_A = MAINTENANT - 60 * 60 * 1000

const CONTINGENTS = [
  { label: "Bas prix", seatCount: 2, coefficient: 0.8, priority: 1 },
  { label: "Standard", seatCount: 4, coefficient: 1, priority: 2 },
  { label: "Flexible", seatCount: 2, coefficient: 1.35, priority: 3 },
]

const REGLES = [
  {
    id: "r-21j",
    type: "anticipation",
    threshold: 21,
    modifierPct: -10,
    priority: 10,
  },
  {
    id: "r-dm",
    type: "anticipation",
    threshold: 2,
    modifierPct: 10,
    priority: 20,
  },
  {
    id: "r-70",
    type: "remplissage",
    threshold: 0.7,
    modifierPct: 15,
    priority: 30,
  },
  {
    id: "r-90",
    type: "remplissage",
    threshold: 0.9,
    modifierPct: 15,
    priority: 40,
  },
  // Le vendredi : sans effet sur cette circulation du jeudi.
  { id: "r-ven", type: "periode", threshold: 5, modifierPct: 20, priority: 50 },
] as const

function donneesDeYield(): EmbarkedPricing {
  return {
    quotas: CONTINGENTS.map((quota) => ({
      ...quota,
      serviceClass: "DEUXIEME",
      soldCount: 0,
      isActive: true,
    })),
    rules: REGLES.map((regle) => ({ ...regle, isActive: true })),
    bounds: { floorXaf: 2000, capXaf: 150_000 },
    counters: [0, 1].map((segmentIndex) => ({
      serviceClass: "DEUXIEME",
      segmentIndex,
      capacity: 8,
      sold: 0,
    })),
    requestedAt: TELECHARGE_A,
  }
}

/** Express 201 en route : Owendo → Booué (PK 340) → Franceville (PK 648). */
function manifesteEnRoute(pricing?: EmbarkedPricing): EmbarkedManifest {
  return {
    tripId: "trip_201",
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    serviceDate: "2026-10-01",
    departureAt: Date.parse("2026-10-01T07:00:00Z"),
    originName: "Owendo",
    destinationName: "Franceville",
    segmentCount: 2,
    stops: [
      {
        sequence: 0,
        stationId: "owe",
        code: "OWE",
        name: "Owendo",
        kilometerPoint: 0,
      },
      {
        sequence: 1,
        stationId: "boo",
        code: "BOO",
        name: "Booué",
        kilometerPoint: 340,
      },
      {
        sequence: 2,
        stationId: "fcv",
        code: "FCV",
        name: "Franceville",
        kilometerPoint: 648,
      },
    ],
    fare: {
      scheduleId: "sch",
      label: "Barème CDC — annexe 2",
      validFrom: 0,
      validUntil: MAINTENANT + 86_400_000,
      roundingBasis: "TTC",
      vatPct: 18,
      cssPct: 0,
      bases: BASES,
    },
    pricing,
    penalties: [],
    signing: { publicKey: "00", keyVersion: 1, isDemoKey: true },
    ticketCount: 0,
    downloadedCount: 0,
    cursor: null,
    complete: true,
    updatedAt: TELECHARGE_A,
  }
}

const BOUE_FRANCEVILLE = {
  fromSequence: 1,
  toSequence: 2,
  serviceClass: "DEUXIEME" as const,
}

function venteLocale(rang: number, etat: Partial<LocalSale> = {}): LocalSale {
  return {
    clientSaleId: `sale-${rang}`,
    tripId: "trip_201",
    originStationId: "boo",
    destinationStationId: "fcv",
    originName: "Booué",
    destinationName: "Franceville",
    serviceClass: "DEUXIEME",
    passengers: [{ lastName: "VOYAGEUR", firstName: `N${rang}`, gender: "M" }],
    distanceKm: 308,
    quotedXaf: 0,
    method: "especes",
    localRef: `B-${rang}`,
    soldAt: MAINTENANT + rang * 60_000,
    state: "pending",
    ...etat,
  }
}

describe("Yield à bord, aligné sur la vente serveur", () => {
  it("Booué → Franceville en 2e : 13 900 encaissés, pas les 15 800 du barème", () => {
    const devis = quoteOnboard(
      manifesteEnRoute(donneesDeYield()),
      BOUE_FRANCEVILLE,
      { now: MAINTENANT }
    )
    expect(devis.methode).toBe("yield")
    expect(devis.distanceKm).toBe(308)
    expect(devis.baremeTtc).toBe(15_800)
    expect(devis.contingent).toEqual({ label: "Bas prix", coefficient: 0.8 })
    expect(devis.regles.map(libelleRegle)).toEqual(["dernière minute"])
    expect(devis.modificateurPct).toBe(10)
    expect(devis.ttc).toBe(13_900)
  })

  it("annonce, vente après vente hors ligne, la suite de prix que le serveur facture", () => {
    const manifeste = manifesteEnRoute(donneesDeYield())
    const ventes: LocalSale[] = []
    const annonces: number[] = []
    for (let rang = 0; rang < SUITE_DES_PRIX.length; rang += 1) {
      const devis = quoteOnboard(manifeste, BOUE_FRANCEVILLE, {
        now: MAINTENANT + rang * 60_000,
        ventesLocales: ventes,
      })
      annonces.push(devis.ttc)
      // Encaissée et mise en file : le manifeste, lui, n'a pas bougé.
      ventes.push(venteLocale(rang, { quotedXaf: devis.ttc }))
    }
    expect(annonces).toEqual(SUITE_DES_PRIX)
  })

  it("ne recompte pas une vente déjà connue du manifeste téléchargé", () => {
    // Manifeste demandé après la confirmation de la première vente : le
    // « Bas prix » y compte déjà une place vendue.
    const pricing = donneesDeYield()
    pricing.quotas[0] = { ...pricing.quotas[0]!, soldCount: 1 }
    pricing.counters = pricing.counters.map((c) => ({ ...c, sold: 1 }))
    const confirmee = venteLocale(0, {
      state: "sent",
      sentAt: TELECHARGE_A - 60_000,
    })

    const devis = quoteOnboard(manifesteEnRoute(pricing), BOUE_FRANCEVILLE, {
      now: MAINTENANT,
      ventesLocales: [confirmee],
    })
    expect(devis.contingent?.label).toBe("Bas prix")
    expect(devis.ttc).toBe(13_900)
  })

  it("compte une vente confirmée après le téléchargement, ou en échec à rejouer", () => {
    const manifeste = manifesteEnRoute(donneesDeYield())
    const ventes = [
      venteLocale(0, { state: "sent", sentAt: TELECHARGE_A + 60_000 }),
      venteLocale(1, { state: "failed" }),
      // Une autre desserte ne pèse pas sur celle-ci.
      venteLocale(2, { tripId: "trip_autre" }),
    ]
    expect(
      ventesNonComptees(manifeste, ventes).map((v) => v.clientSaleId)
    ).toEqual(["sale-0", "sale-1"])

    const devis = quoteOnboard(manifeste, BOUE_FRANCEVILLE, {
      now: MAINTENANT,
      ventesLocales: ventes,
    })
    // Les deux places « Bas prix » sont prises : on passe au « Standard ».
    expect(devis.contingent?.label).toBe("Standard")
    expect(devis.ttc).toBe(17_400)
  })

  it("se rabat sur le barème, et le dit, avec un manifeste sans données de yield", () => {
    const devis = quoteOnboard(manifesteEnRoute(), BOUE_FRANCEVILLE, {
      now: MAINTENANT,
    })
    expect(devis.methode).toBe("bareme")
    expect(devis.ttc).toBe(15_800)
    expect(devis.ttc).toBe(devis.baremeTtc)
  })

  it("ne propose que les classes commercialisées sur la desserte", () => {
    const manifeste = manifesteEnRoute(donneesDeYield())
    expect(availableClasses(manifeste)).toEqual(["DEUXIEME"])
    expect(() =>
      quoteOnboard(
        manifeste,
        { ...BOUE_FRANCEVILLE, serviceClass: "PREMIERE" },
        { now: MAINTENANT }
      )
    ).toThrow(/non commercialisée/)
  })

  it("nomme les règles appliquées pour l'agent", () => {
    expect(
      libelleRegle({
        id: "r",
        type: "remplissage",
        threshold: 0.7,
        modifierPct: 15,
      })
    ).toBe("remplissage ≥ 70 %")
    expect(
      libelleRegle({
        id: "r",
        type: "anticipation",
        threshold: 21,
        modifierPct: -10,
      })
    ).toBe("anticipation")
  })
})
