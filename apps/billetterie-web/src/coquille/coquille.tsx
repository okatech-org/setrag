"use client"

import { usePathname } from "next/navigation"
import { Suspense, type ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { Ruban } from "@/fonctionnalites/assistant/ruban"
import { CompteSupprime } from "@/fonctionnalites/compte/elements"
import { BandeauReseau } from "@/fonctionnalites/hors-ligne/bandeau-reseau"
import { InviteInstallation } from "@/fonctionnalites/hors-ligne/invite-installation"
import { ServiceWorker } from "@/fonctionnalites/hors-ligne/service-worker"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

import { Demarrage } from "./demarrage"
import { EnTete } from "./en-tete"
import { FiletNavigation } from "./filet-navigation"
import { estRacine } from "./navigation"
import { HAUTEUR_ONGLETS, Onglets } from "./onglets"
import { Pied } from "./pied"

/**
 * La coquille du site, commune à toutes les pages.
 *
 * Un seul arbre pour tous les écrans — pas de double rendu bureau / mobile :
 * sous 768 px, l'en-tête et le pied s'effacent, chaque écran porte sa barre
 * d'app, et les écrans racines gagnent la barre d'onglets, comme dans l'app.
 */
export function Coquille({ children }: { children: ReactNode }) {
  const chemin = usePathname()
  const racine = estRacine(chemin)
  // Un compte désactivé ne lit plus rien : chaque écran qui attendrait son
  // profil resterait en chargement. On le dit une fois, partout.
  const { compteSupprime } = useTravelerAuth()

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only z-[70] rounded-pill bg-accent-base px-4 py-2 font-semibold text-ink-inverse focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>
      <Suspense>
        <FiletNavigation />
      </Suspense>
      <Demarrage />
      <BandeauReseau />
      {racine && <InviteInstallation />}
      <EnTete />
      <main
        id="contenu"
        className={cn("flex flex-1 flex-col", racine && "max-md:pb-[var(--bas-onglets)]")}
        style={{ "--bas-onglets": `calc(${HAUTEUR_ONGLETS}px + env(safe-area-inset-bottom, 0px))` } as React.CSSProperties}
      >
        {compteSupprime ? (
          <div className="mx-auto grid w-full max-w-[560px] px-4 py-10 md:py-16">
            <CompteSupprime />
          </div>
        ) : (
          children
        )}
      </main>
      <Pied />
      {racine && <Onglets />}
      <Ruban racine={racine} />
      <ServiceWorker />
    </div>
  )
}
