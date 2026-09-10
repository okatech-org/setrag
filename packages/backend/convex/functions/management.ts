import { action, mutation, query } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import { pointOfSaleType, serviceClass, trainType } from "../schema"
import { applyBlock, occupiedSegments, segmentMask } from "../model/inventory"
import { v } from "convex/values"

const SETTINGS_KEY = "commercial"

export const listFareSchedules = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "tarifs", "consulter")
    const schedules = await ctx.db.query("fareSchedules").collect()
    return await Promise.all(
      schedules
        .sort((left, right) => right.validFrom - left.validFrom)
        .map(async (schedule) => ({
          schedule,
          bases: await ctx.db
            .query("fareBases")
            .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
            .collect(),
        }))
    )
  },
})

export const createFareSchedule = mutation({
  args: {
    label: v.string(),
    validFrom: v.number(),
    validUntil: v.number(),
    vatPct: v.number(),
    cssPct: v.number(),
    trainType,
    serviceClass,
    shortDistanceRate: v.number(),
    longDistanceRate: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "creer")
    if (!args.label.trim()) throw new Error("Le libellé est obligatoire.")
    if (args.validUntil <= args.validFrom) {
      throw new Error("La fin de validité doit suivre le début.")
    }
    if (
      args.vatPct < 0 ||
      args.cssPct < 0 ||
      args.shortDistanceRate <= 0 ||
      args.longDistanceRate <= 0
    ) {
      throw new Error("Les taux tarifaires doivent être positifs.")
    }

    const scheduleId = await ctx.db.insert("fareSchedules", {
      label: args.label.trim(),
      status: "brouillon",
      validFrom: args.validFrom,
      validUntil: args.validUntil,
      roundingBasis: "TTC",
      vatPct: args.vatPct,
      cssPct: args.cssPct,
      createdBy: actor._id,
    })
    await ctx.db.insert("fareBases", {
      scheduleId,
      trainType: args.trainType,
      serviceClass: args.serviceClass,
      shortDistanceRate: args.shortDistanceRate,
      longDistanceRate: args.longDistanceRate,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.creer",
      entityTable: "fareSchedules",
      entityId: scheduleId,
      after: args,
    })
    return scheduleId
  },
})

export const listPricingRules = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "yield", "consulter")
    return (await ctx.db.query("pricingRules").collect()).sort(
      (left, right) => left.priority - right.priority
    )
  },
})

export const createPricingRule = mutation({
  args: {
    type: v.union(
      v.literal("remplissage"),
      v.literal("anticipation"),
      v.literal("periode"),
      v.literal("canal"),
      v.literal("promotion")
    ),
    threshold: v.optional(v.number()),
    modifierPct: v.number(),
    priority: v.number(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "yield", "creer")
    if (!args.code.trim()) throw new Error("Le code de règle est obligatoire.")
    if (args.modifierPct < -80 || args.modifierPct > 100) {
      throw new Error(
        "La modulation doit rester comprise entre −80 % et 100 %."
      )
    }
    const duplicate = (await ctx.db.query("pricingRules").collect()).find(
      (rule) => rule.code === args.code.trim()
    )
    if (duplicate) throw new Error(`La règle ${args.code} existe déjà.`)

    const id = await ctx.db.insert("pricingRules", {
      scope: "reseau",
      type: args.type,
      threshold: args.threshold,
      modifierPct: args.modifierPct,
      priority: Math.max(1, Math.trunc(args.priority)),
      floorXaf: 2_000,
      capXaf: 150_000,
      code: args.code.trim(),
      isActive: true,
      createdBy: actor._id,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "yield.regle.creer",
      entityTable: "pricingRules",
      entityId: id,
      after: args,
    })
    return id
  },
})

export const listPointsOfSale = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const rows = await ctx.db.query("pointsOfSale").collect()
    return await Promise.all(
      rows
        .sort((left, right) => left.code.localeCompare(right.code))
        .map(async (pointOfSale) => ({
          pointOfSale,
          station: pointOfSale.stationId
            ? await ctx.db.get(pointOfSale.stationId)
            : null,
        }))
    )
  },
})

