"use client"

import { useMemo, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { useToday } from "@/hooks/use-today"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

export type ReservationsState =
  | "loading"
  | "anonymous"
  | "empty"
  | "ready"

/**
 * Dossiers du voyageur.
 *
 * L'annulation d'une option non réglée passe par une mutation : elle est donc
 * tenue ici, une seule fois, et non dans chacune des deux vues.
 */
export function useReservations() {
  const { isAuthenticated, isLoading, isProfileReady } = useTravelerAuth()
  const today = useToday()

  const reservations = useQuery(
    api.functions.bookings.listMine,
    isAuthenticated && isProfileReady ? {} : "skip"
  )
  const cancelHold = useMutation(api.functions.bookings.cancelHold)

  const [message, setMessage] = useState<string>()
  const [cancelling, setCancelling] = useState<string>()

  const state: ReservationsState = isLoading
    ? "loading"
    : !isAuthenticated
      ? "anonymous"
      : !isProfileReady || reservations === undefined
        ? "loading"
        : reservations.length === 0
          ? "empty"
          : "ready"

  /**
   * Le partage en « à venir » et « passés » attend que l'horloge du navigateur
   * soit disponible : la trancher pendant le rendu serveur classerait un même
   * billet des deux côtés selon le fuseau de la machine.
   */
  const { upcoming, past } = useMemo(() => {
    const items = reservations ?? []
    if (today === null) return { upcoming: items, past: [] }
    const sorted = [...items].sort(
      (a, b) => (a.trip?.departureAt ?? 0) - (b.trip?.departureAt ?? 0)
    )
    return {
      upcoming: sorted.filter((item) => (item.trip?.departureAt ?? 0) >= today),
      past: sorted
        .filter((item) => (item.trip?.departureAt ?? 0) < today)
        .reverse(),
    }
  }, [reservations, today])

  async function cancel(reference: string) {
    setCancelling(reference)
    try {
      await cancelHold({ reference })
      setMessage(
        `La réservation ${reference} a été annulée et les places ont été libérées.`
      )
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "L’annulation n’a pas pu être effectuée."
      )
    } finally {
      setCancelling(undefined)
    }
  }

  return {
    state,
    items: reservations ?? [],
    upcoming,
    past,
    message,
    cancelling,
    cancel,
  }
}
