"use client"

import { useConvexAuth } from "convex/react"
import { authClient } from "./auth-client"

export { useConvexAuth }
export { useQuery, useMutation, useAction } from "convex/react"
// Le client lui-même, pour les lectures qu'un hook ne peut pas exprimer :
// interroger un trajet par dossier suppose une boucle sur une liste dont la
// longueur varie, ce qu'un `useQuery` par élément ne permet pas.
export { useConvex } from "convex/react"

/** Session Better Auth courante (utilisateur + jeton). */
export function useAuth() {
  const { isLoading: isConvexLoading, isAuthenticated } = useConvexAuth()
  const { data: session, isPending } = authClient.useSession()

  return {
    isLoading: isConvexLoading || isPending,
    isAuthenticated,
    user: session?.user ?? null,
    session: session?.session ?? null,
  }
}