export const getPointOfSale = query({
  args: { pointOfSaleId: v.id("pointsOfSale") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const pointOfSale = await ctx.db.get(args.pointOfSaleId)
    if (!pointOfSale) throw new Error("Point de vente introuvable.")

    const [station, users, cashSessions, agencyQuotas, sales] =
      await Promise.all([
        pointOfSale.stationId ? ctx.db.get(pointOfSale.stationId) : null,
        ctx.db
          .query("users")
          .withIndex("by_pointOfSale", (q) =>
            q.eq("pointOfSaleId", pointOfSale._id)
          )
          .collect(),
        ctx.db
          .query("cashSessions")
          .withIndex("by_pos_day", (q) =>
            q.eq("pointOfSaleId", pointOfSale._id)
          )
          .collect(),
        ctx.db
          .query("agencyQuotas")
          .withIndex("by_pos_trip", (q) =>
            q.eq("pointOfSaleId", pointOfSale._id)
          )
          .collect(),
        ctx.db
          .query("sales")
          .withIndex("by_pos_day", (q) =>
            q.eq("pointOfSaleId", pointOfSale._id)
          )
          .collect(),
      ])

    return {
      pointOfSale,
      station,
      attachedUsers: users
        .sort((left, right) =>
          `${left.lastName ?? ""}${left.firstName ?? ""}`.localeCompare(
            `${right.lastName ?? ""}${right.firstName ?? ""}`,
            "fr"
          )
        )
        .map((user) => ({
          id: user._id,
          displayName:
            `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
            user.email ||
            user.matricule ||
            "Agent sans nom",
          matricule: user.matricule,
          role: user.role,
          isActive: user.isActive,
        })),
      dependencies: {
        attachedUsers: users.length,
        activeUsers: users.filter((user) => user.isActive).length,
        cashSessions: cashSessions.length,
        openCashSessions: cashSessions.filter(
          (session) => session.status === "ouverte"
        ).length,
        sales: sales.length,
        activeAgencyQuotas: agencyQuotas.filter((quota) => quota.isActive)
          .length,
      },
    }
  },
})

export const listTrainCompositions = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const trains = await ctx.db.query("trains").collect()
    return await Promise.all(
      trains.map(async (train) => {
        const coaches = await ctx.db
          .query("coaches")
          .withIndex("by_train", (q) => q.eq("trainId", train._id))
          .collect()
        return {
          train,
          coachCount: coaches.length,
          capacity: coaches.reduce(
            (sum, coach) => sum + coach.seatCount + coach.standingCapacity,
            0
          ),
        }
      })
    )
  },
})

export const listSeatBlocks = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "places", "consulter")
    const blocks = await ctx.db.query("seatBlocks").collect()
    return await Promise.all(
      blocks.map(async (block) => {
        const [trip, seat] = await Promise.all([
          ctx.db.get(block.tripId),
          ctx.db.get(block.seatId),
        ])
        const coach = seat ? await ctx.db.get(seat.coachId) : null
        return { block, trip, seat, coach }
      })
    )
  },
})

/** Fiche d'un blocage avec son inventaire et sa traçabilité. */
export const getSeatBlock = query({
  args: { blockId: v.id("seatBlocks") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "places", "consulter")
    const block = await ctx.db.get(args.blockId)
    if (!block) return null

    const [trip, seat, creator, releaser, occupancy] = await Promise.all([
      ctx.db.get(block.tripId),
      ctx.db.get(block.seatId),
      ctx.db.get(block.createdBy),
      block.releasedBy ? ctx.db.get(block.releasedBy) : null,
      ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_seat", (q) =>
          q.eq("tripId", block.tripId).eq("seatId", block.seatId)
        )
        .unique(),
    ])
    const [coach, stops] = await Promise.all([
      seat ? ctx.db.get(seat.coachId) : null,
      ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", block.tripId))
        .collect(),
    ])
    const stations = await Promise.all(
      stops
        .sort((left, right) => left.sequence - right.sequence)
        .map(async (stop) => ({
          stop,
          station: await ctx.db.get(stop.stationId),
        }))
    )
    return {
      block,
      trip,
      seat,
      coach,
      creator,
      releaser,
      occupancy,
      stops: stations,
      blockedSegments: occupiedSegments(block.mask, trip?.segmentCount ?? 0),
    }
  },
})

/**
 * Données réelles du plan utilisées pour créer un blocage.
 * Sans desserte, la query retourne seulement les dessertes ouvertes.
 */
export const seatBlockOptions = query({
  args: { tripId: v.optional(v.id("trips")) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "places", "consulter")
    const trips = (await ctx.db.query("trips").collect())
      .filter((trip) => trip.isOpenForSale)
      .sort((left, right) => left.departureAt - right.departureAt)
      .slice(0, 100)
    if (!args.tripId) return { trips, selected: null }

    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")
    const [occupancies, stops] = await Promise.all([
      ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId!))
        .collect(),
      ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId!))
        .collect(),
    ])
    const seats = await Promise.all(
      occupancies.map(async (occupancy) => {
        const seat = await ctx.db.get(occupancy.seatId)
        const coach = seat ? await ctx.db.get(seat.coachId) : null
        return { occupancy, seat, coach }
      })
    )
    const enrichedStops = await Promise.all(
      stops
        .sort((left, right) => left.sequence - right.sequence)
        .map(async (stop) => ({
          stop,
          station: await ctx.db.get(stop.stationId),
        }))
    )
    return {
      trips,
      selected: { trip, seats, stops: enrichedStops },
    }
  },
})

/** Retire une place de la vente sur une portion précise de desserte. */
export const createSeatBlock = mutation({
  args: {
    tripId: v.id("trips"),
    seatId: v.id("seats"),
    fromStopIndex: v.number(),
    toStopIndex: v.number(),
    reason: v.union(
      v.literal("maintenance"),
      v.literal("exploitation"),
      v.literal("protocole"),
      v.literal("autre")
    ),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "places", "creer")
    const [trip, seat] = await Promise.all([
      ctx.db.get(args.tripId),
      ctx.db.get(args.seatId),
    ])
    if (!trip) throw new Error("Desserte introuvable")
    if (!seat) throw new Error("Place introuvable")
    if (!trip.isOpenForSale) {
      throw new Error("Cette desserte n'est pas ouverte à la vente")
    }
    const comment = args.comment.trim()
    if (!comment) throw new Error("Le motif détaillé est obligatoire")
    const mask = segmentMask(
      { fromIndex: args.fromStopIndex, toIndex: args.toStopIndex },
      trip.segmentCount
    )
    const occupancy = await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_seat", (q) =>
        q.eq("tripId", args.tripId).eq("seatId", args.seatId)
      )
      .unique()
    if (!occupancy) throw new Error("Inventaire de la place introuvable")
    if ((occupancy.soldMask & mask) !== 0) {
      throw new Error("Cette place est déjà vendue sur une partie du trajet")
    }
    if ((occupancy.heldMask & mask) !== 0) {
      throw new Error("Cette place fait déjà l'objet d'une réservation")
    }
    if ((occupancy.blockedMask & mask) !== 0) {
      throw new Error("Cette place est déjà bloquée sur une partie du trajet")
    }

    const counters = await Promise.all(
      occupiedSegments(mask, trip.segmentCount).map(async (segmentIndex) => {
        const counter = await ctx.db
          .query("segmentCounters")
          .withIndex("by_trip_class_segment", (q) =>
            q
              .eq("tripId", args.tripId)
              .eq("serviceClass", occupancy.serviceClass)
              .eq("segmentIndex", segmentIndex)
          )
          .unique()
        if (!counter) {
          throw new Error(
            `Compteur d'inventaire absent au segment ${segmentIndex}`
          )
        }
        if (counter.available <= 0) {
          throw new Error(
            `Aucune place disponible à retirer au segment ${segmentIndex}`
          )
        }
        return counter
      })
    )

    await ctx.db.patch(occupancy._id, {
      blockedMask: applyBlock(occupancy.blockedMask, mask),
    })
    for (const counter of counters) {
      await ctx.db.patch(counter._id, {
        reserved: counter.reserved + 1,
        available: counter.available - 1,
      })
    }
    const blockId = await ctx.db.insert("seatBlocks", {
      tripId: args.tripId,
      seatId: args.seatId,
      mask,
      reason: args.reason,
      comment,
      createdBy: actor._id,
      isActive: true,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "place.bloquer",
      entityTable: "seatBlocks",
      entityId: blockId,
      after: {
        tripId: args.tripId,
        seatId: args.seatId,
        fromStopIndex: args.fromStopIndex,
        toStopIndex: args.toStopIndex,
        reason: args.reason,
        comment,
      },
    })
    return blockId
  },
})

