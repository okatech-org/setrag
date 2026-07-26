import { v } from "convex/values"
import { internalMutation, mutation, query } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { audit, getUser, requireUser } from "../lib/auth"
import { activeFareSchedule, currentAccountingDay } from "../lib/saleContext"
import { paymentMethod, serviceClass } from "../schema"
import { performSale } from "./sales"
import { computeTicketFare, type FareSchedule } from "../model/fares"
import { occupancyRate, quotePrice, type PricingRule } from "../model/pricing"
import { release, segmentMask } from "../model/inventory"
import { daysUntilDeparture, weekdayOf } from "../model/calendar"

/**
 * Vente en ligne — réservation, règlement et espace client.
 *
 * Une réservation bloque les places pour un temps limité : le voyageur a le
 * temps de payer sans que le train se remplisse sous lui, et les places
 * reviennent automatiquement à la vente s'il abandonne.
 *
 * L'allocation passe par la MÊME fonction que la vente au guichet
 * (`performSale`) : c'est ce qui garantit qu'une réservation en ligne et une
 * vente au comptoir ne peuvent jamais attribuer la même place.
 */

/** Durée du blocage d'une réservation non réglée. */
export const HOLD_DURATION_MS = 15 * 60 * 1000

const passengerArg = v.object({
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
  emergencyPhone: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  nationality: v.optional(v.string()),
  documentNumber: v.optional(v.string()),
  discountCode: v.optional(v.string()),
  seatId: v.optional(v.id("seats")),
})

/* ──────────────────────────── Devis public ─────────────────────────────── */

/**
 * Prix d'un trajet, sans rien réserver.
 *
 * Query publique : le site doit pouvoir afficher un prix avant toute
 * identification. Le montant retourné est indicatif — il sera figé à la
 * création de la réservation, et le yield peut l'avoir fait évoluer entre
 * les deux.
 */
export const quote = query({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengerCount: v.number(),
    discountCodes: v.optional(v.array(v.string())),
    promoCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.passengerCount) || args.passengerCount < 1) {
      throw new Error(`Nombre de voyageurs invalide : ${args.passengerCount}`)
    }

    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const stops = (
      await ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).sort((a, b) => a.sequence - b.sequence)

    const fromIndex = stops.findIndex(
      (s) => s.stationId === args.originStationId,
    )
    const toIndex = stops.findIndex(
      (s) => s.stationId === args.destinationStationId,
    )
    if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
      throw new Error("Trajet incompatible avec cette desserte")
    }
    const distanceKm = Math.abs(
      stops[toIndex]!.kilometerPoint - stops[fromIndex]!.kilometerPoint,
    )

    const schedule = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()
    if (!schedule) throw new Error("Aucune grille tarifaire active")

    const [bases, discounts, quotas, rules] = await Promise.all([
      ctx.db
        .query("fareBases")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .collect(),
      ctx.db
        .query("discounts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .collect(),
      ctx.db
        .query("fareClassQuotas")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", args.tripId).eq("serviceClass", args.serviceClass),
        )
        .collect(),
      ctx.db
        .query("pricingRules")
        .withIndex("by_active_priority", (q) => q.eq("isActive", true))
        .collect(),
    ])

    const fareSchedule: FareSchedule = {
      taxes: { vatPct: schedule.vatPct, cssPct: schedule.cssPct },
      roundingBasis: schedule.roundingBasis,
      bases: bases.map((b) => ({
        trainType: b.trainType,
        serviceClass: b.serviceClass,
        shortDistanceRate: b.shortDistanceRate,
        longDistanceRate: b.longDistanceRate,
      })),
    }

    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", args.tripId).eq("serviceClass", args.serviceClass),
        )
        .collect()
    ).filter((c) => c.segmentIndex >= fromIndex && c.segmentIndex < toIndex)

    const available =
      counters.length > 0 ? Math.min(...counters.map((c) => c.available)) : 0
    const capacity = counters[0]?.capacity ?? 0
    const sold = counters.length > 0 ? Math.max(...counters.map((c) => c.sold)) : 0

    const now = Date.now()
    const context = {
      occupancyRate: occupancyRate(capacity, sold),
      daysUntilDeparture: daysUntilDeparture(trip.departureAt, now),
      departureWeekday: weekdayOf(trip.serviceDate),
      channel: "ligne",
      now,
      promoCode: args.promoCode,
    }

    const scopedRules: PricingRule[] = rules
      .filter((r) => r.tripId === undefined || r.tripId === args.tripId)
      .filter(
        (r) =>
          r.serviceClass === undefined || r.serviceClass === args.serviceClass,
      )
      .map((r) => ({
        id: r._id,
        type: r.type,
        threshold: r.threshold,
        modifierPct: r.modifierPct,
        priority: r.priority,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        code: r.code,
        isActive: r.isActive,
      }))
    const bounds = rules
      .filter((r) => r.floorXaf !== undefined || r.capXaf !== undefined)
      .sort((a, b) => a.priority - b.priority)[0]

    const lignes = []
    let total = 0
    for (let i = 0; i < args.passengerCount; i += 1) {
      const code = args.discountCodes?.[i]
      const discount = code
        ? discounts.find((d) => d.code === code && d.isActive)
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
      const q = quotePrice({
        basePriceTtc: base.ttc,
        distanceKm,
        quotas: quotas.map((x) => ({
          label: x.label,
          priority: x.priority,
          seatCount: x.seatCount,
          soldCount: x.soldCount,
          coefficient: x.coefficient,
          isActive: x.isActive,
        })),
        seatsNeeded: args.passengerCount,
        rules: scopedRules,
        context,
        floorXaf: bounds?.floorXaf,
        capXaf: bounds?.capXaf,
      })
      total += q.unitPriceTtc
      lignes.push({
        discountCode: discount?.code ?? null,
        discountLabel: discount?.label ?? null,
        quotaLabel: q.quotaLabel,
        unitPriceTtc: q.unitPriceTtc,
        appliedRules: q.appliedRules,
      })
    }

    return {
      distanceKm,
      fromIndex,
      toIndex,
      available,
      hasAvailability: available >= args.passengerCount,
      lines: lignes,
      totalTtc: total,
      holdDurationMs: HOLD_DURATION_MS,
    }
  },
})

