"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexQueryClient } from "@convex-dev/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
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
  const [{ convexQueryClient, queryClient }] = useState(() => {
    const convexClient = new ConvexQueryClient(CONVEX_URL!)
    const tanstackClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryKeyHashFn: convexClient.hashFn(),
          queryFn: convexClient.queryFn(),
          // Convex maintient ses propres souscriptions temps réel via
          // WebSocket : on coupe les refetch automatiques de React Query
          // pour éviter des retours en état « loading » au focus/reconnexion.
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    })
    // Connecter dans le même initialiseur garantit un seul abonnement par
    // paire de clients, y compris lorsque React rejoue les effets en Strict
    // Mode pendant le développement.
    convexClient.connect(tanstackClient)
    return { convexQueryClient: convexClient, queryClient: tanstackClient }
  })

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