/** Lève un blocage sans toucher aux ventes, holds ni quotas d'agence. */
export const releaseSeatBlock = mutation({
  args: { blockId: v.id("seatBlocks"), note: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "places", "modifier")
    const block = await ctx.db.get(args.blockId)
    if (!block) throw new Error("Blocage introuvable")
    if (!block.isActive) throw new Error("Ce blocage est déjà levé")
    const note = args.note.trim()
    if (!note) throw new Error("Une note de libération est obligatoire")
    const trip = await ctx.db.get(block.tripId)
    if (!trip) throw new Error("Desserte introuvable")
    const occupancy = await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_seat", (q) =>
        q.eq("tripId", block.tripId).eq("seatId", block.seatId)
      )
      .unique()
    if (!occupancy) throw new Error("Inventaire de la place introuvable")

    const otherBlocks = (
      await ctx.db
        .query("seatBlocks")
        .withIndex("by_trip_active", (q) =>
          q.eq("tripId", block.tripId).eq("isActive", true)
        )
        .collect()
    ).filter(
      (candidate) =>
        candidate._id !== block._id && candidate.seatId === block.seatId
    )
    const remainingMask = otherBlocks.reduce(
      (mask, candidate) => mask | candidate.mask,
      0
    )
    const releasedMask = occupancy.blockedMask & block.mask & ~remainingMask
    const nextBlockedMask =
      (occupancy.blockedMask & ~releasedMask) | remainingMask

    const counters = await Promise.all(
      occupiedSegments(releasedMask, trip.segmentCount).map(
        async (segmentIndex) => {
          const counter = await ctx.db
            .query("segmentCounters")
            .withIndex("by_trip_class_segment", (q) =>
              q
                .eq("tripId", block.tripId)
                .eq("serviceClass", occupancy.serviceClass)
                .eq("segmentIndex", segmentIndex)
            )
            .unique()
          if (!counter) {
            throw new Error(
              `Compteur d'inventaire absent au segment ${segmentIndex}`
            )
          }
          return counter
        }
      )
    )

    await ctx.db.patch(occupancy._id, { blockedMask: nextBlockedMask })
    for (const counter of counters) {
      const reserved = Math.max(0, counter.reserved - 1)
      await ctx.db.patch(counter._id, {
        reserved,
        available: Math.max(
          0,
          counter.capacity - counter.sold - counter.held - reserved
        ),
      })
    }
    await ctx.db.patch(block._id, {
      isActive: false,
      releasedBy: actor._id,
      releasedAt: Date.now(),
      comment: `${block.comment ?? ""}\nLibération : ${note}`.trim(),
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "place.liberer",
      entityTable: "seatBlocks",
      entityId: block._id,
      before: { blockedMask: occupancy.blockedMask, isActive: true },
      after: { blockedMask: nextBlockedMask, isActive: false, note },
    })
  },
})

