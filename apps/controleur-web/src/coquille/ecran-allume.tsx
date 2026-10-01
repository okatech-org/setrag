"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

import { useTerminal } from "@/fonctionnalites/terminal/contexte-terminal"
import { usePreferences } from "@/hooks/use-preferences"
import { creerGardeEcran, ecranAllumeVoulu } from "@/lib/ecran-allume"

/** Tient l'écran allumé tant que `actif` est vrai ; le rend au démontage. */
export function useEcranAllume(actif: boolean): void {
  useEffect(() => {
    if (!actif) return
    const garde = creerGardeEcran()
    garde.vouloir(true)
    return () => garde.arreter()
  }, [actif])
}

/**
 * Garde l'écran allumé pendant la tournée, sur les écrans du contrôle.
 *
 * Montée dans la coquille, donc SOUS le verrouillage du terminal : quand le
 * terminal se verrouille, la coquille est démontée et le verrou d'écran rendu
 * avec elle — l'écran peut alors s'éteindre. La fin de tournée (plus de
 * manifeste) et le réglage coupé le rendent aussi.
 */
export function EcranAllume() {
  const chemin = usePathname()
  const { manifest } = useTerminal()
  const { ecranAllume } = usePreferences()
  useEcranAllume(
    ecranAllumeVoulu({
      reglage: ecranAllume,
      enTournee: manifest !== null,
      chemin,
    })
  )
  return null
}
