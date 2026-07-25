"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexQueryClient } from "@convex-dev/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import type { ComponentProps, ReactNode } from "react"
import { authClient } from "./auth-client"

/**
 * Le type `AuthClient` attendu par le provider est une union qui n'infère pas
 * les plugins additionnels (emailOTP, phoneNumber) : `useSession().data` s'y
 * réduit à `never`. Le cast reste sûr — le contrat d'exécution est respecté.
 */
type ProviderAuthClient = ComponentProps<
  typeof ConvexBetterAuthProvider
>["authClient"]

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL

if (!CONVEX_URL) {
  console.error("Variable d'environnement manquante : NEXT_PUBLIC_CONVEX_URL")
}

export default function AppConvexProvider({
  children,
  initialToken,
}: {
  children: ReactNode
  initialToken?: string | null
}) {
  const convexQueryClient = useMemo(
    () => new ConvexQueryClient(CONVEX_URL!),
    []
  )

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            queryKeyHashFn: convexQueryClient.hashFn(),
            queryFn: convexQueryClient.queryFn(),
            // Convex maintient ses propres souscriptions temps réel via
            // WebSocket : on coupe les refetch automatiques de React Query
            // pour éviter des retours en état « loading » au focus/reconnexion.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      })
  )

  useEffect(() => {
    convexQueryClient.connect(queryClient)
  }, [convexQueryClient, queryClient])

  return (
    <ConvexBetterAuthProvider
      client={convexQueryClient.convexClient}
      authClient={authClient as unknown as ProviderAuthClient}
      initialToken={initialToken}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConvexBetterAuthProvider>
  )
}
