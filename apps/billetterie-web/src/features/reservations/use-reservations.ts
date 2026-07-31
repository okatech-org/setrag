"use client"

import { useMemo, useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { useDonneesLocales } from "@/components/offline/donnees-locales"
import { useToday } from "@/hooks/use-today"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

export type ReservationsState =
  | "loading"
  | "anonymous"
  /** Hors réseau, et rien n'a jamais été enregistré sur cet appareil. */
  | "hors-ligne"
  | "empty"
  | "ready"

/**
 * Dossiers du voyageur.
 *
 * Les dossiers eux-mêmes viennent du fournisseur de données locales, pas d'une
 * requête posée ici : ils doivent être enregistrés sur l'appareil même si le
 * voyageur n'ouvre jamais cet écran avec du réseau.
 *
 * L'annulation d'une option non réglée passe par une mutation : elle est donc
 * tenue ici, une seule fois, et non dans chacune des deux vues.
 */
export function useReservations() {
  const { isAuthenticated, isLoading } = useTravelerAuth()
  const { dossiers, depuisLeCache, chargement, enLigne, recuLe } =
    useDonneesLocales()
  const today = useToday()
  const cancelHold = useMutation(api.functions.bookings.cancelHold)

  const [message, setMessage] = useState<string>()
  const [cancelling, setCancelling] = useState<string>()

  /**
   * Les billets déjà enregistrés priment sur l'état de la session.
   *
   * Hors réseau, la session ne peut pas être revalidée : le voyageur paraît
   * déconnecté alors qu'il tient son téléphone en gare. Lui présenter un
   * écran de connexion à ce moment précis reviendrait à lui refuser le billet
   * qu'il a déjà payé et que l'appareil détient.
   */
  const state: ReservationsState =
    dossiers.length > 0
      ? "ready"
      : chargement || isLoading
        ? "loading"
        : !enLigne
          ? "hors-ligne"
          : !isAuthenticated
            ? "anonymous"
            : "empty"

  /**
   * Le partage en « à venir » et « passés » attend que l'horloge du navigateur
   * soit disponible : la trancher pendant le rendu serveur classerait un même
   * billet des deux côtés selon le fuseau de la machine.
   */
  const { upcoming, past } = useMemo(() => {
    const items = dossiers
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
  }, [dossiers, today])

  async function cancel(reference: string) {
    if (!enLigne) {
      setMessage(
        "L’annulation demande une connexion : elle libère des places pour d’autres voyageurs."
      )
      return
    }
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
    items: dossiers,
    upcoming,
    past,
    message,
    cancelling,
    cancel,
    /** Les billets affichés viennent de la copie locale de l'appareil. */
    depuisLeCache,
    /** Dernière réception depuis le serveur, pour dater ce qui est montré. */
    recuLe,
    enLigne,
  }
}
