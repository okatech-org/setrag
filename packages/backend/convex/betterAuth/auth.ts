import { betterAuth } from "better-auth/minimal"
import { emailOTP, phoneNumber } from "better-auth/plugins"
import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex, crossDomain } from "@convex-dev/better-auth/plugins"

import authConfig from "../auth.config"
import { components } from "../_generated/api"
import { query } from "../_generated/server"
import type { DataModel } from "../_generated/dataModel"

/** Client du composant Better Auth. */
export const authComponent = createClient<DataModel>(components.betterAuth)

/**
 * Origines de confiance : applications web (billetterie, portail agent) et
 * application mobile Expo.
 *
 * Le `**` est requis pour le scheme natif : Better Auth utilise `wildcard-match`
 * avec `/` comme séparateur, donc un simple `*` s'arrête au premier slash.
 */
function parseTrustedOrigins(): string[] {
  const origins = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o: string) => o.trim())
    .filter(Boolean)

  if (process.env.DEV_SIGNIN_ENABLED === "true") {
    for (const port of [3000, 3001]) {
      origins.push(`http://localhost:${port}`, `https://localhost:${port}`)
    }
  }

  origins.push("setrag://**", "setrag://", "exp://**")

  return origins
}

/** Valide la présence et la robustesse du secret Better Auth. */
function validateAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error(
      "[Auth] BETTER_AUTH_SECRET est manquant : le serveur ne peut pas démarrer."
    )
  }
  if (secret.length < 32) {
    throw new Error(
      `[Auth] BETTER_AUTH_SECRET trop court (${secret.length} caractères, minimum 32).`
    )
  }
  return secret
}

/**
 * `siteUrl` du plugin crossDomain, dérivé de l'origine de la requête : chaque
 * application (billetterie, portail agent) est ainsi redirigée vers elle-même.
 */
function resolveSiteUrl(origin?: string | null): string {
  if (origin) {
    try {
      return new URL(origin).origin
    } catch {
      /* origine invalide — on retombe sur la valeur par défaut */
    }
  }
  return process.env.SITE_URL ?? "http://localhost:3000"
}

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  requestOrigin?: string | null
) =>
  betterAuth({
    appName: "SETRAG",
    // CONVEX_SITE_URL est fourni automatiquement par Convex.
    baseURL: process.env.CONVEX_SITE_URL,
    secret: validateAuthSecret(),
    database: authComponent.adapter(ctx),
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 jours
      updateAge: 60 * 60 * 24, // rafraîchissement quotidien
    },
    trustedOrigins: parseTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        phone: { type: "string", required: false },
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
      },
    },
    plugins: [
      convex({ authConfig }),
      crossDomain({ siteUrl: resolveSiteUrl(requestOrigin) }),
      // OTP par e-mail — inscription et connexion des voyageurs.
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        async sendVerificationOTP({ email, otp }) {
          // TODO: brancher sur `convex/functions/notifications.ts` (Resend).
          console.info(`[Auth] OTP e-mail pour ${email} : ${otp}`)
        },
      }),
      // OTP par SMS — parcours mobile, majoritaire au Gabon.
      phoneNumber({
        otpLength: 6,
        expiresIn: 10 * 60,
        async sendOTP({ phoneNumber: phone, code }) {
          // TODO: brancher sur le fournisseur SMS.
          console.info(`[Auth] OTP SMS pour ${phone} : ${code}`)
        },
      }),
    ],
  })

/** Utilisateur Better Auth courant (null si non authentifié). */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
})
