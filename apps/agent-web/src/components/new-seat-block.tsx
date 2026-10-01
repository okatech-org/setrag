"use client"

import { PlacesQuotas } from "./gestion/referentiels/places"

/**
 * Création d'un blocage : l'écran « Places et quotas », fenêtre de blocage
 * ouverte. Le choix se fait sur l'occupation réelle de la desserte, place par
 * place, et le lot est bloqué en une seule transaction.
 */
export function NewSeatBlock() {
  return <PlacesQuotas ouvrirBlocage />
}