export const listTravelers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "donnees_voyageurs", "consulter")
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
    const tickets = await ctx.db.query("tickets").order("desc").take(limit)
    return await Promise.all(
      tickets.map(async (ticket) => {
        const [trip, origin, destination] = await Promise.all([
          ctx.db.get(ticket.tripId),
          ctx.db.get(ticket.originStationId),
          ctx.db.get(ticket.destinationStationId),
        ])
        return { ticket, trip, origin, destination }
      })
    )
  },
})

/** Fiche nominative d'un titre, strictement en lecture transactionnelle. */
export const getTravelerTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "donnees_voyageurs", "consulter")
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) return null
    const [sale, trip, origin, destination, seat, scans, baggages] =
      await Promise.all([
        ctx.db.get(ticket.saleId),
        ctx.db.get(ticket.tripId),
        ctx.db.get(ticket.originStationId),
        ctx.db.get(ticket.destinationStationId),
        ticket.seatId ? ctx.db.get(ticket.seatId) : null,
        ctx.db
          .query("ticketScans")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
          .collect(),
        ctx.db
          .query("baggages")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
          .collect(),
      ])
    const [customer, payments] = await Promise.all([
      sale?.customerId ? ctx.db.get(sale.customerId) : null,
      sale
        ? ctx.db
            .query("payments")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .collect()
        : [],
    ])
    return {
      ticket,
      sale,
      trip,
      origin,
      destination,
      seat,
      customer,
      scans: scans.sort((left, right) => right.scannedAt - left.scannedAt),
      baggages,
      payments,
    }
  },
})

