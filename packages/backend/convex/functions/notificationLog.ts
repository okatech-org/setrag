import { v } from "convex/values"

import { internalMutation } from "../_generated/server"

/** Journalise un e-mail de billets accepté par le fournisseur. */
export const recordTicketEmail = internalMutation({
  args: {
    customerId: v.optional(v.id("users")),
    recipient: v.string(),
    reference: v.string(),
    providerId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.customerId) return null
    return await ctx.db.insert("notifications", {
      userId: args.customerId,
      channel: "email",
      title: `Billets ${args.reference}`,
      body: `Les billets ont été envoyés à ${args.recipient}.`,
      data: JSON.stringify({
        reference: args.reference,
        providerId: args.providerId,
      }),
      sentAt: Date.now(),
    })
  },
})
