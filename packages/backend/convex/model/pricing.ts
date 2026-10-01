/**
 * Moteur de yield management — logique pure.
 *
 * Se pose AU-DESSUS du barème kilométrique (`model/fares.ts`) : le barème
 * donne le prix de référence, ce module l'ajuste selon la demande, comme
 * l'exige le CDC §7.11.
 *
 * Deux mécanismes distincts, tous deux demandés par le cahier des charges :
 *
 *  1. Les CONTINGENTS de classes tarifaires (§7.11.3) — le prix monte par
 *     paliers à mesure que les places bon marché s'épuisent. C'est le cœur du
 *     yield ferroviaire, et il est couplé à l'inventaire.
 *  2. Les RÈGLES de modulation (§7.11.1, §7.11.6) — anticipation, période,
 *     remplissage, canal. Elles s'appliquent en pourcentage, par priorité.
 *
 * Un garde-fou clôt le calcul : le cumul des règles est borné par un plancher
 * et un plafond, pour qu'un empilement involontaire ne produise jamais un
 * prix aberrant.
 */

import { daysUntilDeparture, weekdayOf } from "./calendar"
import { roundFare } from "./fares"

/* ─────────────────────── Contingents de classes tarifaires ─────────────── */

/** Contingent de places vendues à un même coefficient. */
export interface FareClassQuota {
  readonly label: string
  /** Ordre d'épuisement : le plus petit est consommé en premier. */
  readonly priority: number
  readonly seatCount: number
  readonly soldCount: number
  readonly coefficient: number
  readonly isActive: boolean
}

/** Places encore disponibles dans un contingent. */
export function remainingInQuota(quota: FareClassQuota): number {
  return Math.max(0, quota.seatCount - quota.soldCount)
}

/**
 * Contingent qui servira la prochaine vente.
 *
 * On retient le contingent actif de plus faible priorité qui peut absorber
 * l'effectif complet : un groupe n'est jamais éclaté entre deux contingents,
 * ce qui rendrait le prix incompréhensible au guichet.
 *
 * Retourne `null` si aucun contingent ne convient — la desserte est alors
 * complète pour cet effectif, ou le yield n'est pas configuré.
 */
export function selectQuota(
  quotas: readonly FareClassQuota[],
  seatsNeeded: number,
): FareClassQuota | null {
  if (!Number.isInteger(seatsNeeded) || seatsNeeded < 1) {
    throw new RangeError(`Effectif invalide : ${seatsNeeded}`)
  }
  return (
    [...quotas]
      .filter((q) => q.isActive && remainingInQuota(q) >= seatsNeeded)
      .sort((a, b) => a.priority - b.priority)[0] ?? null
  )
}

/**
 * Taux de remplissage d'une desserte pour une classe, entre 0 et 1.
 * Sert d'assiette à la règle de modulation au remplissage.
 */
export function occupancyRate(capacity: number, sold: number): number {
  if (!Number.isFinite(capacity) || capacity < 0) {
    throw new RangeError(`Capacité invalide : ${capacity}`)
  }
  if (capacity === 0) return 1
  return Math.min(1, Math.max(0, sold / capacity))
}

/* ────────────────────────── Règles de modulation ───────────────────────── */

export const PRICING_RULE_TYPES = [
  "remplissage",
  "anticipation",
  "periode",
  "canal",
  "promotion",
] as const
export type PricingRuleType = (typeof PRICING_RULE_TYPES)[number]

export interface PricingRule {
  readonly id: string
  readonly type: PricingRuleType
  /**
   * Seuil de déclenchement, interprété selon le type :
   * taux de remplissage (0 à 1) pour `remplissage`, nombre de jours pour
   * `anticipation`, jour de semaine pour `periode`.
   */
  readonly threshold?: number
  readonly modifierPct: number
  readonly priority: number
  readonly validFrom?: number
  readonly validUntil?: number
  readonly code?: string
  readonly isActive: boolean
}