/* ────────────────────────── Créer une réservation ──────────────────────── */

/**
 * Réserve des places pour quinze minutes.
 *
 * Accessible sans compte : le CDC fait de l'espace client une option. Le
 * numéro de téléphone suffit à retrouver la réservation, et le voyageur peut
 * régler en ligne ou au guichet avant expiration.
 */
export const create = mutation({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengers: v.array(passengerArg),
    contactPhone: v.string(),
    contactEmail: v.optional(v.string()),
    promoCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.contactPhone.trim()) {
      throw new Error("Un contact téléphonique est obligatoire")
    }
    // L'identification est facultative : un visiteur peut réserver.
    const customer = await getUser(ctx)

    const result = await performSale(
      ctx,
      {
        customer,
        channel: "ligne",
        mode: "hold",
        holdMs: HOLD_DURATION_MS,
        contactPhone: args.contactPhone,
        contactEmail: args.contactEmail,
      },
      {
        tripId: args.tripId,
        originStationId: args.originStationId,
        destinationStationId: args.destinationStationId,
        serviceClass: args.serviceClass,
        passengers: args.passengers,
        method: "airtel_money",
        promoCode: args.promoCode,
      },
    )

    return {
      ...result,
      reference: result.number,
      holdExpiresAt: Date.now() + HOLD_DURATION_MS,
    }
  },
})

/* ───────────────────────── Régler une réservation ──────────────────────── */

/**
 * Confirme une réservation et transforme le blocage en vente ferme.
 *
 * En attendant le branchement d'un prestataire de paiement, le règlement est
 * enregistré tel quel : le parcours est complet et démontrable, seule
 * l'autorisation bancaire manque.
 */
