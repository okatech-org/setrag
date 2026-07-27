import { Home, Ticket, TrainFront, UserRound } from "lucide-react"

/** Navigation principale, en-tête du bureau. */
export const DESKTOP_LINKS = [
  { href: "/", label: "Rechercher" },
  { href: "/mes-reservations", label: "Mes réservations" },
  { href: "/suivi", label: "Suivre un train" },
] as const

/**
 * Onglets du bas, en mobile.
 *
 * Quatre destinations, pas davantage : au-delà les libellés se tronquent sous
 * 360 px et la cible tactile descend sous les 44 px réglementaires.
 */
export const MOBILE_TABS = [
  { href: "/", label: "Accueil", icon: Home, requiresAuthentication: false },
  {
    href: "/mes-reservations",
    label: "Billets",
    icon: Ticket,
    requiresAuthentication: true,
  },
  {
    href: "/suivi",
    label: "Trains",
    icon: TrainFront,
    requiresAuthentication: false,
  },
  {
    href: "/compte",
    label: "Compte",
    icon: UserRound,
    requiresAuthentication: true,
  },
] as const

/**
 * Titres des écrans empilés — ceux qu'on ouvre par-dessus un onglet et qu'on
 * referme par le bouton retour.
 *
 * Les routes dynamiques sont reconnues au préfixe. Une page dont le titre
 * dépend de ses données surcharge cette valeur par `useMobileAppBar`.
 */
const STACK_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["/resultats", "Dessertes"],
  ["/reservation", "Votre voyage"],
  ["/paiement/attente", "Validation en cours"],
  ["/paiement", "Paiement"],
  ["/confirmation", "Billet émis"],
  ["/connexion", "Connexion"],
  ["/compte/profil", "Profil"],
  ["/compte/voyageurs", "Voyageurs enregistrés"],
  ["/compte/affichage", "Affichage et langue"],
  ["/aide", "Aide et contacts"],
  ["/tarifs", "Tarifs officiels"],
  ["/bagages", "Bagages"],
]

export type MobileChromeVariant =
  /** Onglet dont l'écran porte son propre en-tête — pas de barre de titre. */
  | "hero"
  /** Onglet : barre de titre sans retour, barre d'onglets visible. */
  | "tab"
  /** Écran empilé : barre de titre avec retour, barre d'onglets masquée. */
  | "stack"

export interface MobileChrome {
  variant: MobileChromeVariant
  title?: string
}

/** Chrome mobile déduit de la seule route, avant surcharge éventuelle. */
export function mobileChromeForPath(pathname: string): MobileChrome {
  if (pathname === "/") return { variant: "hero" }

  const tab = MOBILE_TABS.find((item) => item.href === pathname)
  if (tab) return { variant: "tab", title: tab.label }

  // Le premier préfixe qui correspond gagne ; l'ordre de `STACK_TITLES` place
  // donc `/paiement/attente` avant `/paiement`.
  const stack = STACK_TITLES.find(
    ([href]) => pathname === href || pathname.startsWith(`${href}/`)
  )
  return { variant: "stack", title: stack?.[1] }
}

/** Onglet actif : la racine n'est active que sur elle-même. */
export function isTabActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
