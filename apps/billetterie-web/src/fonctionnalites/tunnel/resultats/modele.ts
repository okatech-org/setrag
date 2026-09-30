import type { FunctionReturnType } from "convex/server"

import type { api } from "@workspace/backend/generated"

import { heure } from "@/lib/format"
import { CLASSES, type Classe } from "@/lib/voyage"

/**
 * Ce que l'écran des résultats fait des dessertes renvoyées par
 * `trips.search` : trier, filtrer, dire le prix « dès ». Rien n'est calculé
 * ici qui ne vienne du serveur — prix et places sont les siens.
 */

export type Resultat = FunctionReturnType<
  typeof api.functions.trips.search
>[number]

export type Tri = "heure" | "duree" | "prix"
export const TRIS: { value: Tri; label: string }[] = [
  { value: "heure", label: "Heure" },
  { value: "duree", label: "Durée" },
  { value: "prix", label: "Prix" },
]
export function estTri(valeur: string | null | undefined): valeur is Tri {
  return valeur === "heure" || valeur === "duree" || valeur === "prix"
}

export type Creneau = "matin" | "apres-midi" | "soir"
export const CRENEAUX: Creneau[] = ["matin", "apres-midi", "soir"]
export const LIBELLE_CRENEAU: Record<Creneau, string> = {
  matin: "Matin",
  "apres-midi": "Après-midi",
  soir: "Soir",
}
export const DETAIL_CRENEAU: Record<Creneau, string> = {
  matin: "avant 12 h",
  "apres-midi": "12 h – 18 h",
  soir: "après 18 h",
}

/** Créneau d'un départ, à l'heure de Libreville. */
export function creneau(instant: number): Creneau {
  const h = Number(heure(instant).slice(0, 2))
  return h < 12 ? "matin" : h < 18 ? "apres-midi" : "soir"
}

/** Classes où tout le groupe tient, et qui ont un prix. */
export function classesOuvertes(
  resultat: Resultat,
  voyageurs: number
): Classe[] {
  if (resultat.trip.status === "annule") return []
  return CLASSES.filter(
    (classe) =>
      (resultat.availableByClass[classe] ?? 0) >= voyageurs &&
      resultat.prixParClasse[classe] !== undefined
  )
}

/** Prix « dès » : le plus petit total, pour le groupe, parmi les classes ouvertes. */
export function prixDes(resultat: Resultat, voyageurs: number): number | null {
  const prix = classesOuvertes(resultat, voyageurs).map(
    (classe) => resultat.prixParClasse[classe]!.totalTtc
  )
  return prix.length ? Math.min(...prix) : null
}

/** La classe proposée d'office quand on choisit un train : la moins chère. */
export function classeParDefaut(
  resultat: Resultat,
  voyageurs: number
): Classe | null {
  const ouvertes = classesOuvertes(resultat, voyageurs)
  if (!ouvertes.length) return null
  return ouvertes.reduce((a, b) =>
    resultat.prixParClasse[b]!.totalTtc < resultat.prixParClasse[a]!.totalTtc
      ? b
      : a
  )
}

export function trier(
  liste: Resultat[],
  tri: Tri,
  voyageurs: number
): Resultat[] {
  const cle = (r: Resultat) => {
    if (tri === "duree") return r.arrivalAt - r.departureAt
    if (tri === "prix") return prixDes(r, voyageurs) ?? Number.POSITIVE_INFINITY
    return r.departureAt
  }
  return [...liste].sort(
    (a, b) => cle(a) - cle(b) || a.departureAt - b.departureAt
  )
}

/** Filtres des résultats. Une liste vide ne filtre rien. */
export interface Filtres {
  types: string[]
  creneaux: Creneau[]
}
export const SANS_FILTRE: Filtres = { types: [], creneaux: [] }

export function filtrer(liste: Resultat[], filtres: Filtres): Resultat[] {
  return liste.filter(
    (r) =>
      (filtres.types.length === 0 ||
        filtres.types.includes(r.trip.trainType)) &&
      (filtres.creneaux.length === 0 ||
        filtres.creneaux.includes(creneau(r.departureAt)))
  )
}

export function nombreFiltres(filtres: Filtres) {
  return filtres.types.length + filtres.creneaux.length
}

/** Nombre de jours d'une date de circulation à une autre. */
export function joursEntre(debut: string, fin: string): number {
  const jour = (date: string) => {
    const [a, m, j] = date.split("-").map(Number) as [number, number, number]
    return Date.UTC(a, m - 1, j)
  }
  return Math.round((jour(fin) - jour(debut)) / 86_400_000)
}

export function plusTot(a: string, b: string) {
  return a < b ? a : b
}
export function plusTard(a: string, b: string) {
  return a > b ? a : b
}
