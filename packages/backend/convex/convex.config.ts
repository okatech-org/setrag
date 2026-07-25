import { defineApp } from "convex/server"
import betterAuth from "@convex-dev/better-auth/convex.config"
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import resend from "@convex-dev/resend/convex.config.js"
import aggregate from "@convex-dev/aggregate/convex.config.js"

const app = defineApp()

app.use(betterAuth)
app.use(rateLimiter)
app.use(resend)

// Compteurs dénormalisés en O(log n) pour les tableaux de bord agent.
app.use(aggregate, { name: "bookingsByTrip" })
app.use(aggregate, { name: "bookingsByStatus" })
app.use(aggregate, { name: "ticketsByTrip" })
app.use(aggregate, { name: "revenueByDay" })

export default app