export const confirm = mutation({
  args: {
    reference: v.string(),
    method: paymentMethod,
    payerPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sale = await ctx.db
      .query("sales")
      .withIndex("by_number", (q) => q.eq("number", args.reference))
      .unique()
    if (!sale) throw new Error("Réservation introuvable")
    if (sale.status === "confirmee") {
      throw new Error("Réservation déjà réglée")
    }
    if (sale.status !== "en_attente_paiement") {
      throw new Error(`Réservation « ${sale.status} » : règlement impossible`)
    }
    if (sale.priceLockedUntil && sale.priceLockedUntil < Date.now()) {
      throw new Error(
        "Le délai de règlement est dépassé : les places ont été libérées",
      )
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect()
    if (tickets.length === 0) throw new Error("Réservation sans titre")

    const trip = await ctx.db.get(tickets[0]!.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    // Le blocage devient une vente ferme : masques et compteurs basculent.
    for (const ticket of tickets) {
      const mask = segmentMask(
        { fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex },
        trip.segmentCount,
      )
      if (ticket.seatId) {
        const occupancy = await ctx.db
          .query("seatOccupancy")
          .withIndex("by_trip_seat", (q) =>
            q.eq("tripId", ticket.tripId).eq("seatId", ticket.seatId!),
          )
          .unique()
        if (occupancy) {
          await ctx.db.patch(occupancy._id, {
            heldMask: release(occupancy.heldMask, mask),
            soldMask: occupancy.soldMask | mask,
          })
        }
      }
      await ctx.db.patch(ticket._id, { status: "valide" })

      const counters = (
        await ctx.db
          .query("segmentCounters")
          .withIndex("by_trip_class", (q) =>
            q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass),
          )
          .collect()
      ).filter(
        (c) =>
          c.segmentIndex >= ticket.fromStopIndex &&
          c.segmentIndex < ticket.toStopIndex,
      )
      for (const counter of counters) {
        await ctx.db.patch(counter._id, {
          held: Math.max(0, counter.held - 1),
          sold: counter.sold + 1,
        })
      }
    }

    const day = await currentAccountingDay(ctx)
    await ctx.db.patch(sale._id, {
      status: "confirmee",
      accountingDayId: day._id,
      amounts: { ...sale.amounts, received: sale.amounts.ttc },
      priceLockedUntil: undefined,
    })
    await ctx.db.patch(day._id, {
      totalTtc: day.totalTtc + sale.amounts.ttc,
      totalReceived: day.totalReceived + sale.amounts.ttc,
    })

    const paymentId = await ctx.db.insert("payments", {
      saleId: sale._id,
      method: args.method,
      status: "confirme",
      amountXaf: sale.amounts.ttc,
      payerPhone: args.payerPhone ?? sale.contactPhone,
      settledAt: Date.now(),
      provider: "simule",
    })

    await audit(ctx, {
      actorId: sale.customerId,
      action: "reservation.confirmer",
      entityTable: "sales",
      entityId: sale._id,
      after: {
        reference: sale.number,
        method: args.method,
        ttc: sale.amounts.ttc,
        paymentId,
      },
    })

    return {
      reference: sale.number,
      status: "confirmee" as const,
      tickets: tickets.length,
      amountTtc: sale.amounts.ttc,
      paymentId,
    }
  },
})

/* ──────────────────────────── Consultation ─────────────────────────────── */

/** Réservation et ses titres, retrouvés par référence. */
export const getByReference = query({
  args: { reference: v.string(), contactPhone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const sale = await ctx.db
      .query("sales")
      .withIndex("by_number", (q) => q.eq("number", args.reference))
      .unique()
    if (!sale) return null

    // Sans compte, la référence seule ne suffit pas : le téléphone la double.
    const user = await getUser(ctx)
    const isOwner = user && sale.customerId === user._id
    if (!isOwner && sale.contactPhone !== args.contactPhone) {
      throw new Error(
        "Référence et contact téléphonique ne correspondent pas",
      )
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect()
    const trip = tickets[0] ? await ctx.db.get(tickets[0].tripId) : null

    return { sale, tickets, trip }
  },
})

/** Réservations du voyageur connecté. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect()

    return await Promise.all(
      sales
        .sort((a, b) => b.soldAt - a.soldAt)
        .map(async (sale) => {
          const tickets = await ctx.db
            .query("tickets")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .collect()
          const trip = tickets[0] ? await ctx.db.get(tickets[0].tripId) : null
          return { sale, tickets, trip }
        }),
    )
  },
})

/** Titres valides du voyageur, pour le portefeuille mobile. */
export const myTickets = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect()

    const result = []
    for (const sale of sales.filter((s) => s.status === "confirmee")) {
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect()
      for (const ticket of tickets.filter((t) => t.status === "valide")) {
        const trip = await ctx.db.get(ticket.tripId)
        const [origin, destination] = await Promise.all([
          ctx.db.get(ticket.originStationId),
          ctx.db.get(ticket.destinationStationId),
        ])
        result.push({ ticket, trip, origin, destination, reference: sale.number })
      }
    }
    return result.sort(
      (a, b) => (a.trip?.departureAt ?? 0) - (b.trip?.departureAt ?? 0),
    )
  },
})

