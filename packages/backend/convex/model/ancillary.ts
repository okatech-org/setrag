/**
 * Tarification des produits hors billet — logique pure.
 *
 * Quatre produits du CDC §7.1 : bagages, colis express, transport auto
 * accompagné et transport funéraire. Contrairement au billet, leur prix ne
 * dérive pas d'un barème kilométrique mais de grilles tabulaires.
 *
 * ⚠️ La grille des colis express (zones × paliers de poids) N'EST PAS fournie
 * dans le cahier des charges : l'annexe 2 §9.8.4 décrit sa structure puis
 * renvoie à un tableau absent. Ce module la traite donc comme une DONNÉE à
 * charger, et échoue explicitement quand elle manque plutôt que d'inventer
 * un prix.
 */

import {
  BAGGAGE_MAX_WEIGHT_KG,
  PARCEL_BULK_THRESHOLD_KG,
  PARCEL_MAX_UNIT_WEIGHT_KG,
  baggageRegistrationFeeHt,
  parcelWeightTier,
  parcelZone,
} from "./fares"

export {
  BAGGAGE_MAX_WEIGHT_KG,
  PARCEL_BULK_THRESHOLD_KG,
  PARCEL_MAX_UNIT_WEIGHT_KG,
  parcelWeightTier,
  parcelZone,
}

/** Ligne de barème tabulaire, telle que stockée en base. */
export interface AncillaryFareRow {
  readonly product: "bagage" | "colis" | "taa" | "funeraire"
  readonly zone?: number
  readonly weightTier?: number
  readonly amountHt: number
  readonly franchiseKg?: number
  readonly label: string
  /** Vrai pour un barème provisoire de démonstration. */
  readonly isProvisional?: boolean
}

/**
 * Conditions de facturation d'un bagage pour une distance donnée.
 *
 * Franchise et prix du kilogramme excédentaire viennent du barème, jamais de
 * la saisie de l'agent : le guichet n'a pas à connaître les tarifs.
 */
export function resolveBaggageTerms(
  grid: readonly AncillaryFareRow[],
  distanceKm: number,
): { franchiseKg: number; excessRatePerKgHt: number; isProvisional: boolean } {
  const zone = parcelZone(distanceKm)
  const row = grid.find((r) => r.product === "bagage" && r.zone === zone)
  if (!row) {
    // Sans ligne de barème, seuls les frais d'enregistrement s'appliquent :
    // ils sont fixés par le CDC et ne dépendent d'aucune grille.
    return { franchiseKg: 0, excessRatePerKgHt: 0, isProvisional: false }
  }
  return {
    franchiseKg: row.franchiseKg ?? 0,
    excessRatePerKgHt: row.amountHt,
    isProvisional: row.isProvisional === true,
  }
}

/* ────────────────────────────── Bagages ────────────────────────────────── */

export interface BaggageFareInput {
  readonly distanceKm: number
  readonly weightKg: number
  /**
   * Franchise de poids attachée au code tarifaire, en kilogrammes.
   * Le CDC §7.9.2 en fait un attribut du tarif ; au-delà, l'excédent est
   * facturé.
   */
  readonly franchiseKg?: number
  /** Prix HT du kilogramme excédentaire, issu de la grille. */
  readonly excessRatePerKgHt?: number
}

export interface BaggageFareBreakdown {
  readonly registrationHt: number
  readonly excessKg: number
  readonly excessHt: number
  readonly totalHt: number
}

/**
 * Calcule le prix hors taxes d'un bagage.
 *
 * Les frais d'enregistrement sont obligatoires quelle que soit la franchise
 * (annexe 2 §9.8.3) : ils rémunèrent l'opération de prise en charge, pas le
 * transport du poids.
 */
export function computeBaggageFare(
  input: BaggageFareInput,
): BaggageFareBreakdown {
  const { distanceKm, weightKg } = input
  assertWeight(weightKg, "Poids du bagage")
  if (weightKg > BAGGAGE_MAX_WEIGHT_KG) {
    throw new Error(
      `Bagage de ${weightKg} kg : au-delà de ${BAGGAGE_MAX_WEIGHT_KG} kg, ` +
        `l'envoi relève du régime colis express`,
    )
  }

  const franchiseKg = input.franchiseKg ?? 0
  if (franchiseKg < 0) {
    throw new RangeError(`Franchise invalide : ${franchiseKg}`)
  }
  const excessRate = input.excessRatePerKgHt ?? 0
  if (excessRate < 0) {
    throw new RangeError(`Tarif d'excédent invalide : ${excessRate}`)
  }

  const registrationHt = baggageRegistrationFeeHt(distanceKm)
  const excessKg = Math.max(0, weightKg - franchiseKg)
  const excessHt = round2(excessKg * excessRate)

  return {
    registrationHt,
    excessKg: round2(excessKg),
    excessHt,
    totalHt: round2(registrationHt + excessHt),
  }
}

/* ─────────────────────────── Colis express ─────────────────────────────── */

