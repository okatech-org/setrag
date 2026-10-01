/**
 * Tarification à bord, calculée sur les données embarquées.
 *
 * Le contrôleur qui régularise doit encaisser le prix que le serveur
 * facturera, pas une approximation. Le calcul enchaîne donc les fonctions
 * mêmes de la vente serveur (`performSale`), toutes pures et importées du
 * backend :
 *
 *  1. `computeTicketFare` — le barème kilométrique, prix de référence ;
 *  2. `saleYield` puis `quotePrice` — le yield du CDC §7.11 : contingent
 *     tarifaire ouvert le moins cher, règles actives (anticipation, dernière
 *     minute, remplissage, période, canal « bord »), bornes de sécurité.
 *
 * Les données de yield sont figées au téléchargement du manifeste. Les ventes
 * de ce terminal faites depuis sont retranchées localement, dans l'ordre où le
 * serveur les recevra. Un écart reste possible — une vente d'un autre canal
 * entre le téléchargement et la synchronisation, une règle qui expire entre
 * l'encaissement et l'envoi — et il se voit : le serveur recalcule toujours,
 * et l'écran met les deux montants côte à côte.
 */

import {
  computeTicketFare,
  consumeQuota,
  quotePrice,
  saleYield,
  selectQuota,
  type FareSchedule,
  type PricingRuleType,
  type ServiceClass,
  type TrainType,
} from "@workspace/backend/fares"

import type {
  EmbarkedManifest,
  EmbarkedPricing,
  EmbarkedStop,
  LocalSale,
} from "./types"

type Classe = "DEUXIEME" | "PREMIERE" | "VIP"

/** Une vente à bord délivre un titre pour un voyageur. */
const VOYAGEURS_PAR_VENTE = 1

/** Canal de la vente à bord, tel que le serveur l'enregistre. */
const CANAL_BORD = "bord"

export interface RegleAppliquee {
  id: string
  type: PricingRuleType
  threshold?: number
  modifierPct: number
}

export interface OnboardQuote {
  distanceKm: number
  chargeableKm: number
  ratePerKm: number
  /** Prix du barème kilométrique seul, taxes comprises. */
  baremeTtc: number
  /** Prix à encaisser : celui que le serveur recalculera, yield compris. */
  ttc: number
  /**
   * `yield` : barème, contingent, règles et bornes, comme la vente serveur.
   * `bareme` : le manifeste ne porte pas les données de yield (téléchargé
   * avant leur ajout, ou serveur plus ancien) ; le serveur pourra facturer
   * un autre montant.
   */
  methode: "yield" | "bareme"
  /** Contingent tarifaire retenu, s'il y en a un. */
  contingent: { label: string; coefficient: number } | null
  regles: RegleAppliquee[]
  /** Cumul des modificateurs de règles, en pourcentage. */
  modificateurPct: number
  /** Vrai si une borne de sécurité a bridé le prix. */
  borne: boolean
}

/** Reconstitue le barème au format attendu par le calcul du backend. */
function toSchedule(manifest: EmbarkedManifest): FareSchedule | null {
  const fare = manifest.fare
  if (!fare) return null
  return {
    bases: fare.bases.map((b) => ({
      trainType: b.trainType as TrainType,
      serviceClass: b.serviceClass as ServiceClass,
      shortDistanceRate: b.shortDistanceRate,
      longDistanceRate: b.longDistanceRate,
    })),
    roundingBasis: fare.roundingBasis,
    taxes: { vatPct: fare.vatPct, cssPct: fare.cssPct },
  }
}

/** Distance facturable entre deux arrêts, lue sur les points kilométriques. */
export function distanceBetween(
  stops: EmbarkedStop[],
  fromSequence: number,
  toSequence: number
): number {
  const from = stops.find((s) => s.sequence === fromSequence)
  const to = stops.find((s) => s.sequence === toSequence)
  if (!from || !to) throw new Error("Gare non desservie par cette desserte")
  return Math.abs(to.kilometerPoint - from.kilometerPoint)
}

