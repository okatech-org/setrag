import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * Client Better Auth partagé par la billetterie et le portail agent.
 *
 * `baseURL` suit l'origine du navigateur : chaque application (billetterie
 * :3000, agent :3001) est ainsi redirigée vers elle-même après un flux OAuth,
 * sans configuration par application.
 */
const SITE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL

export const authClient = createAuthClient({
  baseURL: SITE_URL || undefined,
  plugins: [
    convexClient(),
    crossDomainClient(),
    emailOTPClient(),
    phoneNumberClient(),
  ],
})

export const { signIn, signOut, signUp, useSession } = authClient
