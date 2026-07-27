import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import {
  accrueToAccountingDay,
  activeFareSchedule,
  nextSequence,
  requireSellingContext,
} from "../lib/saleContext"
import {
  computeBaggageFare,
  computeParcelFare,
  computeTonnageFare,
  resolveBaggageTerms,
  type AncillaryFareRow,
} from "../model/ancillary"
import { buildAmounts, formatNumber, sequenceKey } from "../model/sales"
import { distanceBetween } from "../model/network"

/**
 * Produits voyageurs hors billet : bagages, colis express, transport auto
 * accompagné et transport funéraire (CDC §7.1.2 à §7.1.5).
 *
 * Tous partagent l'enveloppe de vente commune — même point de vente, même
 * caisse, même journée comptable, même numérotation — et ne diffèrent que
 * par leur identifiant physique et leur barème.
 */

/** Distance commerciale entre deux gares du référentiel. */
async function distanceBetweenStations(
  ctx: MutationCtx | QueryCtx,
  originId: Id<"stations">,
  destinationId: Id<"stations">
): Promise<number> {
  const [origin, destination] = await Promise.all([
    ctx.db.get(originId),
    ctx.db.get(destinationId),
  ])
  if (!origin) throw new Error("Gare de départ introuvable")
  if (!destination) throw new Error("Gare d'arrivée introuvable")
  return distanceBetween(origin.kilometerPoint, destination.kilometerPoint)
}

/** Lignes de barème annexe, au format attendu par la logique pure. */
function toGrid(rows: readonly Doc<"ancillaryFares">[]): AncillaryFareRow[] {
  return rows.map((r) => ({
    product: r.product as AncillaryFareRow["product"],
    zone: r.zone,
    weightTier: r.weightTier,
    amountHt: r.amountHt,
    franchiseKg: r.franchiseKg,
    label: r.label,
    isProvisional: r.isProvisional,
  }))
}

/** Recherche sécurisée d'un billet pour les produits qui doivent y être liés. */
interface TicketLookupData {
  ticket: {
    _id: Id<"tickets">
    number: string
    passenger: { firstName: string; lastName: string }
    status: Doc<"tickets">["status"]
  }
  trip: { trainNumber: string } | null
  origin: { code: string; kilometerPoint: number } | null
  destination: { code: string; kilometerPoint: number } | null
}

export const lookupTicket = query({
  args: { number: v.string() },
  handler: async (ctx, args): Promise<TicketLookupData | null> => {
    await requirePermission(ctx, "ventes", "consulter")
    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_number", (q) => q.eq("number", args.number.trim()))
      .unique()
    if (!ticket) return null
    const [trip, origin, destination] = await Promise.all([
      ctx.db.get(ticket.tripId),
      ctx.db.get(ticket.originStationId),
      ctx.db.get(ticket.destinationStationId),
    ])
    return {
      ticket: {
        _id: ticket._id,
        number: ticket.number,
        passenger: {
          firstName: ticket.passenger.firstName,
          lastName: ticket.passenger.lastName,
        },
        status: ticket.status,
      },
      trip: trip ? { trainNumber: trip.trainNumber } : null,
      origin: origin
        ? { code: origin.code, kilometerPoint: origin.kilometerPoint }
        : null,
      destination: destination
        ? {
            code: destination.code,
            kilometerPoint: destination.kilometerPoint,
          }
        : null,
    }
  },
})

/* ────────────────────────────── Bagages ────────────────────────────────── */