/** Contexte d'évaluation des règles au moment de la vente. */
export interface PricingContext {
  /** Taux de remplissage de la classe demandée, entre 0 et 1. */
  readonly occupancyRate: number
  /** Jours pleins entre l'instant de vente et le départ. */
  readonly daysUntilDeparture: number
  /** Jour de la semaine du départ, 0 = dimanche. */
  readonly departureWeekday: number
  readonly channel: string
  /** Instant de la vente, pour la validité des règles. */
  readonly now: number
  /** Code promotionnel présenté, le cas échéant. */
  readonly promoCode?: string
}

/**
 * Vrai si la règle s'applique au contexte.
 *
 * Les règles `anticipation` se déclenchent quand le départ est ENCORE
 * lointain (délai supérieur ou égal au seuil) pour une remise, ou quand il
 * est PROCHE (délai strictement inférieur) pour une majoration. Le signe du
 * modificateur tranche, ce qui évite d'avoir deux types de règles.
 */
export function ruleApplies(
  rule: PricingRule,
  context: PricingContext,
): boolean {
  if (!rule.isActive) return false
  if (rule.validFrom !== undefined && context.now < rule.validFrom) return false
  if (rule.validUntil !== undefined && context.now > rule.validUntil) {
    return false
  }

  switch (rule.type) {
    case "remplissage":
      return (
        rule.threshold !== undefined &&
        context.occupancyRate >= rule.threshold
      )

    case "anticipation": {
      if (rule.threshold === undefined) return false
      return rule.modifierPct < 0
        ? context.daysUntilDeparture >= rule.threshold
        : context.daysUntilDeparture < rule.threshold
    }

    case "periode":
      return (
        rule.threshold !== undefined &&
        context.departureWeekday === rule.threshold
      )

    case "canal":
      return rule.code === context.channel

    case "promotion":
      // Une promotion sans code s'applique à tous ; avec code, sur présentation.
      return rule.code === undefined || rule.code === context.promoCode

    default:
      return false
  }
}

/** Règles applicables, dans l'ordre de priorité croissante. */
export function applicableRules(
  rules: readonly PricingRule[],
  context: PricingContext,
): PricingRule[] {
  return rules
    .filter((rule) => ruleApplies(rule, context))
    .sort((a, b) => a.priority - b.priority)
}

/* ──────────────────────────── Calcul complet ───────────────────────────── */

export interface QuoteInput {
  /** Prix de référence issu du barème kilométrique, taxes comprises. */
  readonly basePriceTtc: number
  readonly distanceKm: number
  readonly quotas?: readonly FareClassQuota[]
  readonly seatsNeeded: number
  readonly rules: readonly PricingRule[]
  readonly context: PricingContext
  /** Bornes de sécurité, appliquées après cumul. */
  readonly floorXaf?: number
  readonly capXaf?: number
}

export interface Quote {
  readonly basePriceTtc: number
  /** Contingent retenu, s'il y en a un. */
  readonly quotaLabel: string | null
  readonly quotaCoefficient: number
  /** Prix après contingent, avant règles. */
  readonly afterQuota: number
  /** Cumul des modificateurs, en pourcentage. */
  readonly totalModifierPct: number
  readonly appliedRules: string[]
  /** Vrai si une borne a bridé le résultat. */
  readonly bounded: boolean
  readonly unitPriceTtc: number
}

/**
 * Calcule le prix unitaire d'un titre.
 *
 * Enchaînement : prix de référence → coefficient du contingent → cumul des
 * modificateurs de règles → bornes de sécurité → arrondi réglementaire.
 *
 * Les modificateurs s'additionnent plutôt que de se composer : c'est plus
 * lisible pour un agent commercial (« +30 % de remplissage et +20 % de
 * période, donc +50 % ») et cela évite qu'un empilement de facteurs
 * multiplicatifs ne s'emballe.
 */
