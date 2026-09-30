"use client"

import { useMemo } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Jours, type Jour } from "@workspace/ui/components/jours"

import type { Gare } from "@/fonctionnalites/reference/use-reference"
import { ajouterJours, jourEtQuantieme, prixCourt } from "@/lib/format"

import { joursEntre, plusTard, plusTot } from "./modele"

export interface Trajet {
  originStationId: Gare["_id"]
  destinationStationId: Gare["_id"]
  passengers: number
  discountCodes?: string[]
}

/** Le backend borne un calendrier à 21 jours par requête. */
const JOURS_PAR_REQUETE = 21

/**
 * La bande des jours autour de la date cherchée : trois de part et d'autre,
 * bornés à la fenêtre de vente. Chaque jour porte le prix le plus bas du
 * groupe, ou dit qu'il est complet ; le moins cher est signalé en mots.
 */
export function BandeJours({
  trajet,
  date,
  aujourdhui,
  finVente,
  onChoisir,
}: {
  trajet: Trajet
  date: string
  aujourdhui: string
  finVente: string
  onChoisir: (date: string) => void
}) {
  const debut = plusTard(
    aujourdhui,
    plusTot(ajouterJours(date, -3), ajouterJours(finVente, -6))
  )
  const nombre = Math.max(1, Math.min(7, joursEntre(debut, finVente) + 1))
  const calendrier = useQuery(api.functions.trips.fareCalendar, {
    ...trajet,
    from: debut,
    days: nombre,
  })

  const jours = useMemo((): Jour[] => {
    const parDate = new Map(calendrier?.map((jour) => [jour.serviceDate, jour]))
    const prix = [...parDate.values()].flatMap((jour) =>
      jour.prixMinTtc === null ? [] : [jour.prixMinTtc]
    )
    const meilleur =
      prix.length > 1 && new Set(prix).size > 1 ? Math.min(...prix) : null
    return Array.from({ length: nombre }, (_, i) => {
      const valeur = ajouterJours(debut, i)
      const info = parDate.get(valeur)
      if (!info)
        return { valeur, libelle: jourEtQuantieme(valeur), detail: "…" }
      if (info.complet)
        return {
          valeur,
          libelle: jourEtQuantieme(valeur),
          detail: "complet",
          etat: "complet",
        }
      if (info.trains === 0)
        return { valeur, libelle: jourEtQuantieme(valeur), detail: "aucun" }
      if (info.prixMinTtc === null)
        return {
          valeur,
          libelle: jourEtQuantieme(valeur),
          detail: `${info.trainsDisponibles} train${info.trainsDisponibles > 1 ? "s" : ""}`,
        }
      return {
        valeur,
        libelle: jourEtQuantieme(valeur),
        detail: prixCourt(info.prixMinTtc),
        etat: info.prixMinTtc === meilleur ? "meilleur" : undefined,
      }
    })
  }, [calendrier, debut, nombre])

  return (
    <Jours
      jours={jours}
      valeur={date}
      onChange={onChoisir}
      label="Jour du voyage (prix le plus bas du groupe, en FCFA)"
    />
  )
}

/**
 * Le prochain jour, après `apres`, où un train a encore de la place pour le
 * groupe. `undefined` pendant la recherche, `null` s'il n'y en a aucun d'ici
 * la fin de la fenêtre de vente.
 */
export function useProchainJour(
  trajet: Trajet,
  apres: string,
  finVente: string,
  actif: boolean
): string | null | undefined {
  const debut = ajouterJours(apres, 1)
  const restants = joursEntre(debut, finVente) + 1
  const premiers = Math.min(JOURS_PAR_REQUETE, restants)
  const suivants = Math.min(JOURS_PAR_REQUETE, restants - premiers)

  const premier = useQuery(
    api.functions.trips.fareCalendar,
    actif && premiers > 0 ? { ...trajet, from: debut, days: premiers } : "skip"
  )
  const trouve = premier?.find(
    (jour) => jour.trainsDisponibles > 0
  )?.serviceDate
  const second = useQuery(
    api.functions.trips.fareCalendar,
    actif && premier && !trouve && suivants > 0
      ? { ...trajet, from: ajouterJours(debut, premiers), days: suivants }
      : "skip"
  )

  if (!actif || premiers <= 0) return null
  if (premier === undefined) return undefined
  if (trouve) return trouve
  if (suivants <= 0) return null
  if (second === undefined) return undefined
  return second.find((jour) => jour.trainsDisponibles > 0)?.serviceDate ?? null
}
