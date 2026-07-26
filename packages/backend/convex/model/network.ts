/**
 * Réseau ferroviaire — distances, arrêts et segments. Logique pure.
 *
 * Le Transgabonais est une ligne unique d'Owendo (PK 0) à Franceville
 * (PK 648). La distance entre deux gares est donc la différence de leurs
 * points kilométriques, et l'ordre des arrêts d'une desserte détermine les
 * indices de segments utilisés par l'inventaire.
 */

import type { StopRange } from "./inventory"

/** Arrêt d'une desserte, tel qu'il alimente le calcul de distance. */
export interface Stop {
  readonly stationId: string
  readonly sequence: number
  readonly kilometerPoint: number
}

/**
 * Distance commerciale entre deux points kilométriques.
 *
 * La valeur absolue permet de traiter indifféremment un sens ou l'autre :
 * la ligne est parcourue dans les deux sens et le barème est symétrique.
 */
export function distanceBetween(
  originKm: number,
  destinationKm: number,
): number {
  assertKilometerPoint(originKm, "Point kilométrique d'origine")
  assertKilometerPoint(destinationKm, "Point kilométrique de destination")
  return Math.abs(destinationKm - originKm)
}

/**
 * Nombre de segments d'une desserte : un de moins que le nombre d'arrêts.
 * Une desserte à 23 gares compte 22 segments.
 */
export function segmentCountFor(stopCount: number): number {
  if (!Number.isInteger(stopCount) || stopCount < 2) {
    throw new RangeError(
      `Desserte invalide : ${stopCount} arrêt(s), au moins 2 attendus`,
    )
  }
  return stopCount - 1
}

/**
 * Traduit un couple de gares en indices d'arrêts sur une desserte.
 *
 * Lève si l'une des gares n'est pas desservie, ou si elles sont dans le
 * mauvais ordre — vendre Franceville → Owendo sur un train qui descend vers
 * Franceville n'a pas de sens et doit être refusé au guichet.
 */
export function resolveStopRange(
  stops: readonly Stop[],
  originStationId: string,
  destinationStationId: string,
): StopRange {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
  const from = ordered.findIndex((s) => s.stationId === originStationId)
  const to = ordered.findIndex((s) => s.stationId === destinationStationId)

  if (from === -1) {
    throw new Error(`Gare de départ non desservie par cette desserte`)
  }
  if (to === -1) {
    throw new Error(`Gare d'arrivée non desservie par cette desserte`)
  }
  if (to <= from) {
    throw new Error(
      `Sens de circulation incompatible : la gare d'arrivée précède la gare ` +
        `de départ sur cette desserte`,
    )
  }
  return { fromIndex: from, toIndex: to }
}

/** Distance parcourue entre deux arrêts d'une desserte. */
export function distanceForRange(
  stops: readonly Stop[],
  range: StopRange,
): number {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
  const origin = ordered[range.fromIndex]
  const destination = ordered[range.toIndex]
  if (!origin || !destination) {
    throw new RangeError(
      `Arrêts ${range.fromIndex} → ${range.toIndex} hors de la desserte ` +
        `(${ordered.length} arrêt(s))`,
    )
  }
  return distanceBetween(origin.kilometerPoint, destination.kilometerPoint)
}

/**
 * Vérifie qu'une séquence d'arrêts est cohérente : numérotation continue à
 * partir de 0, points kilométriques strictement monotones, pas de doublon
 * de gare. Utilisé à la génération des dessertes depuis un livret horaire.
 */
export function validateStopSequence(stops: readonly Stop[]): void {
  if (stops.length < 2) {
    throw new Error(
      `Desserte invalide : ${stops.length} arrêt(s), au moins 2 attendus`,
    )
  }
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)

  for (let i = 0; i < ordered.length; i += 1) {
    if (ordered[i]!.sequence !== i) {
      throw new Error(
        `Séquence d'arrêts discontinue : rang ${ordered[i]!.sequence} ` +
          `attendu à la position ${i}`,
      )
    }
  }

  const stationIds = new Set(ordered.map((s) => s.stationId))
  if (stationIds.size !== ordered.length) {
    throw new Error(`Une même gare apparaît deux fois dans la desserte`)
  }

  const ascending = ordered[1]!.kilometerPoint > ordered[0]!.kilometerPoint
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]!.kilometerPoint
    const current = ordered[i]!.kilometerPoint
    if (ascending ? current <= previous : current >= previous) {
      throw new Error(
        `Points kilométriques non monotones entre les arrêts ${i - 1} et ${i} ` +
          `(${previous} puis ${current})`,
      )
    }
  }
}

/** Sens de circulation d'une desserte, déduit de ses points kilométriques. */
export function directionOf(
  stops: readonly Stop[],
): "montant" | "descendant" {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
  if (ordered.length < 2) {
    throw new Error(`Desserte invalide : au moins 2 arrêts attendus`)
  }
  return ordered[ordered.length - 1]!.kilometerPoint >
    ordered[0]!.kilometerPoint
    ? "montant"
    : "descendant"
}

function assertKilometerPoint(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} invalide : ${value}`)
  }
}
