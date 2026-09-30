import type { Classe } from "@/lib/voyage"

/**
 * Règles de vente que le backend applique, reprises pour être écrites en
 * toutes lettres dans les pages d'information.
 *
 * Aucune n'est inventée ici : chaque valeur renvoie à sa source. Si la source
 * change, la valeur change avec elle. Tout ce qui peut se lire par une query
 * publique (réductions, prix, gares) est lu, jamais recopié.
 */

/**
 * Tenue d'une réservation non réglée, en minutes.
 * Source : `HOLD_DURATION_MS`, packages/backend/convex/functions/bookings.ts.
 */
export const TENUE_MINUTES = 15

/**
 * Intervalle du contrôle qui libère les réservations expirées.
 * Source : `crons.interval(… { minutes: 5 }, expireStaleHolds)`, packages/backend/convex/crons.ts.
 */
export const PASSAGE_EXPIRATION_MINUTES = 5

/**
 * Version des conditions générales enregistrée sur chaque vente payée.
 * Lue dans le paquet backend (`CURRENT_CGV_VERSION`, reprise par
 * `bookings.confirm`) : une seule source, voir `@/lib/cgv`.
 */
export { CGV_VERSION as VERSION_CGV } from "@/lib/cgv"

/**
 * Classes vendues sur chaque type de train, d'après le barème kilométrique
 * de l'annexe 2 du cahier des charges (p. 30, §9.8.1) : la VIP n'a de taux
 * que sur l'Express. Même table dans packages/backend/convex/seeds/referential.ts
 * (`FARE_BASES`). Le train spécial n'a pas de barème publié.
 */
export const CLASSES_PAR_TYPE: ReadonlyArray<{
  type: "EXPRESS" | "OMNIBUS" | "AUTORAIL"
  classes: readonly Classe[]
}> = [
  { type: "EXPRESS", classes: ["DEUXIEME", "PREMIERE", "VIP"] },
  { type: "OMNIBUS", classes: ["DEUXIEME", "PREMIERE"] },
  { type: "AUTORAIL", classes: ["DEUXIEME", "PREMIERE"] },
]

/**
 * Moyens de paiement prévus par le cahier des charges Front-Office (§4.3,
 * p. 9) et connus du schéma (`paymentMethod`, packages/backend/convex/schema.ts).
 */
export const MOYENS_EN_LIGNE = [
  "Airtel Money",
  "Moov Money",
  "Click&Pay",
  "Visa",
  "Mastercard",
] as const
