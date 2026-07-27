"use node"

import { HOUR, RateLimiter } from "@convex-dev/rate-limiter"
import { v } from "convex/values"
import { Resend } from "resend"

import { components, internal } from "../_generated/api"
import { action, internalAction, type ActionCtx } from "../_generated/server"
import { renderBookingPdf } from "./documents"
import { transactionalEmail } from "../lib/resend"

const notificationRateLimiter = new RateLimiter(components.rateLimiter, {
  ticketEmail: {
    kind: "token bucket",
    rate: 3,
    period: HOUR,
    capacity: 2,
  },
})

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

/**
 * Envoie tous les billets d'un dossier en pièce jointe.
 *
 * Sans activation explicite ou sans secrets, l'action ne tente aucun appel
 * réseau et rend un état exploitable par l'interface.
 */
const emailArgs = {
  reference: v.string(),
  contactPhone: v.optional(v.string()),
  email: v.optional(v.string()),
}

async function sendTicketsEmail(
  ctx: ActionCtx,
  args: {
    reference: string
    contactPhone?: string
    email?: string
  }
): Promise<{
  configured: boolean
  sent: boolean
  recipient?: string
  reason?: "disabled" | "missing_email" | "rate_limited"
}> {
  const data = await ctx.runQuery(
    internal.functions.documents.bookingPrintData,
    {
      reference: args.reference,
      contactPhone: args.contactPhone,
    }
  )
  const recipient = (args.email ?? data.contactEmail)?.trim().toLowerCase()
  if (!recipient) {
    return { configured: true, sent: false, reason: "missing_email" }
  }

  const enabled = process.env.TICKETS_EMAIL_ENABLED === "true"
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.TICKETS_EMAIL_FROM?.trim()
  if (!enabled || !apiKey || !from) {
    return {
      configured: false,
      sent: false,
      recipient,
      reason: "disabled",
    }
  }

  const rate = await notificationRateLimiter.limit(ctx, "ticketEmail", {
    key: String(data.saleId),
  })
  if (!rate.ok) {
    return {
      configured: true,
      sent: false,
      recipient,
      reason: "rate_limited",
    }
  }

  const pdf = await renderBookingPdf(data.tickets)
  const subject = `Vos billets SETRAG — ${data.reference}`
  const safeReference = escapeHtml(data.reference)
  const safeCount = String(data.tickets.length)
  const html =
    `<div style="font-family:Arial,sans-serif;color:#131b26">` +
    `<h1 style="font-size:22px">Vos billets SETRAG</h1>` +
    `<p>Votre dossier <strong>${safeReference}</strong> contient ` +
    `${safeCount} titre(s) de transport.</p>` +
    `<p>Le document PDF est joint à ce message. Présentez le code du billet ` +
    `à l’embarquement et conservez votre référence de réservation.</p>` +
    `<p style="color:#5c646f">SETRAG — Transgabonais</p></div>`
  const text =
    `Vos billets SETRAG\n\nDossier ${data.reference} — ` +
    `${data.tickets.length} titre(s).\nLe PDF est joint à ce message.`

  const sdk = new Resend(apiKey)
  const emailId = await transactionalEmail.sendEmailManually(
    ctx,
    { from, to: recipient, subject },
    async (idempotencyKey) => {
      const { data: result, error } = await sdk.emails.send({
        from,
        to: recipient,
        subject,
        html,
        text,
        attachments: [
          {
            filename: `billets-${data.reference}.pdf`,
            content: Buffer.from(pdf),
          },
        ],
        headers: {
          "Idempotency-Key": String(idempotencyKey),
        },
      })
      if (error) {
        throw new Error(`Envoi des billets impossible : ${error.message}`)
      }
      if (!result?.id)
        throw new Error("Le fournisseur n'a pas confirmé l'envoi")
      return result.id
    }
  )

  await ctx.runMutation(internal.functions.notificationLog.recordTicketEmail, {
    customerId: data.customerId,
    recipient,
    reference: data.reference,
    providerId: String(emailId),
  })
  return { configured: true, sent: true, recipient }
}

export const emailTickets = action({
  args: emailArgs,
  handler: sendTicketsEmail,
})

/** Envoi automatique déclenché après confirmation d'un paiement. */
export const sendBookingEmail = internalAction({
  args: emailArgs,
  handler: sendTicketsEmail,
})

/** Envoie le code Better Auth sans jamais le journaliser en clair. */
export const sendAuthOtpEmail = internalAction({
  args: {
    email: v.string(),
    otp: v.string(),
  },
  handler: async (ctx, args): Promise<{ sent: true }> => {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const from =
      process.env.AUTH_EMAIL_FROM?.trim() ||
      process.env.TICKETS_EMAIL_FROM?.trim()
    if (process.env.AUTH_EMAIL_ENABLED !== "true" || !apiKey || !from) {
      throw new Error("L'envoi des codes par e-mail n'est pas configuré")
    }

    const sdk = new Resend(apiKey)
    const subject = "Votre code de connexion SETRAG"
    const emailId = await transactionalEmail.sendEmailManually(
      ctx,
      { from, to: args.email, subject },
      async (idempotencyKey) => {
        const { data, error } = await sdk.emails.send({
          from,
          to: args.email,
          subject,
          html:
            `<div style="font-family:Arial,sans-serif;color:#131b26">` +
            `<h1 style="font-size:22px">Connexion à la billetterie SETRAG</h1>` +
            `<p>Votre code à usage unique est :</p>` +
            `<p style="font-size:30px;font-weight:700;letter-spacing:6px">` +
            `${args.otp}</p>` +
            `<p>Il expire dans dix minutes. Ne le communiquez à personne.</p>` +
            `</div>`,
          text:
            `Votre code de connexion SETRAG est ${args.otp}. ` +
            `Il expire dans dix minutes.`,
          headers: { "Idempotency-Key": String(idempotencyKey) },
        })
        if (error)
          throw new Error(`Envoi du code impossible : ${error.message}`)
        if (!data?.id)
          throw new Error("Le fournisseur n'a pas confirmé l'envoi")
        return data.id
      }
    )
    if (!emailId) throw new Error("Le fournisseur n'a pas confirmé l'envoi")
    return { sent: true }
  },
})
