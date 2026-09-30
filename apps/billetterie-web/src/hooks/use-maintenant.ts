"use client"

import { useSyncExternalStore } from "react"

/**
 * L'heure courante, arrondie au pas donné : l'écran se met à jour à ce
 * rythme, sans relire l'horloge à chaque rendu (qui doit rester pur).
 *
 * `null` pendant le rendu serveur et l'hydratation : l'heure du voyageur est
 * celle de son téléphone, pas celle du serveur.
 */
export function useMaintenant(pasMs = 15_000): number | null {
  return useSyncExternalStore(
    (rappel) => {
      const minuteur = window.setInterval(rappel, pasMs)
      return () => window.clearInterval(minuteur)
    },
    () => Math.floor(Date.now() / pasMs) * pasMs,
    () => null
  )
}

/** Une requête média (préférence du système), relue quand elle change. */
export function useRequeteMedia(requete: string, serveur = false): boolean {
  return useSyncExternalStore(
    (rappel) => {
      const liste = window.matchMedia(requete)
      liste.addEventListener("change", rappel)
      return () => liste.removeEventListener("change", rappel)
    },
    () => window.matchMedia(requete).matches,
    () => serveur
  )
}
