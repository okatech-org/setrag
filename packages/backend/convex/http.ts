import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { authComponent, createAuth } from "./betterAuth/auth"
import { trustedWebOrigins } from "./betterAuth/origins"
import { webhook as telegramWebhook } from "./messaging/telegram"
import { transactionalEmail } from "./lib/resend"

const http = httpRouter()

// Routes Better Auth (/api/auth/**) + en-têtes CORS pour les applications
// SETRAG officielles et les origines supplémentaires de TRUSTED_ORIGINS.
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: trustedWebOrigins(),
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