export function quotePrice(input: QuoteInput): Quote {
  const {
    basePriceTtc,
    distanceKm,
    quotas,
    seatsNeeded,
    rules,
    context,
    floorXaf,
    capXaf,
  } = input

  if (!Number.isFinite(basePriceTtc) || basePriceTtc < 0) {
    throw new RangeError(`Prix de référence invalide : ${basePriceTtc}`)
  }

  const quota =
    quotas && quotas.length > 0 ? selectQuota(quotas, seatsNeeded) : null
  const coefficient = quota?.coefficient ?? 1
  const afterQuota = basePriceTtc * coefficient

  const applied = applicableRules(rules, context)
  const totalModifierPct = applied.reduce(
    (sum, rule) => sum + rule.modifierPct,
    0,
  )
  let price = afterQuota * (1 + totalModifierPct / 100)

  // Un prix négatif n'a aucun sens, même si les remises se cumulent.
  price = Math.max(0, price)

  let bounded = false
  if (floorXaf !== undefined && price < floorXaf) {
    price = floorXaf
    bounded = true
  }
  if (capXaf !== undefined && price > capXaf) {
    price = capXaf
    bounded = true
  }

  return {
    basePriceTtc,
    quotaLabel: quota?.label ?? null,
    quotaCoefficient: coefficient,
    afterQuota: Math.round(afterQuota * 100) / 100,
    totalModifierPct,
    appliedRules: applied.map((r) => r.id),
    bounded,
    unitPriceTtc: roundFare(price, distanceKm),
  }
}

/* ───────────────────── Contexte de yield d'une vente ────────────────────── */

/**
 * Règle de modulation telle qu'elle est enregistrée : sa portée en plus.
 *
 * Sans `tripId`, la règle vaut pour tout le réseau — y compris une règle « de
 * ligne », qui ne porte pas encore d'identifiant de ligne. Sans
 * `serviceClass`, elle vaut pour toutes les classes.
 */
export interface StoredPricingRule extends PricingRule {
  readonly tripId?: string
  readonly serviceClass?: string
}

/** Projection d'une règle enregistrée vers le moteur de yield. */
export function storedPricingRule(doc: {
  readonly _id: string
  readonly tripId?: string
  readonly serviceClass?: string
  readonly type: PricingRuleType
  readonly threshold?: number
  readonly modifierPct: number
  readonly priority: number
  readonly validFrom?: number
  readonly validUntil?: number
  readonly code?: string
  readonly isActive: boolean
}): StoredPricingRule {
  return {
    id: doc._id,
    tripId: doc.tripId,
    serviceClass: doc.serviceClass,
    type: doc.type,
    threshold: doc.threshold,
    modifierPct: doc.modifierPct,
    priority: doc.priority,
    validFrom: doc.validFrom,
    validUntil: doc.validUntil,
    code: doc.code,
    isActive: doc.isActive,
  }
}

/** Bornes de sécurité, appliquées après cumul des règles. */
export interface PricingBounds {
  readonly floorXaf?: number
  readonly capXaf?: number
}

/**
 * Bornes en vigueur : celles de la règle active la plus prioritaire qui en
 * déclare, quelle que soit sa portée.
 */
export function pricingBounds(
  rules: readonly (PricingBounds & { readonly priority: number })[],
): PricingBounds {
  const bounds = rules
    .filter((r) => r.floorXaf !== undefined || r.capXaf !== undefined)
    .sort((a, b) => a.priority - b.priority)[0]
  return { floorXaf: bounds?.floorXaf, capXaf: bounds?.capXaf }
}

/** Contingent tarifaire d'une classe sur une desserte. */
export interface ClassQuota extends FareClassQuota {
  readonly serviceClass: string
}

/** Compteur d'un segment de la desserte, dans une classe. */
export interface SegmentLoad {
  readonly serviceClass: string
  readonly segmentIndex: number
  readonly capacity: number
  readonly sold: number
}

/** Ce que le yield doit savoir d'une vente, lu en base ou embarqué. */
export interface SaleYieldInput {
  readonly tripId: string
  readonly serviceClass: string
  /** Rangs des gares de départ et d'arrivée dans la desserte. */
  readonly fromIndex: number
  readonly toIndex: number
  readonly departureAt: number
  /** Date de circulation, `AAAA-MM-JJ` à Libreville. */
  readonly serviceDate: string
  readonly channel: string
  /** Instant de la vente. */
  readonly now: number
  readonly promoCode?: string
  /** Contingents de la desserte, toutes classes confondues. */
  readonly quotas: readonly ClassQuota[]
  /** Règles actives, toutes portées confondues. */
  readonly rules: readonly StoredPricingRule[]
  /** Compteurs de la desserte, toutes classes confondues. */
  readonly counters: readonly SegmentLoad[]
  readonly bounds: PricingBounds
}

