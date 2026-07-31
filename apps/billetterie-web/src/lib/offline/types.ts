import type { FunctionReturnType } from "convex/server"

import type { api } from "@workspace/backend/generated"

/**
 * Formes conservées hors ligne.
 *
 * Elles sont DÉRIVÉES des fonctions Convex, jamais recopiées : un champ ajouté
 * au dossier côté serveur suit ici sans intervention, et un champ supprimé
 * casse la compilation au lieu de produire un billet incomplet sur le quai.
 */
export type Dossier = FunctionReturnType<
  typeof api.functions.bookings.listMine
>[number]

export type DetailTrajet = FunctionReturnType<typeof api.functions.trips.get>

/** Dossier du voyageur, tel qu'il sera relu sans réseau. */
export type DossierHorsLigne = {
  /** Numéro de vente : c'est lui qui sert de référence dans les URL. */
  reference: string
  dossier: Dossier
  /** Départ du trajet, pour purger les dossiers devenus inutiles. */
  departAt: number
  enregistreLe: number
}

/** Parcours d'un train : ses arrêts, ses heures, son retard au dernier relevé. */
export type ParcoursHorsLigne = {
  tripId: string
  trainNumber: string
  /** Date de circulation au format AAAA-MM-JJ, comme côté serveur. */
  serviceDate: string
  detail: DetailTrajet
  enregistreLe: number
}

/** Ce que la base sait d'elle-même : à qui elle appartient, et de quand elle date. */
export type EtatLocal = {
  /**
   * Identifiant du voyageur propriétaire des données.
   *
   * Un téléphone peut passer de main en main. Sans ce marqueur, le second
   * voyageur ouvrirait les billets du premier.
   */
  utilisateur: string | null
  /** Dernier instant où les dossiers ont été reçus du serveur. */
  billetsRecusLe: number | null
}