export const createPointOfSale = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    type: pointOfSaleType,
    stationId: v.optional(v.id("stations")),
    passengerCounters: v.number(),
    baggageCounters: v.number(),
    parcelCounters: v.number(),
    royaltyPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "creer")
    const normalized = await validatePointOfSaleInput(ctx, args)
    const existing = await ctx.db
      .query("pointsOfSale")
      .withIndex("by_code", (q) => q.eq("code", normalized.code))
      .unique()
    if (existing) {
      throw new Error(`Le point de vente ${normalized.code} existe déjà.`)
    }

    const id = await ctx.db.insert("pointsOfSale", {
      ...normalized,
      isActive: true,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.point_de_vente.creer",
      entityTable: "pointsOfSale",
      entityId: id,
      after: args,
    })
    return id
  },
})

export const updatePointOfSale = mutation({
  args: {
    pointOfSaleId: v.id("pointsOfSale"),
    code: v.string(),
    name: v.string(),
    type: pointOfSaleType,
    stationId: v.optional(v.id("stations")),
    passengerCounters: v.number(),
    baggageCounters: v.number(),
    parcelCounters: v.number(),
    royaltyPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "modifier")
    const pointOfSale = await ctx.db.get(args.pointOfSaleId)
    if (!pointOfSale) throw new Error("Point de vente introuvable.")

    const normalized = await validatePointOfSaleInput(ctx, args)
    const duplicate = await ctx.db
      .query("pointsOfSale")
      .withIndex("by_code", (q) => q.eq("code", normalized.code))
      .unique()
    if (duplicate && duplicate._id !== pointOfSale._id) {
      throw new Error(`Le point de vente ${normalized.code} existe déjà.`)
    }

    const openSessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_pos_day", (q) => q.eq("pointOfSaleId", pointOfSale._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .collect()
    const totalCounters =
      normalized.counters.passengers +
      normalized.counters.baggage +
      normalized.counters.parcels
    if (totalCounters < openSessions.length) {
      throw new Error(
        `Impossible de réduire à ${totalCounters} guichet(s) : ` +
          `${openSessions.length} caisse(s) sont actuellement ouvertes.`
      )
    }

    await ctx.db.patch(pointOfSale._id, normalized)
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.point_de_vente.modifier",
      entityTable: "pointsOfSale",
      entityId: pointOfSale._id,
      before: pointOfSale,
      after: normalized,
    })
    return pointOfSale._id
  },
})

/**
 * Suspend ou réactive un point de vente sans effacer son historique.
 *
 * Les ventes, journées et agents restent rattachés à l'entité. Une
 * suspension est refusée tant qu'une caisse est ouverte ou qu'un quota
 * d'agence réserve encore des places : ces dépendances doivent être soldées
 * explicitement avant de couper le point de vente.
 */
