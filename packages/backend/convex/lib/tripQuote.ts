import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { daysUntilDeparture, weekdayOf } from "../model/calendar"
import { computeTicketFare, type FareSchedule } from "../model/fares"
import { occupancyRate, quotePrice, type PricingRule } from "../model/pricing"

export interface TripQuoteArgs {
  tripId: Id<"trips">
  originStationId: Id<"stations">
  destinationStationId: Id<"stations">
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  passengerCount: number
  discountCodes?: string[]
  promoCode?: string
}

/**
 * Grille tarifaire active et règles de yield, chargées une fois.
 *
 * Une recherche chiffre plusieurs dessertes et plusieurs classes ; le
 * calendrier, plusieurs jours. Recharger la grille à chaque devis multiplierait
 * les lectures sans rien changer au résultat : elle est donc lue ici, puis
 * passée à `devisDesserte`.
 */
export async function chargerTarification(ctx: QueryCtx) {
  const schedule = await ctx.db
    .query("fareSchedules")
    .withIndex("by_status", (q) => q.eq("status", "actif"))
    .first()
  if (!schedule) throw new Error("Aucune grille tarifaire active")

  const [bases, discounts, rules] = await Promise.all([
    ctx.db
      .query("fareBases")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .collect(),
    ctx.db
      .query("discounts")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .collect(),
    ctx.db
      .query("pricingRules")
      .withIndex("by_active_priority", (q) => q.eq("isActive", true))
      .collect(),
  ])

  const fareSchedule: FareSchedule = {
    taxes: { vatPct: schedule.vatPct, cssPct: schedule.cssPct },
    roundingBasis: schedule.roundingBasis,
    bases: bases.map((base) => ({
      trainType: base.trainType,
      serviceClass: base.serviceClass,
      shortDistanceRate: base.shortDistanceRate,
      longDistanceRate: base.longDistanceRate,
    })),
  }
  const bounds = rules
    .filter((rule) => rule.floorXaf !== undefined || rule.capXaf !== undefined)
    .sort((left, right) => left.priority - right.priority)[0]

  return { fareSchedule, discounts, rules, bounds }
}

export type Tarification = Awaited<ReturnType<typeof chargerTarification>>

/**
 * Calcule un devis sans écrire ni réserver.
 *
 * Le canal fait partie du contexte de yield : une même desserte peut avoir
 * des règles différentes en ligne et au guichet. Centraliser ce calcul évite
 * qu'un écran annonce un montant que la mutation de vente recalculerait
 * différemment.
 */
export async function quoteTrip(
  ctx: QueryCtx,
  args: TripQuoteArgs,
  channel: "ligne" | "guichet"
) {
  const trip = await ctx.db.get(args.tripId)
  if (!trip) throw new Error("Desserte introuvable")

  const stops = (
    await ctx.db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId))
      .collect()
  ).sort((a, b) => a.sequence - b.sequence)

  const fromIndex = stops.findIndex(
    (stop) => stop.stationId === args.originStationId
  )
  const toIndex = stops.findIndex(
    (stop) => stop.stationId === args.destinationStationId
  )
  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    throw new Error("Trajet incompatible avec cette desserte")
  }

  return await devisDesserte(
    ctx,
    await chargerTarification(ctx),
    {
      trip,
      distanceKm: Math.abs(
        stops[toIndex]!.kilometerPoint - stops[fromIndex]!.kilometerPoint
      ),
      fromIndex,
      toIndex,
      serviceClass: args.serviceClass,
      passengerCount: args.passengerCount,
      discountCodes: args.discountCodes,
      promoCode: args.promoCode,
    },
    channel
  )
}

/**
 * Lectures d'une desserte déjà faites par l'appelant, toutes classes
 * confondues. Une recherche lit les compteurs pour la disponibilité, puis
 * chiffre jusqu'à trois classes : les lui repasser évite de relire les mêmes
 * lignes à chaque devis.
 */
export interface LecturesDesserte {
  counters?: readonly Doc<"segmentCounters">[]
  quotas?: readonly Doc<"fareClassQuotas">[]
}

/**
 * Devis d'une desserte déjà lue, la grille étant chargée par l'appelant.
 *
 * Le prix d'un voyageur ne dépend que de sa réduction : le contexte de yield
 * (remplissage, anticipation, canal, contingent pour l'effectif du groupe) est
 * le même pour tous. Il est donc calculé une fois par code de réduction
 * distinct, puis reporté sur chaque voyageur — un groupe de 500 adultes coûte
 * un calcul, pas 500.
 */