export interface ParcelItemFareInput {
  readonly distanceKm: number
  readonly weightKg: number
  /** Grille tabulaire, filtrée sur le produit « colis ». */
  readonly grid: readonly AncillaryFareRow[]
}

export interface ParcelItemFareBreakdown {
  readonly zone: number
  readonly weightTier: number
  readonly baseHt: number
  /** Tranches de 100 kg facturées au-delà du seuil de masse. */
  readonly bulkFractions: number
  readonly bulkHt: number
  readonly totalHt: number
}

/**
 * Calcule le prix hors taxes d'un article de colis express.
 *
 * Au-delà de 500 kg, l'annexe 2 prévoit une facturation « par fraction
 * indivisible de 100 kg » : le palier maximal de la grille sert de base et
 * chaque fraction entamée s'y ajoute au tarif de la dernière tranche.
 */
export function computeParcelItemFare(
  input: ParcelItemFareInput,
): ParcelItemFareBreakdown {
  const { distanceKm, weightKg, grid } = input
  assertWeight(weightKg, "Poids du colis")
  if (weightKg > PARCEL_MAX_UNIT_WEIGHT_KG) {
    throw new Error(
      `Colis de ${weightKg} kg : le régime express est limité à ` +
        `${PARCEL_MAX_UNIT_WEIGHT_KG} kg par article`,
    )
  }

  const zone = parcelZone(distanceKm)
  const tier = parcelWeightTier(weightKg)

  const rows = grid.filter((r) => r.product === "colis" && r.zone === zone)
  if (rows.length === 0) {
    throw new Error(
      `Barème colis absent pour la zone ${zone} : la grille zones × paliers ` +
        `de poids n'est pas renseignée. Elle doit être obtenue auprès de ` +
        `SETRAG (annexe 2 §9.8.4 renvoie à un tableau non fourni).`,
    )
  }

  const exact = rows.find((r) => r.weightTier === tier)
  if (!exact) {
    const paliers = rows
      .map((r) => r.weightTier)
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b)
    throw new Error(
      `Barème colis incomplet : palier de poids ${tier} absent pour la ` +
        `zone ${zone} (paliers disponibles : ${paliers.join(", ")})`,
    )
  }

  return {
    zone,
    weightTier: tier,
    baseHt: exact.amountHt,
    bulkFractions: 0,
    bulkHt: 0,
    totalHt: round2(exact.amountHt),
  }
}

/**
 * Nombre de fractions indivisibles de 100 kg au-delà du seuil de masse.
 * Exposé séparément : la règle s'applique à des expéditions hors régime
 * express, dont le barème n'est pas non plus fourni.
 */
export function bulkFractions(weightKg: number): number {
  assertWeight(weightKg, "Poids")
  if (weightKg <= PARCEL_BULK_THRESHOLD_KG) return 0
  return Math.ceil((weightKg - PARCEL_BULK_THRESHOLD_KG) / 100)
}

/** Prix total hors taxes d'une expédition, articles cumulés. */
export function computeParcelFare(
  items: readonly { weightKg: number }[],
  distanceKm: number,
  grid: readonly AncillaryFareRow[],
): { totalHt: number; totalWeightKg: number; items: ParcelItemFareBreakdown[] } {
  if (items.length === 0) {
    throw new Error("Expédition sans article : tarification impossible")
  }
  const details = items.map((item) =>
    computeParcelItemFare({ distanceKm, weightKg: item.weightKg, grid }),
  )
  return {
    totalHt: round2(details.reduce((sum, d) => sum + d.totalHt, 0)),
    totalWeightKg: round2(
      items.reduce((sum, item) => sum + item.weightKg, 0),
    ),
    items: details,
  }
}

/* ──────────────── Transport auto accompagné et funéraire ───────────────── */

export interface TonnageFareInput {
  readonly product: "taa" | "funeraire"
  readonly distanceKm: number
  readonly tonnage: number
  readonly grid: readonly AncillaryFareRow[]
}

/**
 * Calcule le prix hors taxes d'un transport au tonnage.
 *
 * Le CDC décrit ces deux prestations avec un « code tarifaire » et un
 * tonnage, sans fournir le barème. La grille est donc lue en base, indexée
 * par zone kilométrique, et l'absence de ligne est signalée explicitement.
 */
export function computeTonnageFare(input: TonnageFareInput): {
  zone: number
  ratePerTonneHt: number
  totalHt: number
} {
  const { product, distanceKm, tonnage, grid } = input
  if (!Number.isFinite(tonnage) || tonnage <= 0) {
    throw new RangeError(`Tonnage invalide : ${tonnage}`)
  }

  const zone = parcelZone(distanceKm)
  const row = grid.find((r) => r.product === product && r.zone === zone)
  if (!row) {
    throw new Error(
      `Barème « ${product} » absent pour la zone ${zone} : il doit être ` +
        `renseigné avant toute vente (non fourni par le cahier des charges).`,
    )
  }

  return {
    zone,
    ratePerTonneHt: row.amountHt,
    totalHt: round2(row.amountHt * tonnage),
  }
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

function assertWeight(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} invalide : ${value}`)
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
