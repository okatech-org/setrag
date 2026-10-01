import { Linking, Platform } from "react-native"
import * as Calendar from "expo-calendar"
import { useAction } from "convex/react"
import type { GenericId } from "convex/values"

import { api } from "@workspace/backend/generated"

import type { Booking } from "./bookings-cache"
import { nomTrain } from "./voyage"

/** Wallet du téléphone : Apple sur iOS, Google ailleurs. */
export const nomWallet = Platform.OS === "ios" ? "Apple Wallet" : "Google Wallet"

/** Ce que l'on fait d'un billet émis : Wallet, PDF, calendrier. */
export function useActionsBillet() {
  const creerPass = useAction(api.functions.wallet.createPass)
  const pdfBillet = useAction(api.functions.documents.ticketPdf)

  return {
    async ajouterAuWallet(ticketId: GenericId<"tickets">, telephoneContact?: string) {
      const pass = await creerPass({ ticketId, contactPhone: telephoneContact, provider: Platform.OS === "ios" ? "apple" : "google" })
      if (!pass.url) throw new Error(`${nomWallet} n'est pas encore disponible.`)
      await Linking.openURL(pass.url)
    },

    async ouvrirPdf(ticketId: GenericId<"tickets">, telephoneContact?: string) {
      const document = await pdfBillet({ ticketId, contactPhone: telephoneContact })
      await Linking.openURL(document.url)
    },

    async ajouterAuCalendrier(dossier: Booking) {
      const { trip, origin, destination, segment, sale, tickets } = dossier
      if (!trip) throw new Error("L'horaire de ce train n'est pas disponible.")
      const autorisation = await Calendar.requestCalendarPermissions(Platform.OS === "ios")
      if (!autorisation.granted) throw new Error("Autorisez l'accès au calendrier dans les réglages du téléphone.")
      const calendriers = Platform.OS === "ios" ? [] : await Calendar.getCalendars(Calendar.EntityTypes.EVENT)
      const calendrier =
        Platform.OS === "ios"
          ? Calendar.getDefaultCalendarSync()
          : (calendriers.find((item) => item.allowsModifications && item.isPrimary) ?? calendriers.find((item) => item.allowsModifications))
      if (!calendrier) throw new Error("Aucun calendrier modifiable sur ce téléphone.")
      await calendrier.addEventWithForm({
        title: `${nomTrain(trip.trainType, trip.trainNumber)} · ${origin?.name ?? "Départ"} → ${destination?.name ?? "Arrivée"}`,
        startDate: new Date(segment?.departureAt ?? trip.departureAt),
        endDate: new Date(segment?.arrivalAt ?? trip.arrivalAt),
        location: origin ? `Gare de ${origin.name}` : undefined,
        notes: `Réservation ${sale.number} · ${tickets.length} billet${tickets.length > 1 ? "s" : ""}. Présentez le code de chaque billet au contrôle.`,
      })
    },
  }
}
