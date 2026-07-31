/**
 * Tarification à bord, calculée sur le barème embarqué.
 *
 * Le contrôleur qui régularise doit annoncer le prix du guichet, pas une
 * approximation. Le calcul réutilise donc `computeTicketFare` du backend —
 * logique pure, sans dépendance Convex — appliqué au barème descendu avec le
 * manifeste. Le serveur recalculera à la synchronisation : tout écart devient
 * alors visible plutôt que silencieux.
 */

import {
  computeTicketFare,
  type FareSchedule,
  type ServiceClass,
  type TrainType,
} from "@workspace/backend/fares"

import type { EmbarkedManifest, EmbarkedStop } from "./types"

export interface OnboardQuote {
  distanceKm: number
  chargeableKm: number
  ratePerKm: number
  ttc: number
  ht: number
  vat: number
  css: number
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
 * Prix d'un trajet restant, dans la classe demandée.
 *
 * Lève plutôt que d'inventer un prix : sans barème embarqué, la vente à bord
 * est impossible et l'agent doit le savoir tout de suite — un tarif approximé
 * deviendrait un écart de caisse inexplicable en fin de tournée.
 */
export function quoteOnboard(
  manifest: EmbarkedManifest,
  input: {
    fromSequence: number
    toSequence: number
    serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  }
): OnboardQuote {
  const schedule = toSchedule(manifest)
  if (!schedule) {
    throw new Error(
      "Aucun barème embarqué : mettez le manifeste à jour avant de vendre"
    )
  }
  if (input.toSequence <= input.fromSequence) {
    throw new Error(
      "La destination doit être en aval de la gare de départ"
    )
  }

  const distanceKm = distanceBetween(
    manifest.stops,
    input.fromSequence,
    input.toSequence
  )
  const breakdown = computeTicketFare({
    schedule,
    trainType: manifest.trainType as TrainType,
    serviceClass: input.serviceClass,
    distanceKm,
    discount: null,
  })

  return {
    distanceKm: breakdown.distanceKm,
    chargeableKm: breakdown.chargeableKm,
    ratePerKm: breakdown.ratePerKm,
    ttc: breakdown.ttc,
    ht: breakdown.ht,
    vat: breakdown.vat,
    css: breakdown.css,
  }
}

/** Classes réellement tarifées par le barème embarqué. */
export function availableClasses(
  manifest: EmbarkedManifest
): Array<"DEUXIEME" | "PREMIERE" | "VIP"> {
  const bases = manifest.fare?.bases ?? []
  const forTrain = bases.filter((b) => b.trainType === manifest.trainType)
  const classes = new Set(forTrain.map((b) => b.serviceClass))
  return (["DEUXIEME", "PREMIERE", "VIP"] as const).filter((c) =>
    classes.has(c)
  )
}
