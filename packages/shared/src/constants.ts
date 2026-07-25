/**
 * Constantes métier SETRAG — partagées entre le backend Convex,
 * les applications web et l'application mobile.
 */

/** Devise unique de la billetterie (Franc CFA BEAC). */
export const CURRENCY = "XAF" as const

/** Fuseau horaire d'exploitation du réseau. */
export const TIMEZONE = "Africa/Libreville" as const

/** Classes de service commercialisées sur le Transgabonais. */
export const SERVICE_CLASSES = ["economique", "confort", "vip"] as const
export type ServiceClass = (typeof SERVICE_CLASSES)[number]

/** Cycle de vie d'une réservation. */
export const BOOKING_STATUSES = [
  "brouillon",
  "en_attente_paiement",
  "confirmee",
  "annulee",
  "expiree",
  "remboursee",
] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

/** Cycle de vie d'un billet nominatif. */
export const TICKET_STATUSES = [
  "valide",
  "utilise",
  "annule",
  "rembourse",
  "expire",
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

/** Moyens de paiement acceptés. */
export const PAYMENT_METHODS = [
  "mobile_money_airtel",
  "mobile_money_moov",
  "carte_bancaire",
  "especes_guichet",
  "virement",
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Rôles applicatifs (portail agent / back-office). */
export const ROLES = [
  "voyageur",
  "agent_guichet",
  "controleur",
  "chef_gare",
  "superviseur",
  "admin",
] as const
export type Role = (typeof ROLES)[number]

/** Rôles autorisés à accéder au portail agent. */
export const AGENT_ROLES: readonly Role[] = [
  "agent_guichet",
  "controleur",
  "chef_gare",
  "superviseur",
  "admin",
]

/** Durée de blocage d'une place avant paiement (ms). */
export const SEAT_HOLD_DURATION_MS = 15 * 60 * 1000

/** Délai minimal avant départ pour autoriser une annulation (ms). */
export const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000