/**
 * Rangs des gares dans la desserte, comptés comme la vente serveur : la
 * position dans la liste des arrêts triée par séquence.
 */
function rangsDesArrets(stops: EmbarkedStop[]) {
  const ordonnes = [...stops].sort((a, b) => a.sequence - b.sequence)
  return {
    deSequence: (sequence: number) =>
      ordonnes.findIndex((s) => s.sequence === sequence),
    deGare: (stationId: string) =>
      ordonnes.findIndex((s) => s.stationId === stationId),
  }
}

/**
 * Ventes de ce terminal que les données de yield embarquées ne comptent pas.
 *
 * Une vente confirmée avant la demande du manifeste y figure déjà. Toutes les
 * autres — en file, en échec (elle sera rejouée), ou confirmées après — n'y
 * figurent pas, alors que le serveur les traitera AVANT la prochaine vente.
 * Elles sont rendues dans l'ordre d'encaissement, qui est l'ordre d'envoi.
 */
export function ventesNonComptees(
  manifest: EmbarkedManifest,
  ventes: readonly LocalSale[]
): LocalSale[] {
  const pricing = manifest.pricing
  if (!pricing) return []
  return ventes
    .filter((vente) => vente.tripId === manifest.tripId)
    .filter(
      (vente) =>
        !(
          vente.state === "sent" &&
          (vente.sentAt === undefined || vente.sentAt < pricing.requestedAt)
        )
    )
    .sort((a, b) => a.soldAt - b.soldAt)
}

/**
 * Données de yield après les ventes locales non comptées : chacune consomme
 * le contingent que la vente serveur lui attribuera (`selectQuota`, le
 * critère même de `performSale`) et charge les segments de son trajet.
 */
function avecVentesLocales(
  pricing: EmbarkedPricing,
  ventes: readonly LocalSale[],
  rangDeGare: (stationId: string) => number
): EmbarkedPricing {
  let quotas = pricing.quotas
  let counters = pricing.counters
  for (const vente of ventes) {
    const places = vente.passengers.length
    const de = rangDeGare(vente.originStationId)
    const a = rangDeGare(vente.destinationStationId)
    if (places < 1 || de === -1 || a <= de) continue

    const retenu = selectQuota(
      quotas.filter((q) => q.serviceClass === vente.serviceClass),
      places
    )
    if (retenu) {
      const { soldCount } = consumeQuota(retenu, places)
      quotas = quotas.map((q) => (q === retenu ? { ...q, soldCount } : q))
    }
    counters = counters.map((c) =>
      c.serviceClass === vente.serviceClass &&
      c.segmentIndex >= de &&
      c.segmentIndex < a
        ? { ...c, sold: c.sold + places }
        : c
    )
  }
  return { ...pricing, quotas, counters }
}

/**
 * Prix d'un trajet restant, dans la classe demandée.
 *
 * Lève plutôt que d'inventer un prix : sans barème embarqué, la vente à bord
 * est impossible et l'agent doit le savoir tout de suite — un tarif approximé
 * deviendrait un écart de caisse inexplicable en fin de tournée.
 *
 * `now` est l'instant de la vente (délai avant départ, validité des règles) ;
 * `ventesLocales`, les ventes de ce terminal, dont celles que le manifeste ne
 * compte pas encore.
 */
