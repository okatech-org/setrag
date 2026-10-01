import { formatDuration, formatTime } from "@workspace/shared/utils/format"

const FUSEAU = "Africa/Libreville"

/** Heure d'exploitation, « 07:40 ». */
export function heure(timestamp: number) {
  return formatTime(timestamp, "fr-FR")
}

/** Durée en minutes, « 11 h 45 ». */
export function duree(minutes: number) {
  return formatDuration(Math.round(minutes))
}

/** Montant sans unité, « 32 500 ». */
export function montant(valeur: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur)
}

/** Montant avec l'unité des maquettes, « 48 750 XAF ». */
export function xaf(valeur: number) {
  return `${montant(valeur)} XAF`
}

/** Jour de circulation (AAAA-MM-JJ) du jour, à Libreville. */
export function aujourdhui() {
  return jourDe(Date.now())
}

/** Jour de circulation d'un horodatage, à Libreville. */
export function jourDe(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp)
}

export function ajouterJours(jour: string, nombre: number) {
  const date = new Date(`${jour}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + nombre)
  return date.toISOString().slice(0, 10)
}

function formaterJour(jour: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: FUSEAU }).format(new Date(`${jour}T12:00:00Z`))
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1)

/** « ven. 2 oct. » */
export function jourCourt(jour: string) {
  return formaterJour(jour, { weekday: "short", day: "numeric", month: "short" })
}

/** « Ven. 2 oct. » — en tête de champ ou de ligne. */
export function JourCourt(jour: string) {
  return majuscule(jourCourt(jour))
}

/** « vendredi 2 octobre » — pour les lecteurs d'écran et les phrases. */
export function jourLong(jour: string) {
  return formaterJour(jour, { weekday: "long", day: "numeric", month: "long" })
}

/** « 14 sept. » */
export function jourSansSemaine(jour: string) {
  return formaterJour(jour, { day: "numeric", month: "short" })
}

/** Abréviation du jour seule, « Ven. », et son quantième, « 2 ». */
export function jourEnTete(jour: string) {
  return {
    semaine: majuscule(formaterJour(jour, { weekday: "short" })),
    quantieme: formaterJour(jour, { day: "numeric" }),
  }
}

/** « Septembre » — intertitre des billets passés. */
export function mois(jour: string) {
  return majuscule(formaterJour(jour, { month: "long" }))
}

/** Le train arrive-t-il le lendemain (ou plus tard) de son départ ? */
export function joursDecales(departAt: number, arriveeAt: number) {
  const ecart = (Date.parse(`${jourDe(arriveeAt)}T12:00:00Z`) - Date.parse(`${jourDe(departAt)}T12:00:00Z`)) / 86_400_000
  return Math.max(0, Math.round(ecart))
}

/** Compte à rebours, « 14:32 » ; au-delà d'une heure, « 1:05:12 ». */
export function rebours(millisecondes: number) {
  const secondes = Math.max(0, Math.floor(millisecondes / 1000))
  const h = Math.floor(secondes / 3600)
  const m = Math.floor((secondes % 3600) / 60)
  const s = secondes % 60
  const deux = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${deux(m)}:${deux(s)}`
}

/** Numéro gabonais saisi librement → « +24107123456 », ou null. */
export function normaliserTelephone(saisie: string) {
  const chiffres = saisie.replace(/\D/g, "")
  const national = chiffres.startsWith("241") ? chiffres.slice(3) : chiffres
  // « 077 12 34 56 » : l'ancien zéro de tête, que beaucoup tapent encore.
  const huit = national.length === 9 && national.startsWith("0") ? national.slice(1) : national
  // Comme le serveur : huit chiffres significatifs, sans zéro de tête.
  return /^[1-9]\d{7}$/.test(huit) ? `+241${huit}` : null
}

/** « +241 77 12 34 56 » */
export function telephone(numero: string) {
  const chiffres = numero.replace(/\D/g, "").replace(/^241/, "")
  if (chiffres.length !== 8) return numero
  return `+241 ${chiffres.match(/.{2}/g)!.join(" ")}`
}

/** « +241 77 •• •• 56 » — affichage discret du numéro du compte. */
export function telephoneMasque(numero: string) {
  const chiffres = numero.replace(/\D/g, "").replace(/^241/, "")
  if (chiffres.length !== 8) return numero
  return `+241 ${chiffres.slice(0, 2)} •• •• ${chiffres.slice(6)}`
}

/** « 77 •• •• 56 » — dans une consigne de paiement. */
export function telephoneCourtMasque(numero: string) {
  return telephoneMasque(numero).replace(/^\+241 /, "")
}

export function initiales(prenom?: string, nom?: string) {
  const lettres = [prenom, nom].map((mot) => mot?.trim().charAt(0) ?? "").join("")
  return lettres.toUpperCase() || "?"
}

/** Message d'erreur Convex ou réseau, débarrassé de son préfixe technique. */
export function messageErreur(erreur: unknown) {
  const brut = erreur instanceof Error ? erreur.message : String(erreur)
  const ligne = brut
    .replace(/^\[CONVEX [^\]]+\]\s*/, "")
    .replace(/^\[Request ID: [^\]]+\]\s*/, "")
    .replace(/^Server Error\s*(Uncaught Error:\s*)?/, "")
    .split("\n")[0]
    ?.trim()
  return ligne || "Une erreur est survenue. Réessayez."
}
