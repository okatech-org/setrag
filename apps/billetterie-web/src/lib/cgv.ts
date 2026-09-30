import { CURRENT_CGV_VERSION } from "@workspace/backend/cgv"

/**
 * Version des conditions générales de vente acceptée au paiement.
 *
 * Lue dans le paquet backend (`@workspace/backend/cgv`), source unique : la
 * version envoyée à `bookings.confirm` est enregistrée sur la vente, avec
 * l'heure d'acceptation, pour être opposable — y compris pour un achat sans
 * compte.
 */
export const CGV_VERSION = CURRENT_CGV_VERSION

/** « 2026-07 », tel qu'on l'écrit à côté de la case à cocher. */
export const LIBELLE_VERSION_CGV = CGV_VERSION.replace(/^cgv-/, "")
