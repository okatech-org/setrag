import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"
import type { ComponentProps, ReactNode } from "react"

import { authClient } from "./auth-client"

/**
 * Le type `AuthClient` attendu par le provider n'infère pas les plugins
 * additionnels (expo, emailOTP, phoneNumber) : `useSession().data` s'y réduit
 * à `never`. Le cast reste sûr — le contrat d'exécution est respecté.
 */
type ProviderAuthClient = ComponentProps<
  typeof ConvexBetterAuthProvider
>["authClient"]

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL

if (!CONVEX_URL) {
  console.error("Variable d'environnement manquante : EXPO_PUBLIC_CONVEX_URL")
}

const convex = new ConvexReactClient(CONVEX_URL!, {
  // Les WebSockets sont interrompus dès que l'application passe en arrière-plan
  // sur iOS ; la reconnexion est gérée à la reprise.
  unsavedChangesWarning: false,
})

export function ConvexProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient as unknown as ProviderAuthClient}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}