export async function devisDesserte(
  ctx: QueryCtx,
  tarification: Tarification,
  args: {
    trip: Doc<"trips">
    distanceKm: number
    fromIndex: number
    toIndex: number
    serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
    passengerCount: number
    discountCodes?: string[]
    promoCode?: string
  },
  channel: "ligne" | "guichet",
  lectures: LecturesDesserte = {}
) {
  if (!Number.isInteger(args.passengerCount) || args.passengerCount < 1) {
    throw new Error(`Nombre de voyageurs invalide : ${args.passengerCount}`)
  }
  const { trip, distanceKm, fromIndex, toIndex } = args
  const { fareSchedule, discounts, rules, bounds } = tarification

  const quotas = (
    lectures.quotas ??
    (await ctx.db
      .query("fareClassQuotas")
      .withIndex("by_trip_class", (q) =>
        q.eq("tripId", trip._id).eq("serviceClass", args.serviceClass)
      )
      .collect())
  ).filter(
    (quota) =>
      quota.tripId === trip._id && quota.serviceClass === args.serviceClass
  )

  const counters = (
    lectures.counters ??
    (await ctx.db
      .query("segmentCounters")
      .withIndex("by_trip_class", (q) =>
        q.eq("tripId", trip._id).eq("serviceClass", args.serviceClass)
      )
      .collect())
  ).filter(
    (counter) =>
      counter.tripId === trip._id &&
      counter.serviceClass === args.serviceClass &&
      counter.segmentIndex >= fromIndex &&
      counter.segmentIndex < toIndex
  )

  const available =
    counters.length > 0
      ? Math.min(...counters.map((counter) => counter.available))
      : 0
  const capacity = counters[0]?.capacity ?? 0
  const sold =
    counters.length > 0
      ? Math.max(...counters.map((counter) => counter.sold))
      : 0
  const now = Date.now()
  const context = {
    occupancyRate: occupancyRate(capacity, sold),
    daysUntilDeparture: daysUntilDeparture(trip.departureAt, now),
    departureWeekday: weekdayOf(trip.serviceDate),
    channel,
    now,
    promoCode: args.promoCode,
  }

  const scopedRules: PricingRule[] = rules
    .filter((rule) => rule.tripId === undefined || rule.tripId === trip._id)
    .filter(
      (rule) =>
        rule.serviceClass === undefined ||
        rule.serviceClass === args.serviceClass
    )
    .map((rule) => ({
      id: rule._id,
      type: rule.type,
      threshold: rule.threshold,
      modifierPct: rule.modifierPct,
      priority: rule.priority,
      validFrom: rule.validFrom,
      validUntil: rule.validUntil,
      code: rule.code,
      isActive: rule.isActive,
    }))
  const quotaInputs = quotas.map((quota) => ({
    label: quota.label,
    priority: quota.priority,
    seatCount: quota.seatCount,
    soldCount: quota.soldCount,
    coefficient: quota.coefficient,
    isActive: quota.isActive,
  }))

  /** Une ligne de devis par code de réduction (`""` : plein tarif). */
  const parCode = new Map<
    string,
    {
      discountCode: string | null
      discountLabel: string | null
      quotaLabel: string | null
      unitPriceTtc: number
      appliedRules: string[]
    }
  >()
  const ligneDuCode = (code: string) => {
    const connue = parCode.get(code)
    if (connue) return connue
    const discount = code
      ? discounts.find(
          (candidate) => candidate.code === code && candidate.isActive
        )
      : undefined
    if (code && !discount) {
      throw new Error(`Réduction « ${code} » inconnue ou désactivée`)
    }

    const base = computeTicketFare({
      schedule: fareSchedule,
      trainType: trip.trainType,
      serviceClass: args.serviceClass,
      distanceKm,
      discount: discount
        ? {
            code: discount.code as never,
            ratePct: discount.ratePct,
            label: discount.label,
          }
        : null,
    })
    const quote = quotePrice({
      basePriceTtc: base.ttc,
      distanceKm,
      quotas: quotaInputs,
      seatsNeeded: args.passengerCount,
      rules: scopedRules,
      context,
      floorXaf: bounds?.floorXaf,
      capXaf: bounds?.capXaf,
    })
    const ligne = {
      discountCode: discount?.code ?? null,
      discountLabel: discount?.label ?? null,
      quotaLabel: quote.quotaLabel,
      unitPriceTtc: quote.unitPriceTtc,
      appliedRules: quote.appliedRules,
    }
    parCode.set(code, ligne)
    return ligne
  }

  const lines = []
  let totalTtc = 0
  for (let index = 0; index < args.passengerCount; index += 1) {
    const ligne = ligneDuCode(args.discountCodes?.[index] || "")
    totalTtc += ligne.unitPriceTtc
    lines.push(ligne)
  }

  return {
    distanceKm,
    fromIndex,
    toIndex,
    available,
    hasAvailability: available >= args.passengerCount,
    lines,
    totalTtc,
  }
}
