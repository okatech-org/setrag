import {
  civiliteDuTitulaire,
  memePersonne,
  type Civilite,
} from "@workspace/backend/titulaire"

/**
 * Le voyageur « Moi » : le titulaire du compte, porté par le profil — pas une
 * fiche de plus. Les règles (comparaison des noms, civilité d'un compte
 * ancien) viennent du backend, source unique (`@workspace/backend/titulaire`).
 */

export type { Civilite }

/** Libellés de la civilité du titulaire, tels qu'il les choisit. */
export const CIVILITES: Record<Civilite, string> = {
  F: "Madame",
  M: "Monsieur",
}

interface Profil {
  firstName?: string | null
  lastName?: string | null
  gender?: Civilite | null
}

interface Fiche {
  firstName: string
  lastName: string
  gender: Civilite
}

export interface VoyageurMoi {
  prenom: string
  nom: string
  /** Civilité du profil, ou celle de sa propre fiche ; `null` si jamais donnée. */
  sexe: Civilite | null
}

/**
 * Le titulaire comme voyageur, ou `null` tant qu'il n'a pas de nom (inscription
 * laissée « pour plus tard »). Un compte ancien sans civilité la retrouve dans
 * la fiche qu'il avait créée pour lui-même.
 */
export function voyageurMoi(
  profil: Profil | null | undefined,
  fiches: readonly Fiche[] = []
): VoyageurMoi | null {
  if (!profil) return null
  const prenom = profil.firstName?.trim() ?? ""
  const nom = profil.lastName?.trim() ?? ""
  if (!prenom && !nom) return null
  return { prenom, nom, sexe: civiliteDuTitulaire(profil, fiches) }
}

/** Cette fiche porte-t-elle les nom et prénom du titulaire (un doublon de « Moi ») ? */
export function estLeTitulaire(profil: Profil | null | undefined, fiche: Fiche): boolean {
  return Boolean(profil) && memePersonne(profil!, fiche)
}