export const quoteBaggage = query({
  args: {
    ticketId: v.id("tickets"),
    weightKg: v.number(),
    franchiseKg: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Billet voyageur introuvable")
    const distanceKm = await distanceBetweenStations(
      ctx,
      ticket.originStationId,
      ticket.destinationStationId
    )
    const { schedule, ancillary } = await activeFareSchedule(ctx)
    const terms = resolveBaggageTerms(toGrid(ancillary), distanceKm)
    const breakdown = computeBaggageFare({
      distanceKm,
      weightKg: args.weightKg,
      franchiseKg: args.franchiseKg ?? terms.franchiseKg,
      excessRatePerKgHt: terms.excessRatePerKgHt,
    })
    const totalTtc = round0(
      breakdown.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    return { distanceKm, breakdown, totalTtc }
  },
})

/**
 * Enregistre un bagage rattaché à un billet voyageur.
 *
 * Le rattachement est obligatoire (CDC §7.1.2 : « ensemble des affaires
 * rattaché à un billet voyageur ») : gares, train et distance en sont
 * hérités, jamais ressaisis.
 */
export const sellBaggage = mutation({
  args: {
    ticketId: v.id("tickets"),
    weightKg: v.number(),
    senderName: v.string(),
    recipientName: v.optional(v.string()),
    fareCode: v.optional(v.string()),
    franchiseKg: v.optional(v.number()),
    excessRatePerKgHt: v.optional(v.number()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const selling = await requireSellingContext(ctx, actor)

    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Billet voyageur introuvable")
    if (ticket.status !== "valide") {
      throw new Error(
        `Billet « ${ticket.status} » : enregistrement de bagage impossible`
      )
    }

    const distanceKm = await distanceBetweenStations(
      ctx,
      ticket.originStationId,
      ticket.destinationStationId
    )

    const { schedule, ancillary } = await activeFareSchedule(ctx)

    // Franchise et prix de l'excédent viennent du barème : le guichet n'a
    // pas à les connaître. Les arguments ne servent qu'à un dépassement
    // exceptionnel, tracé dans l'audit.
    const terms = resolveBaggageTerms(toGrid(ancillary), distanceKm)

    // Lève au-delà de 30 kg, en orientant vers le régime colis express.
    const fare = computeBaggageFare({
      distanceKm,
      weightKg: args.weightKg,
      franchiseKg: args.franchiseKg ?? terms.franchiseKg,
      excessRatePerKgHt: args.excessRatePerKgHt ?? terms.excessRatePerKgHt,
    })
    const ttc = round0(
      fare.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    const amounts = buildAmounts(ttc, schedule.vatPct, schedule.cssPct, ttc)

    const code = selling.pointOfSale.code
    const saleSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "vente")
    )
    const tagSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "bagage")
    )

    const saleId = await ctx.db.insert("sales", {
      number: formatNumber("vente", code, selling.serviceDate, saleSeq),
      kind: "vente",
      product: "bagage",
      channel: "guichet",
      status: "confirmee",
      pointOfSaleId: selling.pointOfSale._id,
      sellerId: actor._id,
      deviceId: args.deviceId,
      amounts,
      accountingDayId: selling.accountingDay._id,
      cashSessionId: selling.session._id,
      soldAt: Date.now(),
    })

    const tagNumber = formatNumber("bagage", code, selling.serviceDate, tagSeq)
    const baggageId = await ctx.db.insert("baggages", {
      saleId,
      tagNumber,
      ticketId: args.ticketId,
      tripId: ticket.tripId,
      originStationId: ticket.originStationId,
      destinationStationId: ticket.destinationStationId,
      distanceKm,
      weightKg: args.weightKg,
      senderName: args.senderName,
      recipientName: args.recipientName,
      fareCode: args.fareCode,
      amounts,
    })

    await accrueToAccountingDay(
      ctx,
      selling.accountingDay,
      amounts.ttc,
      amounts.received
    )
    await audit(ctx, {
      actorId: actor._id,
      action: "vente.bagage",
      entityTable: "baggages",
      entityId: baggageId,
      deviceId: args.deviceId,
      after: { tagNumber, weightKg: args.weightKg, ttc: amounts.ttc },
    })

    return {
      saleId,
      baggageId,
      tagNumber,
      distanceKm,
      breakdown: fare,
      amounts,
    }
  },
})

/* ─────────────────────────── Colis express ─────────────────────────────── */

