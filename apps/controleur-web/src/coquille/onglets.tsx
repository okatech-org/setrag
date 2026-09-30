"use client"

import {
  HouseIcon,
  ListOrderedIcon,
  ScanLineIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavRuban } from "@workspace/ui/components/indicateur"
import { cn } from "@workspace/ui/lib/utils"

import { useTerminal } from "@/fonctionnalites/terminal/contexte-terminal"

/** Hauteur de la barre d'onglets, hors zone de la barre d'accueil. */
export const HAUTEUR_ONGLETS = 58

interface Onglet {
  href: Route
  libelle: string
  icone: LucideIcon
  /** L'historique porte le nombre d'écritures en attente d'envoi. */
  compte?: boolean
}

/**
 * Quatre destinations, pas une de plus : elles se prennent au pouce, d'une
 * main, dans une voiture en mouvement. Les sous-écrans (vente, procès-verbal,
 * recherche, conflits, verdict) masquent les onglets et portent un retour.
 */
export const ONGLETS: Onglet[] = [
  { href: "/tournee", libelle: "Tournée", icone: HouseIcon },
  { href: "/scan", libelle: "Scanner", icone: ScanLineIcon },
  { href: "/historique", libelle: "Historique", icone: ListOrderedIcon, compte: true },
  { href: "/incident", libelle: "Incident", icone: TriangleAlertIcon },
]

export function estRacine(chemin: string): boolean {
  return ONGLETS.some((onglet) => onglet.href === chemin)
}

/**
 * Barre d'onglets. Le ruban se pose au-dessus de l'onglet courant et glisse
 * vers le suivant ; le libellé reste écrit.
 */
export function Onglets() {
  const chemin = usePathname()
  const { queue } = useTerminal()
  const courant = ONGLETS.find((onglet) => onglet.href === chemin)?.href ?? null

  return (
    <nav
      aria-label="Onglets"
      className="pb-safe sticky bottom-0 z-30 border-t border-line bg-surface"
    >
      <NavRuban actif={courant} cote="haut" largeur={44} className="grid grid-cols-4">
        {ONGLETS.map(({ href, libelle, icone: Icone, compte }) => {
          const actif = href === courant
          const enAttente = compte ? queue.total : 0
          return (
            <Link
              key={href}
              href={href}
              data-actif={actif}
              aria-current={actif ? "page" : undefined}
              style={{ height: HAUTEUR_ONGLETS }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-[11.5px] font-semibold transition-colors duration-[var(--dur-fast)] active:bg-surface-sunk",
                actif ? "text-accent-ink" : "text-ink-muted"
              )}
            >
              <Icone className="size-6" strokeWidth={actif ? 2.2 : 1.8} aria-hidden />
              {libelle}
              {enAttente > 0 && (
                <span
                  className="absolute top-1.5 left-[calc(50%+6px)] h-5 min-w-5 rounded-pill bg-danger px-1.5 text-center font-mono text-[11.5px] leading-5 font-bold text-ink-inverse shadow-[0_0_0_2px_var(--c-surface)]"
                  aria-label={`${enAttente} écritures en attente d'envoi`}
                >
                  {enAttente > 99 ? "99+" : enAttente}
                </span>
              )}
            </Link>
          )
        })}
      </NavRuban>
    </nav>
  )
}
