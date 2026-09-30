"use client"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { useParcoursLocal } from "@/fonctionnalites/suivi/use-parcours-local"

import type { Dossier } from "./dossier"

/** Heures du voyageur : sa montée et sa descente, pas celles du train entier. */
export type Horaires = { departAt: number | null; arriveeAt: number | null }

/**
 * Heures de montée et de descente d'un dossier.
 *
 * Le dossier ne porte que les heures du train, de terminus à terminus. Un
 * voyageur qui monte à Ndjolé et descend à Lastourville doit lire les siennes :
 * quand sa gare n'est pas un terminus, on les prend dans les arrêts du train —
 * au serveur, ou hors réseau dans le parcours enregistré sur l'appareil.
 * Tous les billets d'un dossier partagent le même trajet.
 */
export function useHoraires(dossier: Dossier | null | undefined): Horaires {
  // Le backend fournit désormais les heures du voyageur (`segment`) ; les
  // copies locales enregistrées avant cela passent encore par les arrêts.
  const segment = dossier && "segment" in dossier ? dossier.segment : null
  const trip = segment ? null : (dossier?.trip ?? null)
  const titre = dossier?.tickets[0]
  const origine = titre?.originStationId
  const destination = titre?.destinationStationId
  const departConnu =
    trip && origine === trip.originStationId ? trip.departureAt : null
  const arriveeConnue =
    trip && destination === trip.destinationStationId ? trip.arrivalAt : null
  const besoin =
    trip !== null &&
    titre !== undefined &&
    (departConnu === null || arriveeConnue === null)

  const serveur = useQuery(
    api.functions.trips.get,
    besoin && trip ? { tripId: trip._id } : "skip"
  )
  const local = useParcoursLocal(
    trip?.trainNumber ?? "",
    trip?.serviceDate ?? "",
    besoin && serveur === undefined
  )
  const arrets = (serveur ?? local?.detail)?.stops
  const montee = arrets?.find((arret) => arret.stationId === origine)
  const descente = arrets?.find((arret) => arret.stationId === destination)

  if (segment) return { departAt: segment.departureAt, arriveeAt: segment.arrivalAt }
  return {
    departAt: departConnu ?? montee?.departureAt ?? montee?.arrivalAt ?? null,
    arriveeAt:
      arriveeConnue ?? descente?.arrivalAt ?? descente?.departureAt ?? null,
  }
}