export const quoteParcel = query({
  args: {
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    items: v.array(v.object({ weightKg: v.number() })),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    const distanceKm = await distanceBetweenStations(
      ctx,
      args.originStationId,
      args.destinationStationId
    )
    const { schedule, ancillary } = await activeFareSchedule(ctx)
    const breakdown = computeParcelFare(
      args.items,
      distanceKm,
      toGrid(ancillary)
    )
    const totalTtc = round0(
      breakdown.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    return {
      distanceKm,
      zone: breakdown.items[0]!.zone,
      breakdown,
      totalTtc,
    }
  },
})

/**
 * Enregistre une expédition de colis express.
 *
 * Prestation autonome, sans billet (CDC §7.1.3). Chaque article porte sa
 * propre vignette, et les coordonnées téléphoniques des deux parties sont
 * obligatoires — elles servent aux notifications de statut.
 */
export const sellParcel = mutation({
  args: {
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    senderName: v.string(),
    senderPhone: v.string(),
    recipientName: v.string(),
    recipientPhone: v.string(),
    items: v.array(v.object({ description: v.string(), weightKg: v.number() })),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const selling = await requireSellingContext(ctx, actor)

    if (args.items.length === 0) {
      throw new Error("Expédition sans article : vente impossible")
    }
    if (!args.senderPhone.trim() || !args.recipientPhone.trim()) {
      throw new Error(
        "Les contacts téléphoniques de l'expéditeur et du destinataire sont " +
          "obligatoires"
      )
    }

    const distanceKm = await distanceBetweenStations(
      ctx,
      args.originStationId,
      args.destinationStationId
    )
    const { schedule, ancillary } = await activeFareSchedule(ctx)

    // Lève explicitement si la grille zones × paliers n'est pas renseignée.
    const fare = computeParcelFare(args.items, distanceKm, toGrid(ancillary))

    const ttc = round0(
      fare.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    const amounts = buildAmounts(ttc, schedule.vatPct, schedule.cssPct, ttc)

    const code = selling.pointOfSale.code
    const saleSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "vente")
    )
    const shipmentSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "colis")
    )

    const saleId = await ctx.db.insert("sales", {
      number: formatNumber("vente", code, selling.serviceDate, saleSeq),
      kind: "vente",
      product: "colis",
      channel: "guichet",
      status: "confirmee",
      pointOfSaleId: selling.pointOfSale._id,
      sellerId: actor._id,
      deviceId: args.deviceId,
      contactPhone: args.senderPhone,
      amounts,
      accountingDayId: selling.accountingDay._id,
      cashSessionId: selling.session._id,
      soldAt: Date.now(),
    })

    const shipmentNumber = formatNumber(
      "colis",
      code,
      selling.serviceDate,
      shipmentSeq
    )
    const parcelId = await ctx.db.insert("parcels", {
      saleId,
      shipmentNumber,
      originStationId: args.originStationId,
      destinationStationId: args.destinationStationId,
      distanceKm,
      zone: fare.items[0]!.zone,
      senderName: args.senderName,
      senderPhone: args.senderPhone,
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      totalWeightKg: fare.totalWeightKg,
      status: "enregistre",
      amounts,
    })

    const stickers: string[] = []
    for (const [index, item] of args.items.entries()) {
      const stickerSeq = await nextSequence(
        ctx,
        sequenceKey(code, selling.serviceDate, "vignette")
      )
      const stickerNumber = formatNumber(
        "vignette",
        code,
        selling.serviceDate,
        stickerSeq
      )
      stickers.push(stickerNumber)
      await ctx.db.insert("parcelItems", {
        parcelId,
        stickerNumber,
        description: item.description,
        weightKg: item.weightKg,
        weightTier: fare.items[index]!.weightTier,
        amountTtc: round0(
          fare.items[index]!.totalHt *
            (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
        ),
      })
    }

    await accrueToAccountingDay(
      ctx,
      selling.accountingDay,
      amounts.ttc,
      amounts.received
    )
    await audit(ctx, {
      actorId: actor._id,
      action: "vente.colis",
      entityTable: "parcels",
      entityId: parcelId,
      deviceId: args.deviceId,
      after: {
        shipmentNumber,
        items: args.items.length,
        totalWeightKg: fare.totalWeightKg,
        ttc: amounts.ttc,
      },
    })

    return {
      saleId,
      parcelId,
      shipmentNumber,
      stickers,
      distanceKm,
      zone: fare.items[0]!.zone,
      amounts,
    }
  },
})

