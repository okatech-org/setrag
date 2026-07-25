import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Libère les places des réservations impayées dont le blocage a expiré.
crons.interval(
  "expire stale bookings",
  { minutes: 5 },
  internal.functions.maintenance.expireStaleBookings,
  {}
)

// Clôture les dessertes arrivées à destination.
crons.interval(
  "close completed trips",
  { minutes: 30 },
  internal.functions.maintenance.closeCompletedTrips,
  {}
)

export default crons