export const setPointOfSaleStatus = mutation({
  args: {
    pointOfSaleId: v.id("pointsOfSale"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(
      ctx,
      "referentiel",
      args.isActive ? "modifier" : "supprimer"
    )
    const pointOfSale = await ctx.db.get(args.pointOfSaleId)
    if (!pointOfSale) throw new Error("Point de vente introuvable.")
    if (pointOfSale.isActive === args.isActive) return pointOfSale._id

    if (!args.isActive) {
      const [openSessions, activeQuotas] = await Promise.all([
        ctx.db
          .query("cashSessions")
          .withIndex("by_pos_day", (q) =>
            q.eq("pointOfSaleId", pointOfSale._id)
          )
          .filter((q) => q.eq(q.field("status"), "ouverte"))
          .collect(),
        ctx.db
          .query("agencyQuotas")
          .withIndex("by_pos_trip", (q) =>
            q.eq("pointOfSaleId", pointOfSale._id)
          )
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect(),
      ])
      const blockers = [
        openSessions.length > 0
          ? `${openSessions.length} caisse(s) ouverte(s)`
          : null,
        activeQuotas.length > 0
          ? `${activeQuotas.length} quota(s) agence actif(s)`
          : null,
      ].filter((blocker): blocker is string => blocker !== null)
      if (blockers.length > 0) {
        throw new Error(
          `Suspension impossible : ${blockers.join(" et ")}. ` +
            "Clôturez ou désactivez ces éléments avant de réessayer."
        )
      }
    }

    await ctx.db.patch(pointOfSale._id, { isActive: args.isActive })
    await audit(ctx, {
      actorId: actor._id,
      action: args.isActive
        ? "referentiel.point_de_vente.reactiver"
        : "referentiel.point_de_vente.suspendre",
      entityTable: "pointsOfSale",
      entityId: pointOfSale._id,
      before: { isActive: pointOfSale.isActive },
      after: { isActive: args.isActive },
    })
    return pointOfSale._id
  },
})

interface PointOfSaleInput {
  code: string
  name: string
  type: "gare" | "agence_accreditee" | "agence_premium"
  stationId?: Id<"stations">
  passengerCounters: number
  baggageCounters: number
  parcelCounters: number
  royaltyPct?: number
}

async function validatePointOfSaleInput(
  ctx: MutationCtx,
  input: PointOfSaleInput
) {
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  if (!code || !name) {
    throw new Error("Le code et le nom du point de vente sont obligatoires.")
  }
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)) {
    throw new Error("Le code doit contenir 2 à 20 lettres, chiffres ou tirets.")
  }
  if (name.length > 120) {
    throw new Error("Le nom ne peut pas dépasser 120 caractères.")
  }

  const counterValues = [
    input.passengerCounters,
    input.baggageCounters,
    input.parcelCounters,
  ]
  if (
    counterValues.some(
      (value) =>
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 1_000
    )
  ) {
    throw new Error(
      "Chaque nombre de guichets doit être un entier compris entre 0 et 1 000."
    )
  }
  if (
    input.royaltyPct !== undefined &&
    (!Number.isFinite(input.royaltyPct) ||
      input.royaltyPct < 0 ||
      input.royaltyPct > 100)
  ) {
    throw new Error("Le taux de royalties doit être compris entre 0 et 100 %.")
  }
  if (input.stationId && !(await ctx.db.get(input.stationId))) {
    throw new Error("La gare de rattachement est introuvable.")
  }

  return {
    code,
    name,
    type: input.type,
    stationId: input.stationId,
    counters: {
      passengers: input.passengerCounters,
      baggage: input.baggageCounters,
      parcels: input.parcelCounters,
    },
    royaltyPct: input.royaltyPct,
  }
}

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "utilisateurs", "consulter")
    return (await ctx.db.query("users").collect()).sort((left, right) =>
      `${left.lastName ?? ""}${left.firstName ?? ""}`.localeCompare(
        `${right.lastName ?? ""}${right.firstName ?? ""}`,
        "fr"
      )
    )
  },
})

export const directoryStatus = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "utilisateurs", "consulter")
    const missing = [
      !process.env.ERAMET_DIRECTORY_SYNC_URL
        ? "ERAMET_DIRECTORY_SYNC_URL"
        : null,
      !process.env.ERAMET_DIRECTORY_SYNC_TOKEN
        ? "ERAMET_DIRECTORY_SYNC_TOKEN"
        : null,
    ].filter((value): value is string => Boolean(value))
    return { configured: missing.length === 0, missing }
  },
})

