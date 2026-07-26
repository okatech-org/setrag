import { defineApp } from "convex/server"
import betterAuth from "@convex-dev/better-auth/convex.config"
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import resend from "@convex-dev/resend/convex.config.js"
import aggregate from "@convex-dev/aggregate/convex.config.js"

const app = defineApp()

app.use(betterAuth)
app.use(rateLimiter)
app.use(resend)

/**
 * Compteurs dénormalisés en O(log n), alignés sur les indicateurs exigés par
 * le CDC §7.5 et §7.11.7 : ventes et recettes par journée comptable et par
 * point de vente, remplissage et recette par desserte.
 */
app.use(aggregate, { name: "salesByDay" })
app.use(aggregate, { name: "salesByPointOfSale" })
app.use(aggregate, { name: "ticketsByTrip" })
app.use(aggregate, { name: "revenueByTrip" })

export default app
