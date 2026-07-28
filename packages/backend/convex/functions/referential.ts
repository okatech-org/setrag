import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
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
      throw new Error(`Point kilométrique invalide : ${args.kilometerPoint}`)
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
    await requirePermission(ctx, "referentiel", "consulter")
    const train = await ctx.db.get(args.trainId)
    if (!train) throw new Error("Train introuvable")

    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", args.trainId))
      .collect()

    const ordered = coaches.sort((a, b) => a.position - b.position)
    const coachesWithSeats = await Promise.all(
      ordered.map(async (coach) => ({
        ...coach,
        seats: (
          await ctx.db
            .query("seats")
            .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
            .collect()
        ).sort((a, b) => a.row - b.row || a.column - b.column),
      }))
    )
    return {
      train,
      coaches: coachesWithSeats,
      capacity: capacityByClass(
        ordered.map((c) => ({
          serviceClass: c.serviceClass,
          seatCount: c.seatCount,
          standingCapacity: c.standingCapacity,
        }))
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
    const number = args.number.trim().toUpperCase()
    const name = args.name.trim()
    if (!number || !name) {
      throw new Error("Le numéro et le nom du train sont obligatoires")
    }

    const existing = await ctx.db
      .query("trains")
      .withIndex("by_number", (q) => q.eq("number", number))
      .unique()
    const actor = await requirePermission(
      ctx,
      "referentiel",
      existing ? "modifier" : "creer"
    )
    const stored = {
      ...args,
      number,
      name,
      description: args.description?.trim() || undefined,
    }

    if (existing) {
      await ctx.db.patch(existing._id, stored)
      await audit(ctx, {
        actorId: actor._id,
        action: "referentiel.train.modifier",
        entityTable: "trains",
        entityId: existing._id,
        before: existing,
        after: stored,
      })
      return existing._id
    }

    const id = await ctx.db.insert("trains", stored)
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.train.creer",
      entityTable: "trains",
      entityId: id,
      after: stored,
    })
    return id
  },
})

/** Modifie un train identifié sans dépendre de son numéro commercial. */
export const updateTrain = mutation({
  args: {
    trainId: v.id("trains"),
    number: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: trainType,
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "modifier")
    const train = await ctx.db.get(args.trainId)
    if (!train) throw new Error("Train introuvable")

    const number = args.number.trim().toUpperCase()
    const name = args.name.trim()
    if (!number || !name) {
      throw new Error("Le numéro et le nom du train sont obligatoires")
    }
    const duplicate = await ctx.db
      .query("trains")
      .withIndex("by_number", (q) => q.eq("number", number))
      .unique()
    if (duplicate && duplicate._id !== args.trainId) {
      throw new Error(`Le train ${number} existe déjà`)
    }

    const after = {
      number,
      name,
      description: args.description?.trim() || undefined,
      type: args.type,
    }
    await ctx.db.patch(args.trainId, after)
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.train.modifier",
      entityTable: "trains",
      entityId: args.trainId,
      before: train,
      after,
    })
    return args.trainId
  },
})

/**
 * Active ou désactive un train. Le train reste conservé et ses dessertes
 * historiques restent consultables : aucun référentiel utilisé n'est effacé.
 */
export const setTrainActive = mutation({
  args: { trainId: v.id("trains"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "modifier")
    const train = await ctx.db.get(args.trainId)
    if (!train) throw new Error("Train introuvable")
    if (train.isActive === args.isActive) return args.trainId

    await ctx.db.patch(args.trainId, { isActive: args.isActive })
    await audit(ctx, {
      actorId: actor._id,
      action: args.isActive
        ? "referentiel.train.activer"
        : "referentiel.train.desactiver",
      entityTable: "trains",
      entityId: args.trainId,
      before: train,
      after: { ...train, isActive: args.isActive },
    })
    return args.trainId
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

    const label = args.label.trim().toUpperCase()
    if (!label) throw new Error("Le repère de la voiture est obligatoire")
    if (args.standingCapacity < 0) {
      throw new Error(
        `Contingent de places debout invalide : ${args.standingCapacity}`
      )
    }
    if (args.position < 1) throw new Error("Position de voiture invalide")

    const existing = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", args.trainId))
      .collect()
    if (existing.some((c) => c.label === label)) {
      throw new Error(`La voiture ${label} existe déjà dans cette composition`)
    }

    // Lève si rangées × colonnes ne correspond pas aux places déclarées.
    const seats = generateSeats({
      rowCount: args.rowCount,
      columnCount: args.columnCount,
      seatCount: args.seatCount,
    })

    const stored = {
      ...args,
      label,
      serialNumber: args.serialNumber?.trim() || undefined,
      position: Math.trunc(args.position),
    }
    const coachId = await ctx.db.insert("coaches", stored)
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
      after: { ...stored, generatedSeats: seats.length },
    })
    return coachId
  },
})

