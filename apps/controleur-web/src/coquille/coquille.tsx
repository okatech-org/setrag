"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { ApparenceProvider, useApparenceCourante } from "./apparence"
import { BandeauService } from "./bandeau-service"
import { estRacine, Onglets } from "./onglets"

/**
 * La coquille du terminal : le bandeau de service en haut, toujours ; l'écran ;
 * les onglets en bas, sur les seuls écrans racines.
 *
 * Le viseur demande un écran entièrement sombre, jour comme nuit — la caméra
 * montre une image sombre, un fond clair éblouirait dans une voiture éteinte.
 * Le verdict, lui, recouvre tout et masque les onglets.
 */
function Cadre({ children }: { children: ReactNode }) {
  const chemin = usePathname()
  const { sombre, sansOnglets } = useApparenceCourante()
  const onglets = estRacine(chemin) && !sansOnglets
  return (
    <div
      data-theme={sombre ? "dark" : undefined}
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas text-ink"
      )}
    >
      <BandeauService />
      <main id="contenu" className="flex flex-1 flex-col">
        {children}
      </main>
      {onglets && <Onglets />}
    </div>
  )
}

export function Coquille({ children }: { children: ReactNode }) {
  return (
    <ApparenceProvider>
      <Cadre>{children}</Cadre>
    </ApparenceProvider>
  )
}
