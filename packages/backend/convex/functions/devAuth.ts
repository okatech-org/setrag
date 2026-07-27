import { v } from "convex/values"
import { internalMutation, mutation, query } from "../_generated/server"

/**
 * Récupération des codes à usage unique, en développement seulement.
 *
 * Aucun fournisseur d'e-mail ni de SMS n'est branché : le code part dans les
 * journaux du serveur. Développer l'écran de connexion, et le montrer, suppose
 * de pouvoir le relire — sinon la première étape du parcours voyageur est
 * indémontrable.
 *
 * Ce module est une PORTE DÉROBÉE assumée. Qui lit ces codes peut se connecter
 * au nom de n'importe qui. Trois garde-fous, parce qu'un seul finit toujours
 * par sauter :
 *
 *  1. rien n'est écrit ni lu si `DEV_SIGNIN_ENABLED` ne vaut pas « true » ;
 *  2. la lecture consomme le code, qui ne sert donc qu'une fois ;
 *  3. la supervision remonte un constat CRITIQUE tant que l'interrupteur est
 *     armé, pour qu'un déploiement mal configuré se voie au tableau de bord.
 */

/** Nom de l'interrupteur. Absent en production, par construction. */
export const DEV_SIGNIN_ENV = "DEV_SIGNIN_ENABLED"

/** Vrai si la récupération des codes est ouverte sur ce déploiement. */
export function isDevSigninEnabled(): boolean {
  return process.env[DEV_SIGNIN_ENV] === "true"
}

/**
 * Durée de rétention d'un code.
 *
 * Alignée sur l'expiration des OTP de Better Auth : conserver plus longtemps
 * n'offrirait qu'une fenêtre d'attaque supplémentaire sur un code déjà mort.
 */
const RETENTION_MS = 10 * 60 * 1000

/**
 * Enregistre un code émis.
 *
 * Appelée depuis les rappels d'envoi de Better Auth. Ne lève jamais : un
 * incident de journalisation ne doit pas empêcher un voyageur de se connecter.
 */
export const record = internalMutation({
  args: {
    identifier: v.string(),
    code: v.string(),
    channel: v.union(v.literal("email"), v.literal("sms")),
  },
  handler: async (ctx, args) => {
    if (!isDevSigninEnabled()) return { stored: false }

    const now = Date.now()

    // Un seul code vivant par destinataire : le précédent est de toute façon
    // invalidé par l'émission du nouveau.
    const anciens = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .collect()
    for (const ancien of anciens) await ctx.db.delete(ancien._id)

    await ctx.db.insert("devOtpCodes", {
      identifier: args.identifier,
      code: args.code,
      channel: args.channel,
      createdAt: now,
      expiresAt: now + RETENTION_MS,
    })
    return { stored: true }
  },
})

/**
 * Dernier code émis pour un destinataire.
 *
 * Volontairement une MUTATION et non une requête : la lecture consomme le
 * code. Une requête réactive le laisserait disponible indéfiniment à
 * quiconque garderait l'abonnement ouvert.
 */
export const consumeCode = mutation({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    if (!isDevSigninEnabled()) {
      throw new Error(
        `Récupération des codes désactivée. Poser ${DEV_SIGNIN_ENV}=true sur ` +
          `un déploiement de développement — jamais en production.`
      )
    }

    const now = Date.now()
    const codes = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .collect()

    // Purge opportuniste : sans elle, les codes périmés s'accumuleraient sans
    // que rien ne les ramasse.
    for (const c of codes.filter((c) => c.expiresAt <= now)) {
      await ctx.db.delete(c._id)
    }

    const vivant = codes
      .filter((c) => c.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)[0]

    if (!vivant) return null

    await ctx.db.delete(vivant._id)
    return {
      code: vivant.code,
      channel: vivant.channel,
      createdAt: vivant.createdAt,
    }
  },
})

/** État de l'interrupteur, pour que l'interface sache quoi proposer. */
export const status = query({
  args: {},
  handler: async () => {
    const developmentEnabled = isDevSigninEnabled()
    const emailDeliveryEnabled =
      process.env.AUTH_EMAIL_ENABLED === "true" &&
      Boolean(process.env.RESEND_API_KEY?.trim()) &&
      Boolean(
        process.env.AUTH_EMAIL_FROM?.trim() ||
        process.env.TICKETS_EMAIL_FROM?.trim()
      )
    return {
      // `enabled` est conservé pour les outils de supervision existants.
      enabled: developmentEnabled,
      developmentEnabled,
      emailDeliveryEnabled,
      smsDeliveryEnabled: false,
    }
  },
})
