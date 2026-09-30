"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavRuban } from "@workspace/ui/components/indicateur"
import { cn } from "@workspace/ui/lib/utils"

import { ONGLETS, estActif } from "./navigation"

/** Hauteur de la barre d'onglets, hors zone de la barre d'accueil du téléphone. */
export const HAUTEUR_ONGLETS = 58

/**
 * Barre d'onglets de l'app (mobile). Le ruban se pose au-dessus de l'onglet
 * courant, sur 44 px, et glisse vers le suivant ; le libellé reste écrit.
 */
export function Onglets() {
  const chemin = usePathname()
  const courant = ONGLETS.find((onglet) => estActif(onglet, chemin))?.href ?? null

  return (
    <nav aria-label="Onglets" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
      <NavRuban actif={courant} cote="haut" largeur={44} className="grid grid-cols-3">
        {ONGLETS.map(({ href, libelle, icone: Icone }) => {
          const actif = href === courant
          return (
            <Link
              key={href}
              href={href}
              data-actif={actif}
              aria-current={actif ? "page" : undefined}
              style={{ height: HAUTEUR_ONGLETS }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11.5px] font-semibold transition-colors duration-[var(--dur-fast)] active:bg-surface-sunk",
                actif ? "text-accent-ink" : "text-ink-muted"
              )}
            >
              <Icone className="size-6" strokeWidth={actif ? 2.2 : 1.8} aria-hidden />
              {libelle}
            </Link>
          )
        })}
      </NavRuban>
    </nav>
  )
}
