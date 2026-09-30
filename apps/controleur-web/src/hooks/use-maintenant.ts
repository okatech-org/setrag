"use client"

import { useSyncExternalStore } from "react"

/**
 * L'heure courante, arrondie au pas donné : l'écran se met à jour à ce
 * rythme, sans relire l'horloge à chaque rendu (qui doit rester pur).
 *
 * `null` pendant le rendu serveur et l'hydratation : l'heure qui compte est
 * celle du terminal, pas celle du serveur.
 */
export function useMaintenant(pasMs = 30_000): number | null {
  return useSyncExternalStore(
    (rappel) => {
      const minuteur = window.setInterval(rappel, pasMs)
      return () => window.clearInterval(minuteur)
    },
    () => Math.floor(Date.now() / pasMs) * pasMs,
    () => null
  )
}
