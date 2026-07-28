"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import {
  DEFAULT_SEARCH,
  IS_E2E,
  demoTrips,
  ticketingStorage,
  type SearchDraft,
  type SelectedTrip,
  type Station,
} from "@/lib/ticketing"

export type Sort = "horaire" | "duree" | "prix"
export type TrainTypeFilter = "TOUS" | "EXPRESS" | "OMNIBUS"

export type ResultTrip = SelectedTrip & {
  /** Places restantes par classe sur la portion demandée. */
  availableByClass: Record<string, number>
  distanceKm: number
  status: "planifie" | "a_lheure" | "retarde" | "annule" | "termine"
  delayMinutes: number
}

export type ResultsState = "no-search" | "loading" | "empty" | "ready"

/**
 * Résultats de recherche — état partagé par la liste du bureau et celle du
 * mobile.
 *
 * Le tri appartient au bureau, le filtre par type d'engin au mobile : les deux
 * vues partagent la même instance, appelée par leur parent commun, pour qu'un
 * changement de largeur ne réinitialise pas la sélection.
 */
export function useTripResults() {
  const params = useSearchParams()
  const stored = ticketingStorage.getSearch()
  const hasSearch = IS_E2E || Boolean(params.get("origin") || stored)

  const search: SearchDraft = {
    originId:
      params.get("origin") ?? stored?.originId ?? DEFAULT_SEARCH.originId,
    destinationId:
      params.get("destination") ??
      stored?.destinationId ??
      DEFAULT_SEARCH.destinationId,
    serviceDate:
      params.get("date") ?? stored?.serviceDate ?? DEFAULT_SEARCH.serviceDate,
    adults: Number(params.get("adults") ?? stored?.adults ?? 1),
    children: Number(params.get("children") ?? stored?.children ?? 0),
  }

  // Les identifiants de démonstration ne correspondent à rien dans Convex :
  // on bascule alors sur le jeu d'essai plutôt que d'interroger le serveur.
  const canQuery = !IS_E2E && !search.originId.startsWith("station-")

  const stations = useQuery(
    api.functions.referential.listStations,
    canQuery ? { includeInactive: false } : "skip"
  )
  const results = useQuery(
    api.functions.trips.search,
    canQuery
      ? {
          originStationId: search.originId as never,
          destinationStationId: search.destinationId as never,
          serviceDate: search.serviceDate,
          passengers: search.adults + search.children,
        }
      : "skip"
  )

  const [sort, setSort] = useState<Sort>("horaire")
  const [typeFilter, setTypeFilter] = useState<TrainTypeFilter>("TOUS")

  const trips = useMemo<ResultTrip[]>(() => {
    if (IS_E2E) {
      return demoTrips(search).map((trip) => ({
        ...trip,
        availableByClass: { DEUXIEME: trip.available },
        distanceKm: 648,
        status: "a_lheure" as const,
        delayMinutes: 0,
      }))
    }
    if (!canQuery || !results) return []

    const availableStations = (stations as Station[] | undefined) ?? []
    const origin = availableStations.find((s) => s._id === search.originId)
    const destination = availableStations.find(
      (s) => s._id === search.destinationId
    )

    return results.map((result) => ({
      tripId: result.trip._id,
      trainNumber: result.trip.trainNumber,
      trainType: result.trip.trainType,
      departureAt: result.departureAt,
      arrivalAt: result.arrivalAt,
      originId: search.originId,
      destinationId: search.destinationId,
      originName: origin?.name ?? "Gare de départ",
      destinationName: destination?.name ?? "Gare d'arrivée",
      passengers: search.adults + search.children,
      priceXaf: result.trip.trainType === "EXPRESS" ? 35_000 : 28_500,
      available: Math.max(...Object.values(result.availableByClass), 0),
      fromIndex: result.fromIndex,
      toIndex: result.toIndex,
      availableByClass: result.availableByClass,
      distanceKm: result.distanceKm,
      status: result.trip.status,
      delayMinutes: result.trip.delayMinutes ?? 0,
    }))
    // `search` est reconstruit à chaque rendu ; ses champs suffisent à décider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canQuery,
    results,
    stations,
    search.originId,
    search.destinationId,
    search.adults,
    search.children,
  ])

  const sorted = useMemo(() => {
    const list = [...trips].sort((a, b) => {
      if (sort === "prix") return a.priceXaf - b.priceXaf
      if (sort === "duree")
        return a.arrivalAt - a.departureAt - (b.arrivalAt - b.departureAt)
      return a.departureAt - b.departureAt
    })
    if (typeFilter === "TOUS") return list
    return list.filter((trip) => trip.trainType === typeFilter)
  }, [trips, sort, typeFilter])

  const state: ResultsState = !hasSearch
    ? "no-search"
    : canQuery && results === undefined
      ? "loading"
      : trips.length === 0
        ? "empty"
        : "ready"

  return {
    search,
    canQuery,
    state,
    trips: sorted,
    /** Nombre avant filtrage — le filtre mobile affiche « 0 sur 3 ». */
    totalCount: trips.length,
    sort,
    setSort,
    typeFilter,
    setTypeFilter,
  }
}
