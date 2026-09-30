"use client"

import { Component, type ReactNode } from "react"

/**
 * Recueille l'erreur d'une requête Convex (desserte inconnue, téléphone qui
 * ne correspond pas à la réservation…) pour l'expliquer à sa place, au lieu
 * de laisser tomber l'écran entier. Changer la `key` du composant relance la
 * lecture — après une nouvelle saisie, par exemple.
 */
export class LimiteErreur extends Component<
  { secours: (erreur: Error) => ReactNode; children: ReactNode },
  { erreur: Error | null }
> {
  state: { erreur: Error | null } = { erreur: null }

  static getDerivedStateFromError(erreur: unknown) {
    return {
      erreur: erreur instanceof Error ? erreur : new Error(String(erreur)),
    }
  }

  render() {
    return this.state.erreur
      ? this.props.secours(this.state.erreur)
      : this.props.children
  }
}