export function quoteOnboard(
  manifest: EmbarkedManifest,
  input: {
    fromSequence: number
    toSequence: number
    serviceClass: Classe
  },
  options: { now?: number; ventesLocales?: readonly LocalSale[] } = {}
): OnboardQuote {
  const schedule = toSchedule(manifest)
  if (!schedule) {
    throw new Error(
      "Aucun barème embarqué : mettez le manifeste à jour avant de vendre"
    )
  }
  if (input.toSequence <= input.fromSequence) {
    throw new Error("La destination doit être en aval de la gare de départ")
  }

  const distanceKm = distanceBetween(
    manifest.stops,
    input.fromSequence,
    input.toSequence
  )
  const bareme = computeTicketFare({
    schedule,
    trainType: manifest.trainType as TrainType,
    serviceClass: input.serviceClass,
    distanceKm,
    discount: null,
  })
  const commun = {
    distanceKm: bareme.distanceKm,
    chargeableKm: bareme.chargeableKm,
    ratePerKm: bareme.ratePerKm,
    baremeTtc: bareme.ttc,
  }

  const pricing = manifest.pricing
  if (!pricing) {
    return {
      ...commun,
      ttc: bareme.ttc,
      methode: "bareme",
      contingent: null,
      regles: [],
      modificateurPct: 0,
      borne: false,
    }
  }

  // La vente refuserait une classe sans compteur : autant le dire à bord.
  if (!pricing.counters.some((c) => c.serviceClass === input.serviceClass)) {
    throw new Error("Classe non commercialisée sur cette desserte")
  }

  const rangs = rangsDesArrets(manifest.stops)
  const donnees = avecVentesLocales(
    pricing,
    ventesNonComptees(manifest, options.ventesLocales ?? []),
    rangs.deGare
  )
  const quote = quotePrice({
    basePriceTtc: bareme.ttc,
    distanceKm,
    seatsNeeded: VOYAGEURS_PAR_VENTE,
    ...saleYield({
      tripId: manifest.tripId,
      serviceClass: input.serviceClass,
      fromIndex: rangs.deSequence(input.fromSequence),
      toIndex: rangs.deSequence(input.toSequence),
      departureAt: manifest.departureAt,
      serviceDate: manifest.serviceDate,
      channel: CANAL_BORD,
      now: options.now ?? Date.now(),
      quotas: donnees.quotas,
      rules: donnees.rules,
      counters: donnees.counters,
      bounds: donnees.bounds,
    }),
  })

  return {
    ...commun,
    ttc: quote.unitPriceTtc,
    methode: "yield",
    contingent: quote.quotaLabel
      ? { label: quote.quotaLabel, coefficient: quote.quotaCoefficient }
      : null,
    regles: quote.appliedRules.flatMap((id) => {
      const regle = donnees.rules.find((r) => r.id === id)
      return regle
        ? [
            {
              id,
              type: regle.type,
              threshold: regle.threshold,
              modifierPct: regle.modifierPct,
            },
          ]
        : []
    }),
    modificateurPct: quote.totalModifierPct,
    borne: quote.bounded,
  }
}

/** Libellé d'une règle appliquée, pour l'agent : « dernière minute ». */
export function libelleRegle(regle: RegleAppliquee): string {
  switch (regle.type) {
    case "anticipation":
      return regle.modifierPct > 0 ? "dernière minute" : "anticipation"
    case "remplissage":
      return regle.threshold !== undefined
        ? `remplissage ≥ ${Math.round(regle.threshold * 100)} %`
        : "remplissage"
    case "periode":
      return "jour de circulation"
    case "canal":
      return "vente à bord"
    case "promotion":
      return "promotion"
  }
}

/**
 * Classes vendables à bord : tarifées par le barème embarqué et, quand le
 * manifeste porte les compteurs, commercialisées sur la desserte.
 */
export function availableClasses(manifest: EmbarkedManifest): Classe[] {
  const bases = manifest.fare?.bases ?? []
  const forTrain = bases.filter((b) => b.trainType === manifest.trainType)
  const tarifees = new Set(forTrain.map((b) => b.serviceClass))
  const commercialisees = manifest.pricing
    ? new Set(manifest.pricing.counters.map((c) => c.serviceClass))
    : null
  return (["DEUXIEME", "PREMIERE", "VIP"] as const).filter(
    (c) => tarifees.has(c) && (!commercialisees || commercialisees.has(c))
  )
}
