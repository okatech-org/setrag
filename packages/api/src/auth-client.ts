import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * Les routes Better Auth sont exposées par le routeur HTTP Convex, pas par
 * Next.js. Le plugin crossDomain conserve l'origine de l'application pour le
 * retour après authentification.
 */
const AUTH_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL

export const authClient = createAuthClient({
  baseURL: AUTH_URL || undefined,
  plugins: [
    convexClient(),
    crossDomainClient(),
    emailOTPClient(),
    phoneNumberClient(),
  ],
})

export const { signIn, signOut, signUp, useSession } = authClient
