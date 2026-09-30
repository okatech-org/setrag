"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavRuban } from "@workspace/ui/components/indicateur"
import { Logo } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { CompteRapide } from "./compte-rapide"
import { NAVIGATION_BUREAU, estActif } from "./navigation"

/**
 * En-tête du site sur grand écran : le logo fixe (il ne s'anime jamais ici),
 * la navigation — le ruban suit l'onglet courant —, le compte.
 */
export function EnTete() {
  const chemin = usePathname()
  const courant = NAVIGATION_BUREAU.find((entree) => estActif(entree, chemin))?.href ?? null

  return (
    <header className="sticky top-0 z-40 hidden border-b border-line bg-surface/95 backdrop-blur-md md:block">
      {/* Toute la largeur, comme la maquette : seul le contenu des pages est
          centré et limité. */}
      <div className="flex h-[68px] w-full items-center gap-8 px-10">
        <Link href="/" className="shrink-0 rounded-sm" aria-label="SETRAG — accueil de la billetterie">
          <Logo variante="compact" title="" className="h-[38px]" />
        </Link>
        <NavRuban actif={courant} retrait={14} aria-label="Navigation principale" className="flex h-full items-stretch">
          {NAVIGATION_BUREAU.map((entree) => {
            const actif = entree.href === courant
            return (
              <Link
                key={entree.href}
                href={entree.href}
                data-actif={actif}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex items-center px-3.5 text-[15px] font-semibold whitespace-nowrap transition-colors duration-[var(--dur-fast)]",
                  actif ? "text-ink" : "text-ink-muted hover:text-ink"
                )}
              >
                {entree.libelle}
              </Link>
            )
          })}
        </NavRuban>
        <div className="ml-auto">
          <CompteRapide />
        </div>
      </div>
    </header>
  )
}
