"use client"

import { useMemo } from "react"

import {
  ecrireSession,
  lireSession,
  useValeurSession,
} from "./stockage-session"

/**
 * L'accès d'un invité à sa réservation.
 *
 * Sans compte, le serveur ne rend une réservation qu'à qui en donne la
 * référence ET le téléphone de contact (`bookings.getByReference`,
 * `bookings.cancelHold`). Le tunnel mémorise donc ce téléphone, par
 * référence, pour que paiement, attente et confirmation le relisent sans le
 * redemander.
 *
 * sessionStorage et non localStorage : c'est une donnée personnelle, elle
 * s'efface avec l'onglet. Elle ne va jamais dans l'adresse. Le numéro est
 * gardé sous la forme envoyée au serveur (voir `lireTelephone`).
 */

const CLE = "setrag:contact-reservation"
/** Au-delà, les plus anciennes références sont oubliées. */
const MAXIMUM = 12

type Carnet = Record<string, string>

function lireCarnet(brut: string | null | undefined): Carnet {
  if (!brut) return {}
  try {
    const valeur = JSON.parse(brut) as unknown
    return valeur && typeof valeur === "object" ? (valeur as Carnet) : {}
  } catch {
    return {}
  }
}

/** Téléphone de contact d'une réservation, s'il a été donné dans cet onglet. */
export function lireContact(
  reference: string | null | undefined
): string | null {
  if (!reference) return null
  return lireCarnet(lireSession(CLE))[reference] ?? null
}

/** Retient le téléphone de contact d'une réservation (forme normalisée). */
export function memoriserContact(reference: string, telephone: string) {
  const carnet = lireCarnet(lireSession(CLE))
  delete carnet[reference]
  const entrees = [
    ...Object.entries(carnet),
    [reference, telephone] as const,
  ].slice(-MAXIMUM)
  ecrireSession(CLE, JSON.stringify(Object.fromEntries(entrees)))
}

/**
 * Le même téléphone, réactif. `undefined` tant que le navigateur n'a pas lu
 * le stockage (rendu serveur, hydratation), `null` s'il n'y est pas.
 */
export function useContact(
  reference: string | null | undefined
): string | null | undefined {
  const brut = useValeurSession(CLE)
  return useMemo(() => {
    if (brut === undefined) return undefined
    return reference ? (lireCarnet(brut)[reference] ?? null) : null
  }, [brut, reference])
}
