"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import {
  DEFAULT_BOOKING,
  DEFAULT_SEARCH,
  IS_E2E,
  demoTrips,
  ticketingStorage,
  type BookingDraft,
} from "@/lib/ticketing"

export const SERVICE_CLASSES = [
  {
    id: "DEUXIEME",
    label: "2e classe",
    factor: 1,
    note: "Siège standard · bagage inclus",
  },
  {
    id: "PREMIERE",
    label: "1re classe",
    factor: 1.45,
    note: "Siège confort · voiture climatisée",
  },
  {
    id: "VIP",
    label: "VIP",
    factor: 1.9,
    note: "Espace premium · service à la place",
  },
] as const

export type ServiceClassId = (typeof SERVICE_CLASSES)[number]["id"]

export type TravelerDefaults = {
  firstName: string
  lastName: string
  phone: string
  email: string
}

/**
 * Complète uniquement les champs encore vides avec le profil du titulaire.
 * Un brouillon déjà commencé garde donc toujours la priorité.
 */
export function applyTravelerDefaults(
  booking: BookingDraft,
  traveler?: TravelerDefaults
): BookingDraft {
  return {
    ...booking,
    contactPhone: booking.contactPhone.trim() || traveler?.phone || "",
    contactEmail: booking.contactEmail?.trim() || traveler?.email || "",
    passengers: booking.passengers.map((passenger, index) => ({
      ...passenger,
      firstName:
        index === 0
          ? passenger.firstName.trim() || traveler?.firstName || ""
          : passenger.firstName,
      lastName:
        index === 0
          ? passenger.lastName.trim() || traveler?.lastName || ""
          : passenger.lastName,
      // Le front voyageur ne vend pas le choix d'un numéro de siège :
      // l'inventaire attribue automatiquement une place disponible.
      seatId: undefined,
    })),
  }
}

/** Réduction enfant, telle que déclarée dans le référentiel des remises. */
const CHILD_DISCOUNT = "ENFANT"

/**
 * Dossier de réservation en cours — classe, voyageurs, places, contact.
 *
 * Tout l'état vit ici, y compris la mutation de création : les deux vues sont
 * montées simultanément et ne doivent porter que du rendu, sous peine de
 * réserver deux fois les mêmes places.
 */
export function useBookingDraft(traveler?: TravelerDefaults) {
  const router = useRouter()
  const search = ticketingStorage.getSearch() ?? DEFAULT_SEARCH
  const storedTrip = ticketingStorage.getTrip()
  const trip = storedTrip ?? demoTrips(search)[0]!
  const passengerCount = trip.passengers || 1

  const [booking, setBooking] = useState<BookingDraft>(() => {
    const stored = ticketingStorage.getBooking()
    if (stored) return applyTravelerDefaults(stored, traveler)

    return applyTravelerDefaults(
      {
        ...DEFAULT_BOOKING,
        passengers: Array.from({ length: passengerCount }, (_, index) => ({
          ...DEFAULT_BOOKING.passengers[0]!,
          // Les enfants viennent après les adultes dans la recherche : leur
          // rang décide de la réduction appliquée au devis.
          discountCode: index >= search.adults ? CHILD_DISCOUNT : undefined,
          firstName: IS_E2E && index === 0 ? "Ariane" : "",
          lastName: IS_E2E && index === 0 ? "Moussavou" : "",
          emergencyPhone: IS_E2E ? "+241 07 00 00 00" : "",
        })),
        contactPhone: IS_E2E ? "+241 06 00 00 00" : "",
      },
      traveler
    )
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const canUseConvex = !IS_E2E && !trip.tripId.startsWith("trip-")

  const discountCodes = useMemo(
    () => booking.passengers.map((passenger) => passenger.discountCode ?? ""),
    [booking.passengers]
  )

  const quote = useQuery(
    api.functions.bookings.quote,
    canUseConvex
      ? {
          tripId: trip.tripId as never,
          originStationId: trip.originId as never,
          destinationStationId: trip.destinationId as never,
          serviceClass: booking.serviceClass,
          passengerCount,
          discountCodes,
        }
      : "skip"
  )

  const createBooking = useMutation(api.functions.bookings.create)

  const selectedClass =
    SERVICE_CLASSES.find((item) => item.id === booking.serviceClass) ??
    SERVICE_CLASSES[0]

  const total =
    quote?.totalTtc ??
    Math.round(trip.priceXaf * selectedClass.factor * passengerCount)

  const passengersNamed = booking.passengers.every(
    (passenger) => passenger.firstName.trim() && passenger.lastName.trim()
  )
  const contactValid = booking.contactPhone.trim().length >= 8
  const isValid = passengersNamed && contactValid

  function setServiceClass(serviceClass: ServiceClassId) {
    // Les places appartiennent à une voiture, donc à une classe : changer de
    // classe invalide la sélection.
    setBooking((current) => ({
      ...current,
      serviceClass,
      passengers: current.passengers.map((passenger) => ({
        ...passenger,
        seatId: undefined,
      })),
    }))
  }

  function updatePassenger(
    index: number,
    patch: Partial<BookingDraft["passengers"][number]>
  ) {
    setBooking((current) => ({
      ...current,
      passengers: current.passengers.map((passenger, passengerIndex) =>
        passengerIndex === index ? { ...passenger, ...patch } : passenger
      ),
    }))
  }

  function updateContact(patch: Partial<BookingDraft>) {
    setBooking((current) => ({ ...current, ...patch }))
  }

  async function submit() {
    setError(undefined)
    if (!isValid) {
      setError(
        "Renseignez le nom de chaque voyageur et un téléphone de contact."
      )
      return false
    }
    setSubmitting(true)
    try {
      let reference = "RS-2026-084517"
      let holdExpiresAt = Date.now() + 15 * 60_000
      if (canUseConvex) {
        const result = await createBooking({
          tripId: trip.tripId as never,
          originStationId: trip.originId as never,
          destinationStationId: trip.destinationId as never,
          serviceClass: booking.serviceClass,
          passengers: booking.passengers.map((passenger) => ({
            ...passenger,
            seatId: passenger.seatId as never,
          })),
          contactPhone: booking.contactPhone,
          contactEmail: booking.contactEmail || undefined,
        })
        reference = result.reference
        holdExpiresAt = result.holdExpiresAt
      }
      ticketingStorage.setBooking({ ...booking, reference, holdExpiresAt })
      router.push("/paiement")
      return true
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La réservation n'a pas pu être créée."
      )
      return false
    } finally {
      setSubmitting(false)
    }
  }

  return {
    trip,
    search,
    hasTrip: Boolean(storedTrip) || IS_E2E,
    booking,
    passengerCount,
    selectedClass,
    quote,
    total,
    isValid,
    passengersNamed,
    contactValid,
    submitting,
    error,
    setServiceClass,
    updatePassenger,
    updateContact,
    submit,
  }
}
