/**
 * Position estimée d’un train sur la ligne, d’après l’horaire de ses arrêts
 * et le retard annoncé. Une estimation d’exploitation, pas un GPS : l’écran
 * le dit.
 */

export interface ArretHoraire {
  km: number
  name: string
  arrivalAt?: number
  departureAt?: number
}

export interface CirculationHoraire {
  status: "planifie" | "a_lheure" | "retarde" | "annule" | "termine"
  delayMinutes: number
  departureAt: number
  arrivalAt: number
  stops: readonly ArretHoraire[]
}

export type EtatCirculation =
  | { etat: "supprime" }
  | { etat: "avant-depart" }
  | { etat: "arrive" }
  | { etat: "en-route"; km: number; sens: "aller" | "retour"; entre: [string, string] | null }

const MINUTE = 60_000

export function estimerPosition(train: CirculationHoraire, maintenant: number): EtatCirculation {
  if (train.status === "annule") return { etat: "supprime" }
  const retard = Math.max(0, train.delayMinutes) * MINUTE
  const arrets = train.stops
  if (arrets.length < 2) return { etat: "avant-depart" }
  const premier = arrets[0]!
  const dernier = arrets[arrets.length - 1]!
  const sens = dernier.km >= premier.km ? "aller" : "retour"
  const depart = (premier.departureAt ?? train.departureAt) + retard
  const arrivee = (dernier.arrivalAt ?? train.arrivalAt) + retard
  if (maintenant < depart) return { etat: "avant-depart" }
  if (maintenant >= arrivee || train.status === "termine") return { etat: "arrive" }

  for (let i = 0; i + 1 < arrets.length; i += 1) {
    const a = arrets[i]!
    const b = arrets[i + 1]!
    const quitte = (a.departureAt ?? a.arrivalAt ?? depart - retard) + retard
    const atteint = (b.arrivalAt ?? b.departureAt ?? arrivee - retard) + retard
    // À quai en gare A (entre son arrivée et son départ).
    const arriveeA = (a.arrivalAt ?? quitte - retard) + retard
    if (maintenant >= arriveeA && maintenant < quitte) {
      return { etat: "en-route", km: a.km, sens, entre: null }
    }
    if (maintenant >= quitte && maintenant < atteint) {
      const part = atteint === quitte ? 0 : (maintenant - quitte) / (atteint - quitte)
      return { etat: "en-route", km: a.km + (b.km - a.km) * part, sens, entre: [a.name, b.name] }
    }
  }
  return { etat: "en-route", km: dernier.km, sens, entre: null }
}