/** Fait progresser le statut d'une expédition, pour le suivi COLIRAIL. */
export const setParcelStatus = mutation({
  args: {
    parcelId: v.id("parcels"),
    status: v.union(
      v.literal("enregistre"),
      v.literal("en_transport"),
      v.literal("arrive"),
      v.literal("retire")
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    const parcel = await ctx.db.get(args.parcelId)
    if (!parcel) throw new Error("Expédition introuvable")

    await ctx.db.patch(args.parcelId, { status: args.status })

    // Le suivi fin sera porté par COLIRAIL : l'événement part par la file
    // d'envoi, prêt à être consommé dès que l'interface sera contractualisée.
    await ctx.db.insert("outboxEvents", {
      type: "colirail_status",
      entityId: args.parcelId,
      payload: JSON.stringify({
        shipmentNumber: parcel.shipmentNumber,
        status: args.status,
        recipientPhone: parcel.recipientPhone,
      }),
      status: "en_attente",
      attempts: 0,
      createdAt: Date.now(),
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "colis.statut",
      entityTable: "parcels",
      entityId: args.parcelId,
      before: { status: parcel.status },
      after: { status: args.status },
    })
  },
})

/* ──────────────── Transport auto accompagné et funéraire ───────────────── */

export const quoteSpecialTransport = query({
  args: {
    product: v.union(v.literal("taa"), v.literal("funeraire")),
    ticketId: v.optional(v.id("tickets")),
    originStationId: v.optional(v.id("stations")),
    destinationStationId: v.optional(v.id("stations")),
    tonnage: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    let originId = args.originStationId
    let destinationId = args.destinationStationId
    if (args.product === "taa") {
      if (!args.ticketId) {
        throw new Error("Le billet voyageur est obligatoire")
      }
      const ticket = await ctx.db.get(args.ticketId)
      if (!ticket) throw new Error("Billet voyageur introuvable")
      originId = ticket.originStationId
      destinationId = ticket.destinationStationId
    }
    if (!originId || !destinationId) {
      throw new Error("Le trajet est obligatoire")
    }
    const distanceKm = await distanceBetweenStations(
      ctx,
      originId,
      destinationId
    )
    const { schedule, ancillary } = await activeFareSchedule(ctx)
    const breakdown = computeTonnageFare({
      product: args.product,
      distanceKm,
      tonnage: args.tonnage,
      grid: toGrid(ancillary),
    })
    const totalTtc = round0(
      breakdown.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    return { distanceKm, breakdown, totalTtc }
  },
})

/**
 * Enregistre un transport auto accompagné.
 * Rattaché à un billet voyageur (CDC §7.1.4 : « un client disposant d'un
 * billet voyageur »).
 */
export const sellVehicleTransport = mutation({
  args: {
    ticketId: v.id("tickets"),
    tonnage: v.number(),
    senderName: v.string(),
    fareCode: v.optional(v.string()),
    validUntil: v.number(),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const selling = await requireSellingContext(ctx, actor)

    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Billet voyageur introuvable")
    if (ticket.status !== "valide") {
      throw new Error(`Billet « ${ticket.status} » : transport impossible`)
    }

    const distanceKm = await distanceBetweenStations(
      ctx,
      ticket.originStationId,
      ticket.destinationStationId
    )
    const { schedule, ancillary } = await activeFareSchedule(ctx)
    const fare = computeTonnageFare({
      product: "taa",
      distanceKm,
      tonnage: args.tonnage,
      grid: toGrid(ancillary),
    })

    const ttc = round0(
      fare.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    const amounts = buildAmounts(ttc, schedule.vatPct, schedule.cssPct, ttc)

    const code = selling.pointOfSale.code
    const saleSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "vente")
    )
    const shipmentSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "taa")
    )

    const saleId = await ctx.db.insert("sales", {
      number: formatNumber("vente", code, selling.serviceDate, saleSeq),
      kind: "vente",
      product: "taa",
      channel: "guichet",
      status: "confirmee",
      pointOfSaleId: selling.pointOfSale._id,
      sellerId: actor._id,
      deviceId: args.deviceId,
      amounts,
      accountingDayId: selling.accountingDay._id,
      cashSessionId: selling.session._id,
      soldAt: Date.now(),
    })

    const shipmentNumber = formatNumber(
      "taa",
      code,
      selling.serviceDate,
      shipmentSeq
    )
    const id = await ctx.db.insert("vehicleTransports", {
      saleId,
      shipmentNumber,
      ticketId: args.ticketId,
      tripId: ticket.tripId,
      originStationId: ticket.originStationId,
      destinationStationId: ticket.destinationStationId,
      distanceKm,
      tonnage: args.tonnage,
      senderName: args.senderName,
      fareCode: args.fareCode,
      validFrom: Date.now(),
      validUntil: args.validUntil,
      amounts,
    })

    await accrueToAccountingDay(
      ctx,
      selling.accountingDay,
      amounts.ttc,
      amounts.received
    )
    await audit(ctx, {
      actorId: actor._id,
      action: "vente.taa",
      entityTable: "vehicleTransports",
      entityId: id,
      deviceId: args.deviceId,
      after: { shipmentNumber, tonnage: args.tonnage, ttc: amounts.ttc },
    })

    return { saleId, vehicleTransportId: id, shipmentNumber, amounts }
  },
})

