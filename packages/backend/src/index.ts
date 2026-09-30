/**
 * Point d'entrée du package backend.
 *
 * Le déploiement Convex est piloté depuis ce package (`bun run dev` y lance
 * `convex dev`). Une fois les fonctions poussées, Convex génère
 * `convex/_generated/api.js`, que les applications importent via
 * `@workspace/backend/generated`.
 */

export const BACKEND_PACKAGE_VERSION = "0.0.0"

export {
  CURRENCY,
  TIMEZONE,
  SERVICE_CLASSES,
  BOOKING_STATUSES,
  TICKET_STATUSES,
  PAYMENT_METHODS,
  ROLES,
  AGENT_ROLES,
  SEAT_HOLD_DURATION_MS,
  CANCELLATION_CUTOFF_MS,
} from "@workspace/shared/constants"

/** Version des CGV acceptée au paiement (aussi exportée par `@workspace/backend/cgv`). */
export { CURRENT_CGV_VERSION } from "../convex/model/cgv"
