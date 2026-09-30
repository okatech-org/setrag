"use client"

import { useEffect, useState } from "react"

/**
 * L'heure, côté navigateur, relue à intervalle régulier.
 *
 * `null` au rendu serveur et à l'hydratation : ce qui dépend de l'instant
 * (à venir ou passé, délai restant, position du train) ne se tranche qu'une
 * fois sur l'appareil, sans écart entre le HTML reçu et le premier rendu.
 */
export function useMaintenant(intervalleMs = 60_000): number | null {
  const [maintenant, setMaintenant] = useState<number | null>(null)
  useEffect(() => {
    const relever = () => setMaintenant(Date.now())
    const premier = window.setTimeout(relever, 0)
    const minuteur = window.setInterval(relever, intervalleMs)
    return () => {
      window.clearTimeout(premier)
      window.clearInterval(minuteur)
    }
  }, [intervalleMs])
  return maintenant
}