/**
 * Enregistre un transport funéraire.
 * Prestation autonome, sans billet (CDC §7.1.5).
 */
export const sellFuneralTransport = mutation({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    tonnage: v.number(),
    senderName: v.string(),
    fareCode: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const selling = await requireSellingContext(ctx, actor)

    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")
    if (trip.status === "annule" || trip.status === "termine") {
      throw new Error(`Desserte « ${trip.status} » : transport impossible`)
    }

    const distanceKm = await distanceBetweenStations(
      ctx,
      args.originStationId,
      args.destinationStationId
    )
    const { schedule, ancillary } = await activeFareSchedule(ctx)
    const fare = computeTonnageFare({
      product: "funeraire",
      distanceKm,
      tonnage: args.tonnage,
      grid: toGrid(ancillary),
    })

    const ttc = round0(
      fare.totalHt * (1 + schedule.vatPct / 100 + schedule.cssPct / 100)
    )
    const amounts = buildAmounts(ttc, schedule.vatPct, schedule.cssPct, ttc)

    const code = selling.pointOfSale.code
    const saleSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "vente")
    )
    const shipmentSeq = await nextSequence(
      ctx,
      sequenceKey(code, selling.serviceDate, "funeraire")
    )

    const saleId = await ctx.db.insert("sales", {
      number: formatNumber("vente", code, selling.serviceDate, saleSeq),
      kind: "vente",
      product: "funeraire",
      channel: "guichet",
      status: "confirmee",
      pointOfSaleId: selling.pointOfSale._id,
      sellerId: actor._id,
      deviceId: args.deviceId,
      amounts,
      accountingDayId: selling.accountingDay._id,
      cashSessionId: selling.session._id,
      soldAt: Date.now(),
    })

    const shipmentNumber = formatNumber(
      "funeraire",
      code,
      selling.serviceDate,
      shipmentSeq
    )
    const id = await ctx.db.insert("funeralTransports", {
      saleId,
      shipmentNumber,
      tripId: args.tripId,
      originStationId: args.originStationId,
      destinationStationId: args.destinationStationId,
      distanceKm,
      tonnage: args.tonnage,
      senderName: args.senderName,
      fareCode: args.fareCode,
      amounts,
    })

    await accrueToAccountingDay(
      ctx,
      selling.accountingDay,
      amounts.ttc,
      amounts.received
    )
    await audit(ctx, {
      actorId: actor._id,
      action: "vente.funeraire",
      entityTable: "funeralTransports",
      entityId: id,
      deviceId: args.deviceId,
      after: { shipmentNumber, tonnage: args.tonnage, ttc: amounts.ttc },
    })

    return { saleId, funeralTransportId: id, shipmentNumber, amounts }
  },
})

/* ────────────────────────────── Consultation ───────────────────────────── */

/** Bagages, colis et transports rattachés à une desserte — manifeste fret. */
export const listByTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    const [baggages, vehicles, funerals] = await Promise.all([
      ctx.db
        .query("baggages")
        .filter((q) => q.eq(q.field("tripId"), args.tripId))
        .collect(),
      ctx.db
        .query("vehicleTransports")
        .filter((q) => q.eq(q.field("tripId"), args.tripId))
        .collect(),
      ctx.db
        .query("funeralTransports")
        .filter((q) => q.eq(q.field("tripId"), args.tripId))
        .collect(),
    ])
    return {
      baggages,
      vehicleTransports: vehicles,
      funeralTransports: funerals,
    }
  },
})

/** Suivi d'une expédition par son numéro. */
export const trackParcel = query({
  args: { shipmentNumber: v.string() },
  handler: async (ctx, args) => {
    const parcel = await ctx.db
      .query("parcels")
      .withIndex("by_shipment", (q) =>
        q.eq("shipmentNumber", args.shipmentNumber)
      )
      .unique()
    if (!parcel) return null
    const items = await ctx.db
      .query("parcelItems")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
      .collect()
    return { parcel, items }
  },
})

/** Arrondi au franc CFA : il n'existe pas de subdivision en circulation. */
function round0(value: number): number {
  return Math.round(value)
}
