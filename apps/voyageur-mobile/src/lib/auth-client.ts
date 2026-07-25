import { expoClient } from "@better-auth/expo/client"
import { convexClient } from "@convex-dev/better-auth/client/plugins"
import type { BetterAuthClientPlugin } from "better-auth"
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL

/**
 * Client Better Auth natif : les jetons de session sont conservés dans le
 * trousseau iOS / Keystore Android via `expo-secure-store`.
 */
export const authClient = createAuthClient({
  baseURL: CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    // `@better-auth/expo` déclare `getActions` avec une signature `BetterFetch`
    // plus étroite que celle attendue par `createAuthClient` : les deux sont
    // compatibles à l'exécution, seule l'inférence des types diverge.
    expoClient({
      scheme: "setrag",
      storagePrefix: "setrag",
      storage: SecureStore,
    }) as BetterAuthClientPlugin,
    emailOTPClient(),
    phoneNumberClient(),
  ],
})

export const { signIn, signOut, signUp, useSession } = authClient