/** Places d'une voiture, dans l'ordre de la numérotation. */
export const listSeats = query({
  args: { coachId: v.id("coaches") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_coach", (q) => q.eq("coachId", args.coachId))
      .collect()
    return seats.sort((a, b) => a.row - b.row || a.column - b.column)
  },
})

async function coachIsUsed(ctx: MutationCtx, coachId: Id<"coaches">) {
  const seats = await ctx.db
    .query("seats")
    .withIndex("by_coach", (q) => q.eq("coachId", coachId))
    .collect()
  const [occupancy, references] = await Promise.all([
    ctx.db
      .query("seatOccupancy")
      .filter((q) => q.eq(q.field("coachId"), coachId))
      .first(),
    Promise.all(
      seats.map(async (seat) => {
        const [ticket, block] = await Promise.all([
          ctx.db
            .query("tickets")
            .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
            .first(),
          ctx.db
            .query("seatBlocks")
            .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
            .first(),
        ])
        return Boolean(ticket || block)
      })
    ),
  ])
  return { used: Boolean(occupancy || references.some(Boolean)), seats }
}

/**
 * Modifie une voiture et, si son plan change, régénère ses sièges.
 * Un plan ou une classe déjà utilisés ne peuvent pas être réécrits.
 */
export const updateCoach = mutation({
  args: {
    coachId: v.id("coaches"),
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
    const actor = await requirePermission(ctx, "referentiel", "modifier")
    const coach = await ctx.db.get(args.coachId)
    if (!coach) throw new Error("Voiture introuvable")
    const label = args.label.trim().toUpperCase()
    if (!label) throw new Error("Le repère de la voiture est obligatoire")
    if (args.standingCapacity < 0 || args.position < 1) {
      throw new Error("Les capacités et la position doivent être valides")
    }

    const siblings = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", coach.trainId))
      .collect()
    if (
      siblings.some(
        (candidate) => candidate._id !== coach._id && candidate.label === label
      )
    ) {
      throw new Error(`La voiture ${label} existe déjà dans cette composition`)
    }

    const planChanges =
      coach.rowCount !== args.rowCount ||
      coach.columnCount !== args.columnCount ||
      coach.seatCount !== args.seatCount
    const inventoryChanges =
      planChanges ||
      coach.serviceClass !== args.serviceClass ||
      coach.standingCapacity !== args.standingCapacity
    const usage = await coachIsUsed(ctx, coach._id)
    if (usage.used && inventoryChanges) {
      throw new Error(
        "Voiture déjà utilisée : sa classe et ses capacités ne peuvent plus être modifiées"
      )
    }

    let generatedSeats: ReturnType<typeof generateSeats> | undefined
    if (planChanges) {
      generatedSeats = generateSeats({
        rowCount: args.rowCount,
        columnCount: args.columnCount,
        seatCount: args.seatCount,
      })
    }
    const after = {
      label,
      serviceClass: args.serviceClass,
      serialNumber: args.serialNumber?.trim() || undefined,
      rowCount: args.rowCount,
      columnCount: args.columnCount,
      seatCount: args.seatCount,
      standingCapacity: args.standingCapacity,
      position: Math.trunc(args.position),
    }
    await ctx.db.patch(coach._id, after)

    if (generatedSeats) {
      for (const seat of usage.seats) await ctx.db.delete(seat._id)
      for (const seat of generatedSeats) {
        await ctx.db.insert("seats", {
          coachId: coach._id,
          trainId: coach.trainId,
          label: seat.label,
          row: seat.row,
          column: seat.column,
          isActive: true,
        })
      }
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.voiture.modifier",
      entityTable: "coaches",
      entityId: coach._id,
      before: coach,
      after: {
        ...after,
        generatedSeats: generatedSeats?.length ?? coach.seatCount,
      },
    })
    return coach._id
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

    // Une voiture ou l'une de ses places déjà référencée ne peut disparaître.
    const usage = await coachIsUsed(ctx, args.coachId)
    if (usage.used) {
      throw new Error(
        "Voiture engagée sur une desserte, déjà utilisée ou bloquée : retrait impossible"
      )
    }

    for (const seat of usage.seats) {
      await ctx.db.delete(seat._id)
    }
    await ctx.db.delete(args.coachId)

    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.voiture.supprimer",
      entityTable: "coaches",
      entityId: args.coachId,
      before: { ...coach, seatCount: usage.seats.length },
    })
  },
})
