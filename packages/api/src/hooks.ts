"use client"

import { useConvexAuth } from "convex/react"
import { authClient } from "./auth-client"

export { useConvexAuth }
export { useQuery, useMutation, useAction } from "convex/react"

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
