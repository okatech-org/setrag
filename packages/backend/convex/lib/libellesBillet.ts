/**
 * Les mots du billet, tels que le voyageur les lit sur le site — partagés
 * par le PDF et le pass Wallet.
 *
 * Ce sont les libellés de la billetterie (`apps/billetterie-web/src/lib/
 * voyage.ts` et `format.ts`, `@workspace/ui/lib/format`), reportés ici pour
 * le serveur : toute évolution part de l'interface.
 */

/**
 * Seul un titre valide ou déjà contrôlé est un billet de transport ; tout
 * autre statut imprime le bandeau « TITRE NON VALABLE ».
 */
export function titreValable(statut: string): boolean {
  return statut === "valide" || statut === "utilise"
}

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

const CLASSES: Record<string, string> = {
  DEUXIEME: "2e",
  PREMIERE: "1re",
  VIP: "VIP",
}

/** « 1re », « 2e », « VIP » : la case Classe du billet. */
export function classeCourte(classe: string): string {
  return CLASSES[classe.toUpperCase()] ?? classe
}

const JOURS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."]
const MOIS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
]

/**
 * « Mar. 28 juil. 2026 » : la date courte du site, plus l'année — un billet
 * papier se garde. Écrite à la main plutôt que par `Intl`, dont les données
 * de langue ne sont pas garanties dans le runtime.
 */
export function dateBillet(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const jourSemaine = new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay()
  return `${JOURS[jourSemaine]} ${jour} ${MOIS[mois - 1] ?? ""} ${annee}`
}

/**
 * Vrai si l'arrivée tombe le lendemain du départ. Les heures sont écrites
 * HH:MM à Libreville et aucun trajet du Transgabonais ne dure un jour
 * entier : une arrivée « avant » le départ est celle du jour suivant.
 */
export function arriveeLendemain(depart: string, arrivee: string): boolean {
  const format = /^\d{2}:\d{2}$/
  return format.test(depart) && format.test(arrivee) && arrivee < depart
}

/** Montant groupé par milliers, avec l'espace insécable du site (U+00A0). */
export function formatXaf(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")
}

/** « 38 500 FCFA », comme `formatPrice` de @workspace/ui. */
export function formatPrix(amount: number): string {
  return `${formatXaf(amount)}\u00A0FCFA`
}
