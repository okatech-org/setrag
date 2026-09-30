/**
 * Où en est le train : la dernière gare atteinte.
 *
 * C'est d'elle que dépend le verdict « hors segment » : un titre Owendo →
 * Lopé est valide avant Lopé, pas après. Le terminal n'a pas de position GPS
 * fiable dans la forêt ; il PROPOSE donc la gare d'après l'horaire embarqué,
 * et l'agent la CONFIRME d'un geste. Rien n'avance sans lui.
 */

import type { EmbarkedManifest, EmbarkedStop } from "./offline/types"

/** Heure de passage d'un arrêt : départ, à défaut arrivée (terminus). */
export function heurePassage(stop: EmbarkedStop): number | undefined {
  return stop.departureAt ?? stop.arrivalAt
}

export function arretsOrdonnes(manifest: EmbarkedManifest): EmbarkedStop[] {
  return [...manifest.stops].sort((a, b) => a.sequence - b.sequence)
}

export function arretDeRang(
  manifest: EmbarkedManifest,
  sequence: number
): EmbarkedStop | undefined {
  return manifest.stops.find((s) => s.sequence === sequence)
}

/**
 * Gare que l'horaire donne pour atteinte à l'instant dit : la dernière dont
 * l'heure de passage est échue. Avant le départ, la gare d'origine.
 *
 * Le train peut avoir du retard : c'est pourquoi la proposition n'est jamais
 * appliquée d'office.
 */
export function gareProposee(
  manifest: EmbarkedManifest,
  maintenant: number
): EmbarkedStop | undefined {
  const arrets = arretsOrdonnes(manifest)
  let atteinte = arrets[0]
  for (const arret of arrets) {
    const passage = heurePassage(arret)
    if (passage !== undefined && passage <= maintenant) atteinte = arret
  }
  return atteinte
}

/**
 * Faut-il proposer d'avancer ? Seulement si l'horaire place le train au-delà
 * de la gare confirmée : on ne propose jamais de reculer, ce serait rendre
 * valides des titres déjà dépassés.
 */
export function avancementPropose(
  manifest: EmbarkedManifest,
  gareConfirmee: number,
  maintenant: number
): EmbarkedStop | undefined {
  const proposee = gareProposee(manifest, maintenant)
  return proposee && proposee.sequence > gareConfirmee ? proposee : undefined
}

/**
 * Part du trajet parcourue à une gare, lue sur les points kilométriques
 * (0 → 1). L'Omnibus 202 roule vers Owendo : ses PK décroissent, d'où la
 * valeur absolue.
 */
export function progressionA(manifest: EmbarkedManifest, sequence: number): number {
  const arrets = arretsOrdonnes(manifest)
  const premier = arrets[0]
  const dernier = arrets[arrets.length - 1]
  const ici = arretDeRang(manifest, sequence)
  if (!premier || !dernier || !ici) return 0
  const total = Math.abs(dernier.kilometerPoint - premier.kilometerPoint)
  if (total === 0) return 0
  const fait = Math.abs(ici.kilometerPoint - premier.kilometerPoint)
  return Math.min(1, Math.max(0, fait / total))
}

/**
 * Gares repères, en gras sur la voie — les mêmes que la billetterie. Un
 * choix de lisibilité, pas une donnée d'exploitation.
 */
export const GARES_REPERES = new Set(["OWE", "NDJ", "BOO", "LTV", "FCV"])
