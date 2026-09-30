"use client"

import { useSyncExternalStore } from "react"

/**
 * Petites valeurs gardées le temps de l'onglet (sessionStorage).
 *
 * Pour ce qui ne doit ni survivre à la visite ni figurer dans l'adresse :
 * téléphone de contact d'une réservation, brouillon des voyageurs. Le
 * stockage peut être refusé (navigation privée, quota) : on lit alors
 * `null`, et l'écran redemande ce qui manque.
 */

const EVENEMENT = "setrag:stockage-session"

export function lireSession(cle: string): string | null {
  try {
    return window.sessionStorage.getItem(cle)
  } catch {
    return null
  }
}

/** Écrit (ou efface, avec `null`) et prévient les écrans abonnés. */
export function ecrireSession(cle: string, valeur: string | null) {
  try {
    if (valeur === null) window.sessionStorage.removeItem(cle)
    else window.sessionStorage.setItem(cle, valeur)
  } catch {
    // Stockage refusé : la valeur vivra le temps de l'écran.
  }
  window.dispatchEvent(new Event(EVENEMENT))
}

function abonner(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel)
  window.addEventListener("storage", rappel)
  return () => {
    window.removeEventListener(EVENEMENT, rappel)
    window.removeEventListener("storage", rappel)
  }
}

/**
 * Valeur brute, réactive. `undefined` tant que le navigateur n'a pas pu la
 * lire (rendu serveur, hydratation) : à distinguer d'une absence (`null`).
 */
export function useValeurSession(cle: string): string | null | undefined {
  return useSyncExternalStore(
    abonner,
    () => lireSession(cle),
    () => undefined
  )
}
