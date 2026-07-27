import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { components } from "../_generated/api"

/** Budgets anti-abus et anti-boucle propres aux assistants voyageurs. */
export const assistantRateLimiter = new RateLimiter(components.rateLimiter, {
  textMessage: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 5,
  },
  voiceSession: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 3,
  },
  toolCall: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 15,
  },
  consequentialAction: {
    kind: "token bucket",
    rate: 50,
    period: 24 * HOUR,
    capacity: 10,
  },
})
