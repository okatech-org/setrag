/**
 * Le train et ses voitures, avec les mots du billet.
 *
 * Mêmes libellés que la billetterie (`apps/billetterie-web/src/lib/voyage.ts`)
 * et que le billet imprimé (`convex/lib/libellesBillet.ts`) : le contrôleur dit
 * « Express 201 », comme le billet que le voyageur lui tend, et non le code
 * interne « TR-201 ».
 */

import type { EmbarkedCoach, EmbarkedManifest } from "./offline/types"

const TYPES_TRAIN: Record<string, string> = {
  EXPRESS: "Express",
  OMNIBUS: "Omnibus",
  AUTORAIL: "Autorail",
  SPECIAL: "Train spécial",
}

/** « Express 201 » à partir de EXPRESS et TR-201. */
export function nomTrain(type: string | undefined, numero: string): string {
  return `${TYPES_TRAIN[type ?? ""] ?? "Train"} ${numero.replace(/^[A-Z]+-/, "")}`
}

export function nomDuTrain(manifest: Pick<EmbarkedManifest, "trainType" | "trainNumber">): string {
  return nomTrain(manifest.trainType, manifest.trainNumber)
}

/** « l'Express 201 », « le Train spécial 305 » : le train, avec son article. */
export function leTrain(manifest: Pick<EmbarkedManifest, "trainType" | "trainNumber">): string {
  const nom = nomDuTrain(manifest)
  return /^[AEIOUYH]/i.test(nom) ? `l'${nom}` : `le ${nom}`
}

/**
 * Numéro d'une voiture : « 4 » pour le repère « V4 ».
 *
 * Le référentiel note les voitures « V1 », « V2 »… ; le billet et l'agent
 * disent « voiture 4 ». Un repère sans chiffre est rendu tel quel.
 */
export function numeroVoiture(repere: string): string {
  const chiffres = repere.match(/\d+/)?.[0]
  return chiffres ? String(Number(chiffres)) : repere
}

/** Deux repères désignent-ils la même voiture ? « 4 », « V4 » et « V04 » : oui. */
export function memeVoiture(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return numeroVoiture(a) === numeroVoiture(b)
}

/**
 * Composition de la desserte embarquée.
 *
 * Elle vient du référentiel quand le manifeste la porte. Un manifeste plus
 * ancien ne la porte pas : on reconstitue alors la rame à partir des voitures
 * où un titre a été vendu — incomplète, mais jamais inventée.
 */
export function compositionDe(
  manifest: EmbarkedManifest,
  voituresDesTitres: string[] = []
): EmbarkedCoach[] {
  if (manifest.composition && manifest.composition.length > 0) {
    return manifest.composition
  }
  const reperes = [...new Set(voituresDesTitres.filter(Boolean))].sort(
    (a, b) => Number(numeroVoiture(a)) - Number(numeroVoiture(b))
  )
  return reperes.map((label, index) => ({
    label,
    serviceClass: "",
    position: index + 1,
    rowCount: 0,
    columnCount: 0,
    seatCount: 0,
    standingCapacity: 0,
    seats: [],
  }))
}

/** Voiture de la composition désignée par un repère, quel que soit son format. */
export function voitureDe(
  composition: EmbarkedCoach[],
  repere: string | undefined
): EmbarkedCoach | undefined {
  return composition.find((c) => memeVoiture(c.label, repere))
}
