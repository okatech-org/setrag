"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

/**
 * Ce qu'un écran demande à la coquille : être sombre (le viseur, toujours
 * sombre, jour comme nuit) ou masquer les onglets (un verdict recouvre tout
 * l'écran). Le bandeau de service, lui, ne se masque jamais.
 */
export interface Apparence {
  sombre: boolean
  sansOnglets: boolean
}

const PAR_DEFAUT: Apparence = { sombre: false, sansOnglets: false }

const Contexte = createContext<{
  apparence: Apparence
  demander: (apparence: Apparence) => void
} | null>(null)

export function ApparenceProvider({ children }: { children: ReactNode }) {
  const [apparence, demander] = useState<Apparence>(PAR_DEFAUT)
  const valeur = useMemo(() => ({ apparence, demander }), [apparence])
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useApparenceCourante(): Apparence {
  return useContext(Contexte)?.apparence ?? PAR_DEFAUT
}

/**
 * Déclare l'apparence de l'écran courant, pour la durée de son affichage.
 * L'écran qui s'en va rend l'apparence par défaut.
 */
export function useApparence({ sombre = false, sansOnglets = false }: Partial<Apparence>) {
  const demander = useContext(Contexte)?.demander
  useEffect(() => {
    if (!demander) return
    demander({ sombre, sansOnglets })
    return () => demander(PAR_DEFAUT)
  }, [demander, sombre, sansOnglets])
}
