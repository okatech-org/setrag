"use client"

import type { Route } from "next"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

/**
 * Sélection portée par l’adresse (`?journee=…&caisse=…`) : un dossier ouvert
 * se partage, se recharge et revient avec le bouton Précédent.
 */
export function useSelectionUrl<const K extends string>(cles: readonly K[]) {
  const params = useSearchParams()
  const router = useRouter()
  const chemin = usePathname()
  const valeurs = Object.fromEntries(cles.map((cle) => [cle, params.get(cle) ?? undefined])) as Record<K, string | undefined>
  const choisir = useCallback(
    (changements: Partial<Record<K, string | undefined>>) => {
      const suivants = new URLSearchParams(params.toString())
      for (const [cle, valeur] of Object.entries(changements) as [K, string | undefined][]) {
        if (valeur) suivants.set(cle, valeur)
        else suivants.delete(cle)
      }
      const requete = suivants.toString()
      router.replace(`${chemin}${requete ? `?${requete}` : ""}` as Route, { scroll: false })
    },
    [params, router, chemin]
  )
  return [valeurs, choisir] as const
}