/* ─────────────────────── Annulation par le voyageur ────────────────────── */

/**
 * Annule une réservation non réglée.
 * Les places retournent immédiatement à la vente.
 */
export const cancelHold = mutation({
  args: { reference: v.string(), contactPhone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const sale = await ctx.db
      .query("sales")
      .withIndex("by_number", (q) => q.eq("number", args.reference))
      .unique()
    if (!sale) throw new Error("Réservation introuvable")
    if (sale.status !== "en_attente_paiement") {
      throw new Error(
        `Réservation « ${sale.status} » : utilisez l'annulation au guichet`,
      )
    }

    const user = await getUser(ctx)
    const isOwner = user && sale.customerId === user._id
    if (!isOwner && sale.contactPhone !== args.contactPhone) {
      throw new Error("Référence et contact téléphonique ne correspondent pas")
    }

    await releaseHold(ctx, sale, "annulee")
    await audit(ctx, {
      actorId: sale.customerId,
      action: "reservation.annuler",
      entityTable: "sales",
      entityId: sale._id,
      after: { reference: sale.number },
    })
    return { reference: sale.number, status: "annulee" as const }
  },
})

/* ────────────────────── Expiration automatique ─────────────────────────── */

/** Libère les places d'une réservation et clôt la vente. */
async function releaseHold(
  ctx: Parameters<typeof currentAccountingDay>[0],
  sale: Doc<"sales">,
  finalStatus: "expiree" | "annulee",
): Promise<number> {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()

  for (const ticket of tickets) {
    const trip = await ctx.db.get(ticket.tripId)
    if (!trip) continue
    const mask = segmentMask(
      { fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex },
      trip.segmentCount,
    )
    if (ticket.seatId) {
      const occupancy = await ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_seat", (q) =>
          q.eq("tripId", ticket.tripId).eq("seatId", ticket.seatId!),
        )
        .unique()
      if (occupancy) {
        await ctx.db.patch(occupancy._id, {
          heldMask: release(occupancy.heldMask, mask),
        })
      }
    }
    await ctx.db.patch(ticket._id, {
      status: finalStatus === "annulee" ? "annule" : "expire",
    })

    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass),
        )
        .collect()
    ).filter(
      (c) =>
        c.segmentIndex >= ticket.fromStopIndex &&
        c.segmentIndex < ticket.toStopIndex,
    )
    for (const counter of counters) {
      const held = Math.max(0, counter.held - 1)
      await ctx.db.patch(counter._id, {
        held,
        available: counter.capacity - counter.sold - held - counter.reserved,
      })
    }
  }

  await ctx.db.patch(sale._id, {
    status: finalStatus,
    cancelledAt: Date.now(),
    priceLockedUntil: undefined,
  })
  return tickets.length
}

/**
 * Libère les réservations dont le délai de règlement est écoulé.
 * Exécutée par un cron toutes les cinq minutes.
 */
export const expireStaleHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const pending = await ctx.db
      .query("sales")
      .withIndex("by_status_hold", (q) =>
        q.eq("status", "en_attente_paiement").lt("priceLockedUntil", now),
      )
      .collect()

    let released = 0
    let tickets = 0
    for (const sale of pending) {
      tickets += await releaseHold(ctx, sale, "expiree")
      released += 1
    }
    return { released, tickets }
  },
})
