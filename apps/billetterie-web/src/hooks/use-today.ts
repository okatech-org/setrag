"use client"

import { useSyncExternalStore } from "react"

/**
 * Figé au chargement du bundle, côté navigateur uniquement.
 *
 * Une constante, et non un appel par rendu : `getSnapshot` doit renvoyer la
 * même valeur d'un rendu à l'autre, sinon React boucle.
 */
const CLIENT_NOW = typeof window === "undefined" ? 0 : Date.now()

/** La date ne change pas pendant la visite : rien à quoi s'abonner. */
const subscribe = () => () => {}

/**
 * Horodatage du jour, côté client.
 *
 * Renvoie `null` pendant le rendu serveur et l'hydratation, puis la date réelle
 * juste après. C'est le seul moyen d'afficher le jour du voyageur — celui de
 * son téléphone, pas celui du serveur — sans écart entre le HTML envoyé et le
 * premier rendu du navigateur.
 *
 * L'appelant doit donc prévoir quoi afficher tant que la valeur est nulle.
 */
export function useToday(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => CLIENT_NOW,
    () => null
  )
}
