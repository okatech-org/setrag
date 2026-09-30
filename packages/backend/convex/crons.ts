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
  {}
)

/**
 * Sur un environnement de démonstration, garantit qu'une recherche reste
 * possible jusqu'à deux mois glissants. La mutation est un no-op partout où
 * `DEMO_ACCOUNTS_ENABLED` n'est pas activé.
 */
crons.daily(
  "top up demo trip horizon",
  { hourUTC: 1, minuteUTC: 15 },
  internal.seeds.demo.topUpTripHorizon,
  {}
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
  {}
)

/**
 * Efface les demandes de liaison de messagerie échues. Une demande ne vit que
 * dix minutes : l'empreinte d'un jeton qui ne peut plus servir n'a pas à être
 * gardée.
 */
crons.interval(
  "purge messaging link requests",
  { hours: 1 },
  internal.messaging.linking.purgeExpiredRequests,
  {}
)

/**
 * Contrôle de santé d'exploitation.
 *
 * Toutes les quatre heures : assez souvent pour qu'une anomalie critique soit
 * datée à une demi-journée près, assez rare pour ne pas encombrer le journal
 * d'audit. Le tableau de bord, lui, est réactif et n'attend pas ce cron.
 */
crons.interval(
  "health check",
  { hours: 4 },
  internal.functions.monitoring.runHealthCheck,
  {}
)

export default crons
