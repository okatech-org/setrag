"use client"

import { useEffect, useState } from "react"

/**
 * Le message d'une erreur levée par une fonction Convex, sans l'enveloppe
 * technique (« [CONVEX M(…)] [Request ID: …] Server Error Uncaught Error: »).
 * En production, le serveur peut masquer le détail : on renvoie alors `null`,
 * et l'écran dit ce qu'il sait.
 */
export function messageServeur(erreur: unknown): string | null {
  if (!(erreur instanceof Error)) return null
  const texte = erreur.message
  const leve = /Uncaught (?:Error|ConvexError): ([^\n]+)/.exec(texte)
  if (leve?.[1]) return leve[1].trim()
  if (/Server Error|\[CONVEX /.test(texte)) return null
  return texte.trim() || null
}

/**
 * Vrai quand une attente dure plus d'une seconde : sous ce seuil, des
 * squelettes ; au-delà, le chargeur et sa phrase (charte, « Mouvement »).
 */
export function useAttenteLongue(enAttente: boolean, delai = 1000): boolean {
  const [longue, setLongue] = useState(false)
  // Une nouvelle attente repart de zéro.
  if (!enAttente && longue) setLongue(false)
  useEffect(() => {
    if (!enAttente) return
    const minuteur = window.setTimeout(() => setLongue(true), delai)
    return () => window.clearTimeout(minuteur)
  }, [enAttente, delai])
  return enAttente && longue
}

/**
 * La dernière valeur connue d'une requête : quand ses arguments changent,
 * Convex repasse par `undefined` le temps de répondre. Un total qui clignote
 * à chaque réduction choisie se lit mal ; on garde l'ancien jusqu'au nouveau.
 */
export function useDerniereValeur<T>(valeur: T | undefined): T | undefined {
  const [derniere, setDerniere] = useState(valeur)
  if (valeur !== undefined && valeur !== derniere) setDerniere(valeur)
  return valeur ?? derniere
}
