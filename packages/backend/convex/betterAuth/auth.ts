import { betterAuth } from "better-auth/minimal"
import { emailOTP, phoneNumber } from "better-auth/plugins"
import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex, crossDomain } from "@convex-dev/better-auth/plugins"

import authConfig from "../auth.config"
import { components, internal } from "../_generated/api"
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

function emailOtpConfigured(): boolean {
  return (
    process.env.AUTH_EMAIL_ENABLED === "true" &&
    Boolean(process.env.RESEND_API_KEY?.trim()) &&
    Boolean(
      process.env.AUTH_EMAIL_FROM?.trim() ||
      process.env.TICKETS_EMAIL_FROM?.trim()
    )
  )
}

/**
 * Retient le code émis pour le rendre relisible en développement.
 *
 * Silencieuse par construction : l'écriture est un confort de développement,
 * jamais une condition de la connexion. Un incident ici ne doit pas empêcher
 * un voyageur de recevoir son code — d'autant que la mutation appelée ne fait
 * rien si l'interrupteur n'est pas armé.
 */
async function recordDevCode(
  ctx: GenericCtx<DataModel>,
  identifier: string,
  code: string,
  channel: "email" | "sms"
): Promise<void> {
  if (process.env.DEV_SIGNIN_ENABLED !== "true") return
  const runMutation = (ctx as { runMutation?: unknown }).runMutation
  if (typeof runMutation !== "function") return
  try {
    await (
      ctx as unknown as {
        runMutation: (ref: unknown, args: unknown) => Promise<unknown>
      }
    ).runMutation(internal.functions.devAuth.record, {
      identifier,
      code,
      channel,
    })
  } catch (error) {
    console.warn(`[Auth] code non retenu pour le développement : ${error}`)
  }
}

async function deliverEmailOtp(
  ctx: GenericCtx<DataModel>,
  email: string,
  otp: string
): Promise<void> {
  await recordDevCode(ctx, email, otp, "email")

  if (emailOtpConfigured()) {
    const runAction = (ctx as { runAction?: unknown }).runAction
    if (typeof runAction !== "function") {
      throw new Error("Service d'authentification temporairement indisponible")
    }
    await (
      ctx as unknown as {
        runAction: (ref: unknown, args: unknown) => Promise<unknown>
      }
    ).runAction(internal.functions.notifications.sendAuthOtpEmail, {
      email,
      otp,
    })
    return
  }

  if (process.env.DEV_SIGNIN_ENABLED !== "true") {
    throw new Error("L'envoi des codes par e-mail n'est pas encore configuré.")
  }
}

async function deliverSmsOtp(
  ctx: GenericCtx<DataModel>,
  phone: string,
  code: string
): Promise<void> {
  await recordDevCode(ctx, phone, code, "sms")
  if (process.env.DEV_SIGNIN_ENABLED !== "true") {
    throw new Error("L'envoi des codes par SMS n'est pas encore configuré.")
  }
}

function temporaryPhoneEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return `telephone-${digits}@auth.setrag.local`
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
          await deliverEmailOtp(ctx, email, otp)
        },
      }),
      // OTP par SMS — parcours mobile, majoritaire au Gabon.
      phoneNumber({
        otpLength: 6,
        expiresIn: 10 * 60,
        async sendOTP({ phoneNumber: phone, code }) {
          await deliverSmsOtp(ctx, phone, code)
        },
        phoneNumberValidator: (phone) => /^\+241\d{8}$/.test(phone),
        signUpOnVerification: {
          getTempEmail: temporaryPhoneEmail,
          getTempName: (phone) => phone,
        },
      }),
    ],
  })

/** Utilisateur Better Auth courant (null si non authentifié). */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
})
