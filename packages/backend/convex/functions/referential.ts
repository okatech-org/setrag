import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import { serviceClass, trainType } from "../schema"
import { capacityByClass, generateSeats } from "../model/seating"
import { distanceBetween } from "../model/network"

/**
 * Référentiel du réseau et du matériel roulant.
 *
 * Les fonctions restent minces : elles vérifient les droits, appellent la
 * logique pure de `convex/model/` et écrivent. Toute modification est auditée
 * avec les valeurs avant et après, comme l'exige le CDC §9.2.6.
 */

/* ────────────────────────────── Gares ──────────────────────────────────── */

/**
 * Gares actives, ordonnées par point kilométrique.
 * Query publique : la liste des gares desservies n'est pas une donnée
 * sensible et alimente la recherche d'itinéraire du site public.
 */
export const listStations = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const stations = await ctx.db
      .query("stations")
      .withIndex("by_kilometerPoint")
      .collect()
    return args.includeInactive
      ? stations
      : stations.filter((station) => station.isActive)
  },
})

export const getStationByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("stations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique(),
})

/** Distance commerciale entre deux gares, base du calcul tarifaire. */
export const distanceBetweenStations = query({
  args: { originCode: v.string(), destinationCode: v.string() },
  handler: async (ctx, args) => {
    const [origin, destination] = await Promise.all([
      ctx.db
        .query("stations")
        .withIndex("by_code", (q) => q.eq("code", args.originCode))
        .unique(),
      ctx.db
        .query("stations")
        .withIndex("by_code", (q) => q.eq("code", args.destinationCode))
        .unique(),
    ])
    if (!origin) throw new Error(`Gare inconnue : ${args.originCode}`)
    if (!destination) throw new Error(`Gare inconnue : ${args.destinationCode}`)
    return distanceBetween(origin.kilometerPoint, destination.kilometerPoint)
  },
})

export const upsertStation = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    province: v.string(),
    kilometerPoint: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isEquipped: v.boolean(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "creer")
    if (args.kilometerPoint < 0) {
      throw new Error(
        `Point kilométrique invalide : ${args.kilometerPoint}`,
      )
    }

    const existing = await ctx.db
      .query("stations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, args)
      await audit(ctx, {
        actorId: actor._id,
        action: "referentiel.station.modifier",
        entityTable: "stations",
        entityId: existing._id,
        before: existing,
        after: args,
      })
      return existing._id
    }

    const id = await ctx.db.insert("stations", args)
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.station.creer",
      entityTable: "stations",
      entityId: id,
      after: args,
    })
    return id
  },
})

/* ────────────────────────────── Trains ─────────────────────────────────── */

export const listTrains = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const trains = await ctx.db.query("trains").collect()
    return args.includeInactive
      ? trains
      : trains.filter((train) => train.isActive)
  },
})

/** Composition détaillée d'un train : voitures, places et capacités. */
export const getTrainComposition = query({
  args: { trainId: v.id("trains") },
  handler: async (ctx, args) => {
    const train = await ctx.db.get(args.trainId)
    if (!train) throw new Error("Train introuvable")

    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", args.trainId))
      .collect()

    const ordered = coaches.sort((a, b) => a.position - b.position)
    return {
      train,
      coaches: ordered,
      capacity: capacityByClass(
        ordered.map((c) => ({
          serviceClass: c.serviceClass,
          seatCount: c.seatCount,
          standingCapacity: c.standingCapacity,
        })),
      ),
    }
  },
})

export const upsertTrain = mutation({
  args: {
    number: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: trainType,
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "creer")

    const existing = await ctx.db
      .query("trains")
      .withIndex("by_number", (q) => q.eq("number", args.number))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, args)
      await audit(ctx, {
        actorId: actor._id,
        action: "referentiel.train.modifier",
        entityTable: "trains",
        entityId: existing._id,
        before: existing,
        after: args,
      })
      return existing._id
    }

    const id = await ctx.db.insert("trains", args)
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.train.creer",
      entityTable: "trains",
      entityId: id,
      after: args,
    })
    return id
  },
})

/* ────────────────────────── Voitures et places ─────────────────────────── */

/**
 * Ajoute une voiture à une composition et engendre son plan de sièges.
 *
 * La génération des places est faite ici, dans la même transaction que la
 * création de la voiture : une voiture ne peut pas exister sans ses places,
 * ce qui garantit la cohérence de l'inventaire.
 */
export const addCoach = mutation({
  args: {
    trainId: v.id("trains"),
    label: v.string(),
    serviceClass,
    serialNumber: v.optional(v.string()),
    rowCount: v.number(),
    columnCount: v.number(),
    seatCount: v.number(),
    standingCapacity: v.number(),
    position: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "creer")

    const train = await ctx.db.get(args.trainId)
    if (!train) throw new Error("Train introuvable")

    if (args.standingCapacity < 0) {
      throw new Error(
        `Contingent de places debout invalide : ${args.standingCapacity}`,
      )
    }

    const existing = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", args.trainId))
      .collect()
    if (existing.some((c) => c.label === args.label)) {
      throw new Error(
        `La voiture ${args.label} existe déjà dans cette composition`,
      )
    }

    // Lève si rangées × colonnes ne correspond pas aux places déclarées.
    const seats = generateSeats({
      rowCount: args.rowCount,
      columnCount: args.columnCount,
      seatCount: args.seatCount,
    })

    const coachId = await ctx.db.insert("coaches", args)
    for (const seat of seats) {
      await ctx.db.insert("seats", {
        coachId,
        trainId: args.trainId,
        label: seat.label,
        row: seat.row,
        column: seat.column,
        isActive: true,
      })
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.voiture.creer",
      entityTable: "coaches",
      entityId: coachId,
      after: { ...args, generatedSeats: seats.length },
    })
    return coachId
  },
})

/** Places d'une voiture, dans l'ordre de la numérotation. */
export const listSeats = query({
  args: { coachId: v.id("coaches") },
  handler: async (ctx, args) => {
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_coach", (q) => q.eq("coachId", args.coachId))
      .collect()
    return seats.sort((a, b) => a.row - b.row || a.column - b.column)
  },
})

/**
 * Retire une voiture d'une composition, avec ses places.
 *
 * Refusé si la voiture est déjà engagée sur une desserte ouverte à la vente :
 * supprimer des places déjà vendues créerait des voyageurs sans siège.
 */
export const removeCoach = mutation({
  args: { coachId: v.id("coaches") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "supprimer")

    const coach = await ctx.db.get(args.coachId)
    if (!coach) throw new Error("Voiture introuvable")

    // Une voiture déjà engagée sur une desserte ne peut pas disparaître :
    // ses places sont peut-être vendues.
    const occupancy = await ctx.db
      .query("seatOccupancy")
      .filter((q) => q.eq(q.field("coachId"), args.coachId))
      .first()
    if (occupancy) {
      throw new Error(
        `Voiture engagée sur une desserte ouverte : retrait impossible`,
      )
    }

    const seats = await ctx.db
      .query("seats")
      .withIndex("by_coach", (q) => q.eq("coachId", args.coachId))
      .collect()
    for (const seat of seats) {
      await ctx.db.delete(seat._id)
    }
    await ctx.db.delete(args.coachId)

    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.voiture.supprimer",
      entityTable: "coaches",
      entityId: args.coachId,
      before: { ...coach, seatCount: seats.length },
    })
  },
})
