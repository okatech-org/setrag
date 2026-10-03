import { expoClient } from "@better-auth/expo/client"
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import type { BetterAuthClientPlugin } from "better-auth"
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL

// Un build de simulateur non signé n'a pas l'entitlement Keychain. En dev
// seulement, garder la session en mémoire permet de tester les écrans ; un
// build signé continue d'utiliser le trousseau iOS / Keystore Android.
const ephemeral = new Map<string, string>()
const sessionStorage = {
  ...SecureStore,
  getItem(key: string) {
    try { return SecureStore.getItem(key) }
    catch (error) { if (!__DEV__) throw error; return ephemeral.get(key) ?? null }
  },
  setItem(key: string, value: string) {
    try { SecureStore.setItem(key, value) }
    catch (error) { if (!__DEV__) throw error; ephemeral.set(key, value) }
  },
  async deleteItemAsync(key: string) {
    try { await SecureStore.deleteItemAsync(key) }
    catch (error) { if (!__DEV__) throw error; ephemeral.delete(key) }
  },
}

/**
 * Client Better Auth : session cross-domain dans le navigateur, trousseau
 * iOS / Keystore Android via `expo-secure-store` sur les appareils natifs.
 */
export const authClient = createAuthClient({
  baseURL: CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    // Les deux transports sont exclusifs : expoClient ne gère pas les
    // cookies cross-domain sur le web.
    ...(Platform.OS === "web"
      ? [crossDomainClient({ storagePrefix: "setrag" })]
      : [
          // Le cast corrige uniquement l'inférence de BetterFetch du plugin Expo.
          expoClient({
            scheme: "setrag",
            storagePrefix: "setrag",
            storage: sessionStorage,
          }) as BetterAuthClientPlugin,
        ]),
    emailOTPClient(),
    phoneNumberClient(),
  ],
})

export const { signIn, signOut, signUp, useSession } = authClient
