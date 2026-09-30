/**
 * Dates, heures et montants tels que le contrôleur les lit.
 *
 * Tout s'affiche à l'heure de Libreville, celle des horaires du Transgabonais,
 * quel que soit le fuseau du terminal. Les montants et les heures passent en
 * chiffres tabulaires à l'écran (`.tabular`) : une colonne qui ne s'aligne pas
 * se relit mal, et un contrôleur relit ses montants dans une voiture de nuit.
 */

import {
  formatPrice,
  formatPriceCompact,
  formatTime,
} from "@workspace/ui/lib/format"

export const FUSEAU = "Africa/Libreville"

/** « 17 000 FCFA » — espaces insécables compris. */
export function montant(xaf: number): string {
  return formatPrice(Math.round(xaf))
}

/** « 17 000 » — quand la devise est déjà dite par la colonne ou le libellé. */
export function montantCourt(xaf: number): string {
  return formatPriceCompact(Math.round(xaf))
}

/** Heure « 15:40 », à Libreville. */
export function heure(ms: number): string {
  return formatTime(ms, { timeZone: FUSEAU })
}

/** Taux au kilomètre, à la française : « 43,42 ». */
export function taux(valeur: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valeur)
}

const jourMois = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "2-digit",
  month: "2-digit",
})

/** « 30/09 » */
export function jour(ms: number): string {
  return jourMois.format(ms)
}

/** « 30/09 à 15:59 » */
export function jourHeure(ms: number): string {
  return `${jour(ms)} à ${heure(ms)}`
}

const jourCourt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
})

const majuscule = (texte: string) =>
  texte.charAt(0).toUpperCase() + texte.slice(1)

/** « Mer. 30 sept. » à partir d'une date de circulation AAAA-MM-JJ. */
export function dateCourte(serviceDate: string): string {
  const [a, m, j] = serviceDate.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  // Midi UTC du jour dit : aucun fuseau ne le fait basculer d'un jour.
  return majuscule(jourCourt.format(new Date(Date.UTC(a, m - 1, j, 12))))
}

/** « d'Owendo Virié », « de Booué » : l'élision devant une voyelle ou un h muet. */
export function deGare(nom: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüAEIOUYHÀÂÄÉÈÊËÎÏÔÖÙÛÜ]/.test(nom) ? `d'${nom}` : `de ${nom}`
}

const CLASSES: Record<string, { court: string; long: string }> = {
  DEUXIEME: { court: "2e", long: "2e classe" },
  PREMIERE: { court: "1re", long: "1re classe" },
  VIP: { court: "VIP", long: "VIP" },
}

/** « 2e », « 1re », « VIP » : la case Classe du billet. */
export function classeCourte(classe: string): string {
  return CLASSES[classe]?.court ?? classe
}

/** « 2e classe » : ce que l'agent annonce au voyageur. */
export function classeLongue(classe: string): string {
  return CLASSES[classe]?.long ?? classe
}
