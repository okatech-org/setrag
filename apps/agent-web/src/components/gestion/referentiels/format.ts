/**
 * Mise en forme commune des écrans de gestion : dates de Libreville,
 * montants en francs CFA, libellés des énumérations du domaine.
 */

const TZ = "Africa/Libreville"

const fmtDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ })
const fmtJourMois = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: TZ })
const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
const fmtSecondes = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ })
const fmtJourLong = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ })
const fmtNombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
const fmtTaux = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 01/10/2026 */
export const dateCourte = (valeur: number | null | undefined) => (valeur ? fmtDate.format(valeur) : "—")
/** 01/10 */
export const jourMois = (valeur: number | null | undefined) => (valeur ? fmtJourMois.format(valeur) : "—")
/** 13:24 */
export const heure = (valeur: number | null | undefined) => (valeur ? fmtHeure.format(valeur) : "—")
/** 01/10 13:24 */
export const dateHeure = (valeur: number | null | undefined) =>
  valeur ? `${fmtJourMois.format(valeur)} ${fmtHeure.format(valeur)}` : "—"
/** 01/10/2026 13:24:07 */
export const horodatage = (valeur: number | null | undefined) =>
  valeur ? `${fmtDate.format(valeur)} ${fmtSecondes.format(valeur)}` : "—"
/** jeu. 1 oct. 2026 */
export const jourLong = (valeur: number | null | undefined) => (valeur ? fmtJourLong.format(valeur) : "—")

/** Date de service « AAAA-MM-JJ » → « ven. 2 oct. 2026 ». */
export function dateService(date: string | null | undefined) {
  if (!date) return "—"
  return fmtJourLong.format(Date.parse(`${date}T12:00:00Z`))
}

/** Date de service → « 02/10 ». */
export function dateServiceCourte(date: string | null | undefined) {
  if (!date) return "—"
  const [, mois, jour] = date.split("-")
  return `${jour}/${mois}`
}

/** Aujourd'hui à Libreville, au format AAAA-MM-JJ. */
export function aujourdhuiService(decalageJours = 0) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TZ }).format(Date.now() + decalageJours * 86_400_000)
}

/** Champ date (AAAA-MM-JJ) → horodatage du début de journée à Libreville. */
export function debutJour(date: string) {
  return Date.parse(`${date}T00:00:00+01:00`)
}
/** Champ date → fin de journée à Libreville. */
export function finJour(date: string) {
  return Date.parse(`${date}T23:59:59.999+01:00`)
}
/** Horodatage → valeur d'un champ date. */
export function champDate(valeur: number | null | undefined) {
  return valeur ? new Intl.DateTimeFormat("fr-CA", { timeZone: TZ }).format(valeur) : ""
}

export const nombre = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : fmtNombre.format(valeur))
/** 43,42 */
export const taux = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : fmtTaux.format(valeur))
/** « 32 500 » — le montant seul, l'unité à part. */
export const montant = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : fmtNombre.format(Math.round(valeur)))
/** « 32 500 XAF » */
export const xaf = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtNombre.format(Math.round(valeur))} XAF`)
/** « 58,2 M » */
export function millions(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined) return "—"
  if (Math.abs(valeur) < 100_000) return fmtNombre.format(valeur)
  return `${(valeur / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
}
/** 0,71 → « 71 % » */
export const pourcent = (valeur: number | null | undefined, decimales = 0) =>
  valeur === null || valeur === undefined
    ? "—"
    : `${(valeur * 100).toLocaleString("fr-FR", { maximumFractionDigits: decimales })} %`
/** 12 → « +12 % », −10 → « −10 % » */
export function signePct(valeur: number) {
  const texte = Math.abs(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  return valeur > 0 ? `+${texte} %` : valeur < 0 ? `−${texte} %` : "0 %"
}
/** Modulation → coefficient : 12 → « ×1,12 ». */
export function coefficient(modifierPct: number) {
  return `×${(1 + modifierPct / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface PersonneAffichee {
  nom: string
  court: string
  matricule?: string | null
}

/** « C. Mba · A-007 » */
export function agent(personne: PersonneAffichee | null | undefined, repli = "Système") {
  if (!personne) return repli
  return personne.matricule ? `${personne.court} · ${personne.matricule}` : personne.court
}

export const CLASSES = {
  VIP: { court: "VIP", long: "VIP" },
  PREMIERE: { court: "1re", long: "1re classe" },
  DEUXIEME: { court: "2e", long: "2e classe" },
} as const
export type ClasseService = keyof typeof CLASSES
export const ORDRE_CLASSES: readonly ClasseService[] = ["VIP", "PREMIERE", "DEUXIEME"]

export const TYPES_TRAIN = {
  EXPRESS: "Express",
  OMNIBUS: "Omnibus",
  AUTORAIL: "Autorail",
  SPECIAL: "Spécial",
} as const
export type TypeTrain = keyof typeof TYPES_TRAIN
export const ORDRE_TYPES_TRAIN: readonly TypeTrain[] = ["EXPRESS", "OMNIBUS", "AUTORAIL", "SPECIAL"]

export const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const
export const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const

/** [1,3,5] → « Lun, mer, ven » ; [] → « Tous les jours ». */
export function joursCirculation(jours: readonly number[]) {
  if (jours.length === 0 || jours.length === 7) return "Tous les jours"
  const tri = [...jours].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const texte = tri.map((jour) => JOURS_COURTS[jour]!.toLowerCase()).join(", ")
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

export const TYPES_POINT_DE_VENTE = {
  gare: "Gare",
  agence_accreditee: "Agence accréditée",
  agence_premium: "Agence premium",
} as const

export const MOTIFS_BLOCAGE = {
  maintenance: "Maintenance",
  exploitation: "Exploitation",
  protocole: "Protocole",
  autre: "Autre",
} as const

export const CATEGORIES_REDUCTION: Record<string, string> = {
  ENFANT: "Enfant 4–11 ans",
  GROUPE: "Groupe",
  MILITAIRE: "Militaire",
  WEEKEND: "Week-end",
  ETUDIANT: "Étudiant",
  TROISIEME_AGE: "Troisième âge",
  PROMOTIONNEL: "Promotion",
}

export const MOYENS_PAIEMENT = {
  especes: "Espèces",
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
  clickpay: "Click&Pay",
  visa: "Visa",
  mastercard: "Mastercard",
  en_compte: "En compte",
} as const

export function libelleDesserte(desserte: {
  trainNumber: string
  trainName?: string | null
  heureDepart?: string
  origine?: { name: string } | null
  destination?: { name: string } | null
} | null | undefined) {
  if (!desserte) return "Desserte inconnue"
  const train = desserte.trainName ?? desserte.trainNumber
  const trajet = desserte.origine && desserte.destination ? ` · ${desserte.origine.name} → ${desserte.destination.name}` : ""
  return `${train}${desserte.heureDepart ? ` · ${desserte.heureDepart}` : ""}${trajet}`
}

export function messageErreur(cause: unknown, repli = "L'action a échoué.") {
  if (!(cause instanceof Error)) return repli
  // Convex préfixe ses erreurs serveur : on ne garde que la phrase utile.
  const message = cause.message.replace(/^\[CONVEX [^\]]*\]\s*/, "")
  const serveur = /Uncaught Error:\s*([\s\S]*?)(?:\n\s+at |$)/.exec(message)
  return (serveur?.[1] ?? message).replace(/\s*Called by client$/, "").trim() || repli
}
