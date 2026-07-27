"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import {
  DEFAULT_SEARCH,
  DEMO_STATIONS,
  IS_E2E,
  ticketingStorage,
  type SearchDraft,
  type Station,
} from "@/lib/ticketing"

/**
 * Brouillon de recherche — gares, date, voyageurs — partagé par le formulaire
 * du bureau et la carte de recherche mobile.
 *
 * Les deux vues sont montées en même temps et tiennent chacune leur instance :
 * elles ne se synchronisent qu'au travers du stockage de session, relu au
 * montage. Un changement de largeur en cours de saisie repart donc du dernier
 * état enregistré, ce qui suffit — le point de rupture ne bouge pas pendant
 * qu'on remplit un formulaire.
 */
export function useSearchDraft() {
  const router = useRouter()
  const convexStations = useQuery(
    api.functions.referential.listStations,
    IS_E2E ? "skip" : { includeInactive: false }
  )
  const stations = useMemo(
    () =>
      convexStations?.length ? (convexStations as Station[]) : DEMO_STATIONS,
    [convexStations]
  )

  const [stored, setDraft] = useState<SearchDraft>(
    () => ticketingStorage.getSearch() ?? DEFAULT_SEARCH
  )
  const [submitted, setSubmitted] = useState(false)

  /**
   * Le brouillon part des gares de démonstration, dont les identifiants
   * n'existent pas dans le référentiel Convex. Sans recalage, la recherche
   * porterait sur des gares inconnues — et l'affichage tombait sur « — ».
   * On corrige à la lecture plutôt que dans un effet, pour ne pas déclencher
   * un second rendu à chaque arrivée du référentiel.
   */
  const draft = useMemo<SearchDraft>(() => {
    const first = stations[0]
    const last = stations.at(-1)
    if (!first || !last) return stored
    const known = (id: string) => stations.some((station) => station._id === id)
    return {
      ...stored,
      originId: known(stored.originId) ? stored.originId : first._id,
      destinationId: known(stored.destinationId)
        ? stored.destinationId
        : last._id,
    }
  }, [stored, stations])

  const invalidStations = draft.originId === draft.destinationId
  const invalidPassengers = draft.adults < 1 && draft.children > 0
  const noPassengers = draft.adults + draft.children < 1

  // Les mutations partent du brouillon recalé, jamais de l'état brut : sinon
  // un simple changement de date réintroduirait les gares de démonstration.
  function commit(next: SearchDraft) {
    ticketingStorage.setSearch(next)
    setDraft(next)
  }

  function update(patch: Partial<SearchDraft>) {
    commit({ ...draft, ...patch })
  }

  function swapStations() {
    commit({
      ...draft,
      originId: draft.destinationId,
      destinationId: draft.originId,
    })
  }

  /** Renvoie `false` quand la recherche n'est pas lançable en l'état. */
  function submit() {
    setSubmitted(true)
    if (invalidStations || invalidPassengers || noPassengers) return false
    commit(draft)
    const query = new URLSearchParams({
      origin: draft.originId,
      destination: draft.destinationId,
      date: draft.serviceDate,
      adults: String(draft.adults),
      children: String(draft.children),
    })
    router.push(`/resultats?${query.toString()}`)
    return true
  }

  function stationName(id: string) {
    return stations.find((station) => station._id === id)?.name ?? "—"
  }

  return {
    draft,
    stations,
    stationName,
    submitted,
    invalidStations,
    invalidPassengers,
    noPassengers,
    update,
    swapStations,
    submit,
  }
}
