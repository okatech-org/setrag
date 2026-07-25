import { CANCELLATION_CUTOFF_MS, type ServiceClass } from "../constants"

/** Coefficient tarifaire appliqué au prix de base de la desserte. */
export const CLASS_MULTIPLIER: Record<ServiceClass, number> = {
  economique: 1,
  confort: 1.5,
  vip: 2.25,
}

/** Prix d'une place pour une classe donnée, arrondi à 100 XAF. */
export function computeSeatPrice(
  basePriceXaf: number,
  serviceClass: ServiceClass
): number {
  const raw = basePriceXaf * CLASS_MULTIPLIER[serviceClass]
  return Math.round(raw / 100) * 100
}

/** Total d'une réservation. */
export function computeBookingTotal(
  basePriceXaf: number,
  serviceClass: ServiceClass,
  passengerCount: number
): number {
  return computeSeatPrice(basePriceXaf, serviceClass) * passengerCount
}

/**
 * Barème de remboursement en fonction du délai avant le départ.
 * Aucun remboursement passé le seuil d'annulation.
 */
export function computeRefundAmount(
  paidXaf: number,
  departureAt: number,
  now: number
): number {
  const remaining = departureAt - now
  if (remaining < CANCELLATION_CUTOFF_MS) return 0
  const rate = remaining >= 48 * 3600_000 ? 0.9 : 0.5
  return Math.round((paidXaf * rate) / 100) * 100
}

export function canCancel(departureAt: number, now: number): boolean {
  return departureAt - now >= CANCELLATION_CUTOFF_MS
}
