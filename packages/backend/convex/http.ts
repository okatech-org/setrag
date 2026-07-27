import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { authComponent, createAuth } from "./betterAuth/auth"
import { webhook as telegramWebhook } from "./messaging/telegram"
import { transactionalEmail } from "./lib/resend"

const http = httpRouter()

// Routes Better Auth (/api/auth/**) + en-têtes CORS pour les origines de
// confiance déclarées dans TRUSTED_ORIGINS.
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((o: string) => o.trim())
      .filter(Boolean),
  },
})

http.route({
  path: "/webhooks/telegram",
  method: "POST",
  handler: telegramWebhook,
})

http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    return await transactionalEmail.handleResendEventWebhook(ctx, request)
  }),
})

export default http
