import { useConvexAuth, useQuery } from "convex/react"

import { api } from "@workspace/backend/generated"

/**
 * État du compte voyageur. Les requêtes réservées à un compte (`requireUser`)
 * ne partent que sur `actif` : entre la connexion et la création du profil,
 * ou pour un compte désactivé, elles lèveraient pendant le rendu.
 */
export function useCompte() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const profil = useQuery(api.functions.customers.me, isAuthenticated ? {} : "skip")
  return {
    connecte: isAuthenticated,
    chargement: isLoading || (isAuthenticated && profil === undefined),
    profil: profil ?? null,
    actif: Boolean(isAuthenticated && profil?.user.isActive),
  }
}
