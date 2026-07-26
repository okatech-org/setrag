import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

/**
 * Tâches planifiées d'exploitation.
 *
 * Les identifiants restent en ASCII : c'est une contrainte de la plateforme
 * Convex, pas un choix de langue.
 */
const crons = cronJobs()

/**
 * Fait avancer la fenêtre glissante de mise en vente.
 *
 * Les dessertes sont engendrées sur toute la validité du livret, mais
 * ouvertes à la vente seulement dans la fenêtre courante. Ce cron ouvre
 * chaque jour celles qui viennent d'y entrer.
 */
crons.daily(
  "roll sale window",
  { hourUTC: 1, minuteUTC: 0 },
  internal.functions.trips.rollSaleWindow,
  {},
)

/**
 * Libère les réservations en ligne dont le délai de règlement est écoulé.
 * Sans ce cron, une réservation abandonnée immobiliserait la place jusqu'au
 * départ du train.
 */
crons.interval(
  "expire stale holds",
  { minutes: 5 },
  internal.functions.bookings.expireStaleHolds,
  {},
)

export default crons