/** Tout ce que `quotePrice` attend, hors prix de référence, distance et effectif. */
export type SaleYield = Pick<
  QuoteInput,
  "quotas" | "rules" | "context" | "floorXaf" | "capXaf"
>

/**
 * Contexte de yield d'une vente : contingents de la classe, règles de la
 * desserte et de la classe, remplissage du tronçon, bornes.
 *
 * Partagé par la vente (`performSale`) et par le terminal contrôleur, qui
 * chiffre hors ligne la vente à bord avec les mêmes données, embarquées dans
 * le manifeste. Le prix annoncé au voyageur et celui que le serveur
 * recalcule sortent donc du même code : un écart ne peut venir que des
 * données (une vente intervenue entre-temps), jamais du calcul.
 *
 * Le remplissage est celui du segment le plus chargé du tronçon, rapporté à
 * la capacité du premier : c'est lui qui borne la disponibilité.
 */
export function saleYield(input: SaleYieldInput): SaleYield {
  const quotas = input.quotas
    .filter((q) => q.serviceClass === input.serviceClass)
    .map((q) => ({
      label: q.label,
      priority: q.priority,
      seatCount: q.seatCount,
      soldCount: q.soldCount,
      coefficient: q.coefficient,
      isActive: q.isActive,
    }))

  const rules: PricingRule[] = input.rules
    .filter((r) => r.tripId === undefined || r.tripId === input.tripId)
    .filter(
      (r) =>
        r.serviceClass === undefined || r.serviceClass === input.serviceClass,
    )
    .map((r) => ({
      id: r.id,
      type: r.type,
      threshold: r.threshold,
      modifierPct: r.modifierPct,
      priority: r.priority,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      code: r.code,
      isActive: r.isActive,
    }))

  const onRoute = input.counters.filter(
    (c) =>
      c.serviceClass === input.serviceClass &&
      c.segmentIndex >= input.fromIndex &&
      c.segmentIndex < input.toIndex,
  )
  const capacity = onRoute[0]?.capacity ?? 0
  const sold = onRoute.length > 0 ? Math.max(...onRoute.map((c) => c.sold)) : 0

  return {
    quotas,
    rules,
    context: {
      occupancyRate: occupancyRate(capacity, sold),
      daysUntilDeparture: daysUntilDeparture(input.departureAt, input.now),
      departureWeekday: weekdayOf(input.serviceDate),
      channel: input.channel,
      now: input.now,
      promoCode: input.promoCode,
    },
    floorXaf: input.bounds.floorXaf,
    capXaf: input.bounds.capXaf,
  }
}

/**
 * Consomme des places dans un contingent.
 * Lève si le contingent ne peut pas absorber l'effectif — le garde-fou est
 * ici, pas dans l'appelant.
 */
export function consumeQuota(
  quota: FareClassQuota,
  seats: number,
): FareClassQuota {
  if (!Number.isInteger(seats) || seats < 1) {
    throw new RangeError(`Effectif invalide : ${seats}`)
  }
  if (remainingInQuota(quota) < seats) {
    throw new Error(
      `Contingent « ${quota.label} » épuisé : ${seats} place(s) demandée(s), ` +
        `${remainingInQuota(quota)} disponible(s)`,
    )
  }
  return { ...quota, soldCount: quota.soldCount + seats }
}

/** Restitue des places à un contingent lors d'une annulation. */
export function releaseQuota(
  quota: FareClassQuota,
  seats: number,
): FareClassQuota {
  if (!Number.isInteger(seats) || seats < 1) {
    throw new RangeError(`Effectif invalide : ${seats}`)
  }
  return { ...quota, soldCount: Math.max(0, quota.soldCount - seats) }
}