/**
 * Point d'entrée réel de synchronisation. L'intégration reste inactive tant
 * que la DSI n'a pas fourni l'URL et le jeton d'annuaire.
 */
export const synchronizeDirectory = action({
  args: {},
  handler: async (ctx): Promise<{ synchronized: boolean; message: string }> => {
    const status: { configured: boolean; missing: string[] } =
      await ctx.runQuery(api.functions.management.directoryStatus, {})
    if (!status.configured) {
      return {
        synchronized: false,
        message: `Synchronisation impossible : ${status.missing.join(", ")} manquante(s). Le contrat de données de l’annuaire ERAMET doit également être fourni par la DSI.`,
      }
    }
    return {
      synchronized: false,
      message:
        "Synchronisation impossible : le contrat de données de l’annuaire ERAMET n’a pas encore été fourni par la DSI.",
    }
  },
})

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "parametrage", "consulter")
    const stored = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique()
    return (
      stored ?? {
        key: SETTINGS_KEY,
        vatPct: 18,
        cssPct: 0,
        seatHoldMinutes: 15,
        mobilePaymentAttempts: 3,
        degradedSalesEnabled: true,
        cashVarianceNotificationsEnabled: true,
      }
    )
  },
})

export const saveSettings = mutation({
  args: {
    vatPct: v.number(),
    cssPct: v.number(),
    seatHoldMinutes: v.number(),
    mobilePaymentAttempts: v.number(),
    degradedSalesEnabled: v.boolean(),
    cashVarianceNotificationsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "modifier")
    if (args.vatPct < 0 || args.cssPct < 0) {
      throw new Error("Les taux fiscaux ne peuvent pas être négatifs.")
    }
    if (args.seatHoldMinutes < 1 || args.mobilePaymentAttempts < 1) {
      throw new Error(
        "Les délais et tentatives doivent être supérieurs à zéro."
      )
    }
    const existing = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique()
    const stored = {
      ...args,
      key: SETTINGS_KEY,
      updatedBy: actor._id,
      updatedAt: Date.now(),
    }
    const id = existing
      ? (await ctx.db.patch(existing._id, stored), existing._id)
      : await ctx.db.insert("systemSettings", stored)
    await audit(ctx, {
      actorId: actor._id,
      action: "parametrage.enregistrer",
      entityTable: "systemSettings",
      entityId: id,
      before: existing,
      after: args,
    })
    return id
  },
})

export const retryIntegrationFailures = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(
      ctx,
      "integrations",
      "consulter",
      "utilisation"
    )
    const failed = (await ctx.db.query("outboxEvents").collect()).filter(
      (event) => event.status === "echec"
    )
    if (actor.role !== "admin_it") {
      if (failed.length > 0) {
        await ctx.db.insert("outboxEvents", {
          type: "notification",
          entityId: actor._id,
          payload: JSON.stringify({
            kind: "integration_retry_request",
            requestedBy: actor._id,
            failedEventIds: failed.map((event) => event._id),
          }),
          status: "en_attente",
          attempts: 0,
          createdAt: Date.now(),
        })
      }
      await audit(ctx, {
        actorId: actor._id,
        action: "integrations.demander_reprise",
        entityTable: "outboxEvents",
        entityId: "batch",
        after: { count: failed.length },
      })
      return { count: failed.length, requested: failed.length > 0 }
    }

    for (const event of failed) {
      await ctx.db.patch(event._id, {
        status: "en_attente",
        lastError: undefined,
      })
      if (event.type === "sage_export") {
        const day = await ctx.db.get(event.entityId as Id<"accountingDays">)
        if (day) {
          await ctx.db.patch(day._id, {
            exportStatus: "en_attente",
            exportError: undefined,
          })
        }
      }
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "integrations.rejouer_echecs",
      entityTable: "outboxEvents",
      entityId: "batch",
      after: { count: failed.length },
    })
    return { count: failed.length, requested: false }
  },
})
