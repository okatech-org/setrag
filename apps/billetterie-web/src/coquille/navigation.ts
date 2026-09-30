import { CircleUserRoundIcon, HouseIcon, TicketIcon, type LucideIcon } from "lucide-react"
import type { Route } from "next"

export interface EntreeNavigation {
  href: Route
  libelle: string
  /** Chemins rattachés à l'entrée : le tunnel d'achat relève de « Réserver ». */
  prefixes: string[]
}

/** Navigation du site sur grand écran, dans l'en-tête. */
export const NAVIGATION_BUREAU: EntreeNavigation[] = [
  { href: "/", libelle: "Réserver", prefixes: ["/resultats", "/reservation", "/paiement", "/confirmation"] },
  { href: "/billets", libelle: "Mes billets", prefixes: ["/billets"] },
  { href: "/suivi", libelle: "Suivi des trains", prefixes: ["/suivi"] },
  { href: "/tarifs", libelle: "Tarifs", prefixes: ["/tarifs", "/bagages"] },
  { href: "/aide", libelle: "Aide", prefixes: ["/aide"] },
]

export interface Onglet extends EntreeNavigation {
  icone: LucideIcon
}

/**
 * Les trois onglets de l'app, comme sur les maquettes mobiles : le reste
 * (suivi, tarifs, aide) s'ouvre depuis ces écrans, avec un retour.
 */
export const ONGLETS: Onglet[] = [
  { href: "/", libelle: "Accueil", icone: HouseIcon, prefixes: [] },
  { href: "/billets", libelle: "Billets", icone: TicketIcon, prefixes: ["/billets"] },
  { href: "/compte", libelle: "Compte", icone: CircleUserRoundIcon, prefixes: ["/compte", "/notifications", "/connexion"] },
]

export function estActif(entree: EntreeNavigation, chemin: string): boolean {
  if (entree.href === chemin) return true
  return entree.prefixes.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))
}

/**
 * Écrans racines sur mobile : la barre d'onglets y est visible. Ailleurs —
 * tunnel d'achat, détail d'un billet, pages d'information —, l'écran porte un
 * retour et, s'il le faut, sa propre barre d'action en bas.
 */
const RACINES = new Set(["/", "/billets", "/compte"])

export function estRacine(chemin: string): boolean {
  return RACINES.has(chemin)
}
