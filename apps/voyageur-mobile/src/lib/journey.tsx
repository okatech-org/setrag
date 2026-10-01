import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import type { GenericId } from "convex/values"

import { aujourdhui } from "./format"
import type { Classe } from "./voyage"

export type Gare = {
  _id: GenericId<"stations">
  code: string
  name: string
  kilometerPoint: number
}

export type Recherche = {
  depart: Gare | null
  arrivee: Gare | null
  jour: string
  voyageurs: number
}

/** Le trajet choisi dans les résultats : de quoi tenir le résumé jusqu'au billet. */
export type Choix = {
  tripId: GenericId<"trips">
  departAt: number
  arriveeAt: number
  trainType: string
  trainNumber: string
  /** Prix d'une place adulte, par classe. */
  unitaires: Partial<Record<Classe, number>>
  disponibles: Partial<Record<Classe, number>>
}

export type Voyageur = {
  prenom: string
  nom: string
  civilite: "M" | "F"
  reduction?: string
  naissance?: string
}

/** Places tenues pendant le paiement. */
export type Tenue = {
  reference: string
  telephoneContact: string
  expireAt: number
  totalTtc: number
  billets: number
  classe: Classe
}

export type MoyenPaiement = "airtel_money" | "moov_money" | "carte" | "clickpay"

type Parcours = {
  recherche: Recherche
  setRecherche: (suivante: Recherche) => void
  choix: Choix | null
  setChoix: (suivant: Choix | null) => void
  classe: Classe
  setClasse: (suivante: Classe) => void
  voyageurs: Voyageur[]
  setVoyageurs: (suivants: Voyageur[]) => void
  tenue: Tenue | null
  setTenue: (suivante: Tenue | null) => void
  /** Moyen et numéro du paiement lancé, pour l'écran d'attente. */
  paiement: { moyen: MoyenPaiement; numero?: string } | null
  setPaiement: (suivant: { moyen: MoyenPaiement; numero?: string } | null) => void
}

const ParcoursContext = createContext<Parcours | null>(null)

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [recherche, setRecherche] = useState<Recherche>(() => ({ depart: null, arrivee: null, jour: aujourdhui(), voyageurs: 1 }))
  const [choix, setChoix] = useState<Choix | null>(null)
  const [classe, setClasse] = useState<Classe>("DEUXIEME")
  const [voyageurs, setVoyageurs] = useState<Voyageur[]>([])
  const [tenue, setTenue] = useState<Tenue | null>(null)
  const [paiement, setPaiement] = useState<Parcours["paiement"]>(null)

  const valeur = useMemo(
    () => ({ recherche, setRecherche, choix, setChoix, classe, setClasse, voyageurs, setVoyageurs, tenue, setTenue, paiement, setPaiement }),
    [recherche, choix, classe, voyageurs, tenue, paiement],
  )

  return <ParcoursContext.Provider value={valeur}>{children}</ParcoursContext.Provider>
}

export function useJourney() {
  const valeur = useContext(ParcoursContext)
  if (!valeur) throw new Error("JourneyProvider manquant")
  return valeur
}

/**
 * Aucun opérateur de paiement n'est encore relié : le serveur enregistre un
 * paiement simulé (`provider: "simule"`). Les écrans de paiement le disent ;
 * passer à `false` le jour où Airtel, Moov et la carte sont branchés.
 */
export const PAIEMENT_SIMULE = true
