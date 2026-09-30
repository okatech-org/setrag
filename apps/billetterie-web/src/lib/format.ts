/**
 * Dates, heures et montants tels que le voyageur les lit.
 *
 * Tout s'affiche à l'heure de Libreville, celle des horaires du Transgabonais,
 * quel que soit le fuseau du téléphone : un voyageur en correspondance depuis
 * l'étranger doit lire 07:40 sur son billet comme sur le quai.
 */

import { formatDuration, formatPrice, formatPriceCompact, formatTime } from "@workspace/ui/lib/format"

export const FUSEAU = "Africa/Libreville"

export { formatDuration as duree, formatPrice as prix, formatPriceCompact as prixCourt, formatTime as heure }

/** Date de circulation (AAAA-MM-JJ) d'un instant, à Libreville. */
export function dateDeService(instant: number): string {
  // en-CA écrit les dates au format ISO, ce qui évite de recomposer les parties.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant)
}

/** Ajoute des jours à une date de circulation. */
export function ajouterJours(date: string, jours: number): string {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10)
}

/** Midi, à Libreville, du jour donné : un instant sans ambiguïté de fuseau. */
function midi(date: string): Date {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, j, 11))
}

const jourCourt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
const jourLong = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
const jourSemaine = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" })

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1)

/** « Ven. 2 oct. » */
export function dateCourte(date: string): string {
  return majuscule(jourCourt.format(midi(date)))
}

/** « vendredi 2 octobre » */
export function dateLongue(date: string): string {
  return jourLong.format(midi(date))
}

/** « Ven. 2 » : la bande des jours. */
export function jourEtQuantieme(date: string): string {
  const jour = majuscule(jourSemaine.format(midi(date)).replace(/\.$/, ""))
  return `${jour}. ${Number(date.slice(8, 10))}`
}

/** « Aujourd'hui », « Demain », ou la date courte. */
export function dateRelative(date: string, aujourdhui: string): string {
  if (date === aujourdhui) return "Aujourd'hui"
  if (date === ajouterJours(aujourdhui, 1)) return "Demain"
  return dateCourte(date)
}

/** Durée entre deux instants, en minutes arrondies. */
export function minutesEntre(debut: number, fin: number): number {
  return Math.round((fin - debut) / 60_000)
}

/** Le train arrive-t-il le lendemain de son départ (à Libreville) ? */
export function arriveLendemain(depart: number, arrivee: number): boolean {
  return dateDeService(arrivee) !== dateDeService(depart)
}

/** Numéro de téléphone gabonais lisible : « +241 07 12 34 56 ». */
export function telephone(numero: string): string {
  const chiffres = numero.replace(/\D/g, "")
  if (chiffres.startsWith("241") && chiffres.length === 11) {
    const local = chiffres.slice(3)
    return `+241 ${local.match(/.{1,2}/g)!.join(" ")}`
  }
  return numero
}

/** « d'Owendo », « de Booué » : l'élision devant une voyelle ou un h muet. */
export function deGare(nom: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüAEIOUYHÀÂÄÉÈÊËÎÏÔÖÙÛÜ]/.test(nom) ? `d'${nom}` : `de ${nom}`
}
