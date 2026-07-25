import { httpRouter } from "convex/server"
import { authComponent, createAuth } from "./betterAuth/auth"

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

export default http
