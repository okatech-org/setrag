import { action, mutation, query } from "../_generated/server"
import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import { pointOfSaleType, serviceClass, trainType } from "../schema"
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
      status: "a_valider",
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
      action: "tarif.creer_et_soumettre",
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
      blocks
        .filter((block) => block.isActive)
        .map(async (block) => {
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

export const listTravelers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "donnees_voyageurs", "consulter")
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
    const tickets = (await ctx.db.query("tickets").collect())
      .sort((left, right) => right._creationTime - left._creationTime)
      .slice(0, limit)
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
    const code = args.code.trim().toUpperCase()
    if (!code || !args.name.trim()) {
      throw new Error("Le code et le nom du point de vente sont obligatoires.")
    }
    const existing = await ctx.db
      .query("pointsOfSale")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique()
    if (existing) throw new Error(`Le point de vente ${code} existe déjà.`)

    const id = await ctx.db.insert("pointsOfSale", {
      code,
      name: args.name.trim(),
      type: args.type,
      stationId: args.stationId,
      counters: {
        passengers: Math.max(0, Math.trunc(args.passengerCounters)),
        baggage: Math.max(0, Math.trunc(args.baggageCounters)),
        parcels: Math.max(0, Math.trunc(args.parcelCounters)),
      },
      royaltyPct: args.royaltyPct,
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
    const actor = await requirePermission(ctx, "integrations", "consulter")
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
