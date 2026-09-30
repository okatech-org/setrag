import type { FunctionReturnType } from "convex/server"
import type { Route } from "next"

import type { api } from "@workspace/backend/generated"

import {
  lireRecherche,
  parametresRecherche,
  type Recherche,
} from "@/lib/recherche"
import type { Classe } from "@/lib/voyage"

/**
 * Les adresses du tunnel d'achat. L'adresse porte le trajet, jamais la
 * personne : codes de gares, date, nombre de voyageurs, desserte, classe,
 * référence. Noms et téléphones restent dans l'onglet (sessionStorage).
 */

export type Dossier = NonNullable<
  FunctionReturnType<typeof api.functions.bookings.getByReference>
>

export function adresseResultats(recherche: Recherche): Route {
  return `/resultats?${new URLSearchParams(parametresRecherche(recherche))}` as Route
}

export function adresseReservation(
  recherche: Recherche,
  desserte: string,
  classe: Classe
): Route {
  return `/reservation?${new URLSearchParams({ desserte, classe, ...parametresRecherche(recherche) })}` as Route
}

export function adressePaiement(reference: string): Route {
  return `/paiement?${new URLSearchParams({ ref: reference })}` as Route
}

export function adresseAttente(reference: string): Route {
  return `/paiement/attente?${new URLSearchParams({ ref: reference })}` as Route
}

export function adresseConfirmation(reference: string): Route {
  return `/confirmation?${new URLSearchParams({ ref: reference })}` as Route
}

/** Retour à la connexion, puis à l'écran courant. */
export function adresseConnexion(retour: string): Route {
  return `/connexion?${new URLSearchParams({ retour })}` as Route
}

/**
 * La recherche d'où vient une réservation : pour refaire la recherche quand
 * la tenue a expiré, ou revenir aux voyageurs. Les enfants se comptent à la
 * réduction enfant portée par leur billet.
 */
export function rechercheDuDossier(
  dossier: Dossier,
  codeEnfant: string | null
): Recherche | null {
  const { trip, origin, destination, tickets } = dossier
  if (!trip || !origin || !destination || tickets.length === 0) return null
  const enfants = codeEnfant
    ? tickets.filter(
        (t) => (t.fare.fareCode ?? t.fare.discountCode) === codeEnfant
      ).length
    : 0
  return lireRecherche({
    get: (cle) =>
      ({
        de: origin.code,
        a: destination.code,
        le: trip.serviceDate,
        adultes: String(Math.max(1, tickets.length - enfants)),
        enfants: String(enfants),
      })[cle] ?? null,
  })
}
