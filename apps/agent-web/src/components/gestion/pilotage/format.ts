/**
 * Mise en forme des chiffres du pilotage : montants en XAF sans décimales,
 * millions au dixième, dates et heures de Libreville. Les chiffres
 * s’affichent en chiffres tabulaires (`tabular-nums` ou `.tabular`).
 */

const FUSEAU = "Africa/Libreville"

const entier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
const dixieme = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pourcent = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

/** « 432 750 » — montant XAF, sans l’unité (portée par la colonne). */
export function montant(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—"
  return entier.format(Math.round(valeur))
}

/** « −500 », « +1 250 », « 0 » : écart signé, signe typographique. */
export function ecart(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined) return "—"
  if (valeur === 0) return "0"
  return `${valeur > 0 ? "+" : "−"}${entier.format(Math.abs(Math.round(valeur)))}`
}

/** « 184,6 » (millions) ou « 842 » (milliers) selon l’ordre de grandeur. */
export function montantCompact(valeur: number): { chiffre: string; unite: string } {
  const abs = Math.abs(valeur)
  if (abs >= 1_000_000) return { chiffre: dixieme.format(valeur / 1_000_000), unite: "M XAF" }
  if (abs >= 10_000) return { chiffre: entier.format(valeur / 1_000), unite: "k XAF" }
  return { chiffre: entier.format(valeur), unite: "XAF" }
}

export function nombre(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined) return "—"
  return entier.format(valeur)
}

export function pct(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined) return "—"
  return `${pourcent.format(valeur)} %`
}

/** Variation relative : « +6,2 % », « −2,1 % », ou « sans référence ». */
export function variation(pctValeur: number | null | undefined) {
  if (pctValeur === null || pctValeur === undefined) return "sans référence"
  if (pctValeur === 0) return "stable"
  return `${pctValeur > 0 ? "+" : "−"}${pourcent.format(Math.abs(pctValeur))} %`
}

const dateLongue = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
const dateMoyenne = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })
const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU })
const jourHeure = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSEAU,
})
const jourMoisAn = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: FUSEAU,
})

function depuisIso(date: string) {
  return new Date(`${date}T12:00:00Z`)
}

/** « jeu. 1 oct. 2026 » à partir de « 2026-10-01 ». */
export function jourLong(date: string) {
  const texte = dateLongue.format(depuisIso(date))
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/** « 1 oct. » */
export function jourCourt(date: string) {
  return dateMoyenne.format(depuisIso(date))
}

/** « 01/10 » */
export function jourNumerique(date: string) {
  const [, m, j] = date.split("-")
  return `${j}/${m}`
}

export function heureDe(timestamp: number | null | undefined) {
  return timestamp ? heure.format(timestamp) : "—"
}

/** « 01/10 13:24 » */
export function horodatage(timestamp: number | null | undefined) {
  return timestamp ? jourHeure.format(timestamp).replace(",", "") : "—"
}

export function dateNumerique(timestamp: number | null | undefined) {
  return timestamp ? jourMoisAn.format(timestamp) : "—"
}

/** Jour de service de Libreville (UTC+1) d’un horodatage. */
export function jourDeService(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(timestamp)
}

export function ajouterJours(date: string, jours: number) {
  const d = depuisIso(date)
  d.setUTCDate(d.getUTCDate() + jours)
  return d.toISOString().slice(0, 10)
}

export function joursEntre(de: string, a: string) {
  return Math.round((depuisIso(a).getTime() - depuisIso(de).getTime()) / 86_400_000)
}

/** « Express 201 » à partir du type et de « TR-201 ». */
export function nomTrain(type: string, numero: string) {
  const types: Record<string, string> = {
    EXPRESS: "Express",
    OMNIBUS: "Omnibus",
    AUTORAIL: "Autorail",
    SPECIAL: "Spécial",
  }
  return `${types[type] ?? "Train"} ${numero.replace(/^[A-Z]+-/, "")}`
}

/** Taille de fichier lisible : « 12,4 ko ». */
export function taille(octets: number | null | undefined) {
  if (!octets) return "—"
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${dixieme.format(octets / 1024)} ko`
  return `${dixieme.format(octets / 1024 / 1024)} Mo`
}

export const LIBELLE_MOYEN: Record<string, string> = {
  especes: "Espèces",
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
  clickpay: "Click&Pay",
  visa: "Visa",
  mastercard: "Mastercard",
  en_compte: "En compte",
}

export const LIBELLE_PRODUIT: Record<string, string> = {
  billet: "Billet",
  bagage: "Bagage",
  colis: "Colis",
  taa: "Transport de véhicule",
  funeraire: "Transport funéraire",
}

export const LIBELLE_OPERATION: Record<string, string> = {
  vente: "Vente",
  annulation: "Annulation",
  remboursement: "Remboursement",
}

export function erreurLisible(cause: unknown, repli = "L’action a échoué.") {
  if (!(cause instanceof Error)) return repli
  const ligne = cause.message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("at ") && !l.startsWith("[CONVEX"))
  const nettoyee = (ligne ?? cause.message)
    .replace(/^.*Uncaught (?:Convex)?Error:\s*/i, "")
    .replace(/^(?:ConvexError|Error):\s*/i, "")
    .replace(/\s+Called by client$/i, "")
  return nettoyee || repli
}
