"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import {
  DEFAULT_BOOKING,
  DEFAULT_SEARCH,
  IS_E2E,
  demoTrips,
  ticketingStorage,
} from "@/lib/ticketing"

export const PAYMENT_METHODS = [
  {
    id: "airtel_money",
    label: "Airtel Money",
    note: "Validation par code secret sur votre téléphone",
  },
  {
    id: "moov_money",
    label: "Moov Money",
    note: "Validation par code secret sur votre téléphone",
  },
  {
    id: "visa",
    label: "Carte bancaire",
    note: "Visa · Mastercard · paiement sécurisé",
  },
  {
    id: "guichet",
    label: "Payer au guichet",
    note: "Réservation tenue jusqu’à l’échéance, à régler en gare",
  },
] as const

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"]

export const CGV_VERSION = "cgv-2026-07"

/**
 * Compte à rebours du blocage des places.
 *
 * Isolé de l'état de paiement : il bat à la seconde et ne doit pas entraîner
 * le reste du formulaire dans son rythme de rendu.
 */
function useHoldCountdown(holdExpiresAt: number | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!holdExpiresAt) return
    // Première valeur posée par le minuteur lui-même : la calculer pendant le
    // rendu la ferait diverger entre le serveur et le navigateur.
    const tick = () =>
      setRemaining(Math.max(0, Math.floor((holdExpiresAt - Date.now()) / 1000)))
    const interval = window.setInterval(tick, 1_000)
    tick()
    return () => window.clearInterval(interval)
  }, [holdExpiresAt])

  return remaining
}

/** « 12:04 », ou null tant que le minuteur n'a pas démarré. */
export function formatCountdown(seconds: number | null) {
  if (seconds === null) return null
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * Paiement du dossier.
 *
 * L'état vit ici et non dans les vues : la mutation de confirmation n'est pas
 * idempotente côté interface, et deux formulaires montés en parallèle
 * pourraient la déclencher chacun de leur côté.
 */
export function usePayment() {
  const router = useRouter()
  const storedTrip = ticketingStorage.getTrip()
  const storedBooking = ticketingStorage.getBooking()
  const trip = storedTrip ?? demoTrips(DEFAULT_SEARCH)[0]!
  const booking = storedBooking ?? {
    ...DEFAULT_BOOKING,
    reference: "RS-2026-084517",
  }

  const [method, setMethod] = useState<PaymentMethodId>("airtel_money")
  const [payerPhone, setPayerPhone] = useState(booking.contactPhone)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const confirm = useMutation(api.functions.bookings.confirm)
  const remaining = useHoldCountdown(booking.holdExpiresAt)

  const total = Math.round(
    trip.priceXaf *
      booking.passengers.length *
      (booking.serviceClass === "PREMIERE"
        ? 1.45
        : booking.serviceClass === "VIP"
          ? 1.9
          : 1)
  )

  const ready = Boolean(storedTrip && storedBooking) || IS_E2E
  const expired = remaining === 0
  const needsPayerPhone = method === "airtel_money" || method === "moov_money"

  async function submit() {
    if (!accepted) {
      setError("Acceptez les conditions générales de vente pour payer.")
      return
    }
    if (needsPayerPhone && payerPhone.trim().length < 8) {
      setError("Indiquez le numéro qui recevra la demande de validation.")
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      // La référence de démonstration ne correspond à aucune vente : on ne
      // sollicite le serveur que pour un vrai dossier.
      if (
        !IS_E2E &&
        booking.reference &&
        booking.reference !== "RS-2026-084517" &&
        method !== "guichet"
      ) {
        await confirm({
          reference: booking.reference,
          method:
            method === "visa"
              ? "visa"
              : (method as "airtel_money" | "moov_money"),
          payerPhone,
          cgvVersion: CGV_VERSION,
        })
      }
      router.push(
        method === "guichet"
          ? "/confirmation?mode=guichet"
          : "/paiement/attente"
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Le paiement n’a pas pu être lancé."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return {
    trip,
    booking,
    ready,
    method,
    setMethod,
    payerPhone,
    setPayerPhone,
    needsPayerPhone,
    accepted,
    setAccepted,
    error,
    clearError: () => setError(undefined),
    submitting,
    total,
    remaining,
    expired,
    submit,
  }
}
