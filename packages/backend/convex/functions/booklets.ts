import { v } from "convex/values"
import { internal } from "../_generated/api"
import { mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import { trainType } from "../schema"
import {
  applyTransition,
  assertValidityWindow,
  isEditable,
  periodsOverlap,
} from "../model/approval"
import {
  enumerateServiceDates,
  toServiceDate,
  fromServiceDate,
} from "../model/calendar"
import { validateStopSequence } from "../model/network"

/**
 * Livrets horaires — cycle de vie et génération des dessertes.
 *
 * Le livret est le gabarit : il décrit quels trains circulent, quels jours et
 * avec quels arrêts. Son activation engendre les dessertes réelles, une par
 * jour de circulation, chacune avec son inventaire de places.
 */

/** Plafond de dessertes engendrées par une activation. */
const MAX_GENERATED_TRIPS = 500

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "livrets_horaires", "consulter")
    return await ctx.db.query("timetableBooklets").collect()
  },
})

export const get = query({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "livrets_horaires", "consulter")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")

    const schedules = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", args.bookletId))
      .collect()
    return { booklet, schedules }
  },
})

export const create = mutation({
  args: {
    label: v.string(),
    description: v.optional(v.string()),
    validFrom: v.number(),
    validUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "creer")
    assertValidityWindow(args.validFrom, args.validUntil)

    const id = await ctx.db.insert("timetableBooklets", {
      ...args,
      status: "brouillon",
      createdBy: actor._id,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.creer",
      entityTable: "timetableBooklets",
      entityId: id,
      after: args,
    })
    return id
  },
})

/**
 * Ajoute l'horaire d'un train au livret.
 *
 * La séquence d'arrêts est validée ici : numérotation continue, gares
 * distinctes, points kilométriques monotones. Un livret incohérent
 * engendrerait des dessertes invendables.
 */
export const addSchedule = mutation({
  args: {
    bookletId: v.id("timetableBooklets"),
    trainId: v.id("trains"),
    departureTime: v.string(),
    daysOfWeek: v.array(v.number()),
    stops: v.array(
      v.object({
        stationId: v.id("stations"),
        sequence: v.number(),
        arrivalOffsetMinutes: v.optional(v.number()),
        departureOffsetMinutes: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "modifier")

    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (!isEditable(booklet.status)) {
      throw new Error(
        `Livret « ${booklet.status} » : il n'est plus modifiable`,
      )
    }

    const train = await ctx.db.get(args.trainId)
    if (!train) throw new Error("Train introuvable")
    if (!train.isActive) throw new Error("Train désactivé : horaire refusé")

    // Contrôle de cohérence de la desserte, avec les points kilométriques.
    const enriched = []
    for (const stop of args.stops) {
      const station = await ctx.db.get(stop.stationId)
      if (!station) throw new Error("Gare introuvable dans la desserte")
      if (!station.isActive) {
        throw new Error(`Gare ${station.code} fermée : desserte refusée`)
      }
      enriched.push({
        stationId: stop.stationId as string,
        sequence: stop.sequence,
        kilometerPoint: station.kilometerPoint,
      })
    }
    validateStopSequence(enriched)

    // Vérifie que le train a bien une composition, sinon aucune place à vendre.
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", args.trainId))
      .collect()
    if (coaches.length === 0) {
      throw new Error(
        `Le train ${train.number} n'a aucune voiture : horaire refusé`,
      )
    }

    const id = await ctx.db.insert("bookletSchedules", {
      bookletId: args.bookletId,
      trainId: args.trainId,
      trainNumber: train.number,
      trainType: train.type,
      departureTime: args.departureTime,
      daysOfWeek: args.daysOfWeek,
      stops: args.stops,
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "livret.horaire.ajouter",
      entityTable: "bookletSchedules",
      entityId: id,
      after: { trainNumber: train.number, stops: args.stops.length },
    })
    return id
  },
})

export const submit = mutation({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "modifier")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")

    const schedules = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", args.bookletId))
      .collect()
    if (schedules.length === 0) {
      throw new Error("Livret vide : aucun horaire à valider")
    }

    const status = applyTransition(booklet.status, "soumettre")
    await ctx.db.patch(args.bookletId, { status })
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.soumettre",
      entityTable: "timetableBooklets",
      entityId: args.bookletId,
      before: { status: booklet.status },
      after: { status },
    })
    return status
  },
})

export const reject = mutation({
  args: { bookletId: v.id("timetableBooklets"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "valider")
    if (args.reason.trim().length === 0) {
      throw new Error("Un motif de rejet est obligatoire")
    }
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")

    const status = applyTransition(booklet.status, "rejeter")
    await ctx.db.patch(args.bookletId, {
      status,
      rejectionReason: args.reason,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.rejeter",
      entityTable: "timetableBooklets",
      entityId: args.bookletId,
      before: { status: booklet.status },
      after: { status, reason: args.reason },
    })
    return status
  },
})

/**
 * Valide et active le livret, puis engendre les dessertes.
 *
 * L'activation est refusée si un autre livret actif couvre la même période :
 * deux livrets concurrents produiraient des dessertes en double pour le même
 * train.
 *
 * La génération est déportée sur des mutations planifiées, une par desserte :
 * chaque desserte écrit plusieurs centaines de documents (une occupation par
 * place, un compteur par classe et par segment), bien au-delà de ce qu'une
 * mutation unique peut absorber pour un livret entier.
 */
export const approve = mutation({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "valider")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")

    const actifs = await ctx.db
      .query("timetableBooklets")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .collect()
    for (const autre of actifs) {
      if (
        periodsOverlap(
          booklet.validFrom,
          booklet.validUntil,
          autre.validFrom,
          autre.validUntil,
        )
      ) {
        throw new Error(
          `Chevauchement avec le livret actif « ${autre.label} » : ` +
            `activation refusée`,
        )
      }
    }

    const status = applyTransition(booklet.status, "valider")

    const schedules = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", args.bookletId))
      .collect()

    // Énumère les dessertes à engendrer avant d'écrire quoi que ce soit.
    const planned: Array<{ scheduleId: string; serviceDate: string }> = []
    for (const schedule of schedules) {
      const dates = enumerateServiceDates(
        toServiceDate(booklet.validFrom),
        toServiceDate(booklet.validUntil),
        schedule.daysOfWeek,
      )
      for (const serviceDate of dates) {
        planned.push({ scheduleId: schedule._id, serviceDate })
      }
    }

    if (planned.length > MAX_GENERATED_TRIPS) {
      throw new Error(
        `Ce livret engendrerait ${planned.length} dessertes, au-delà du ` +
          `plafond de ${MAX_GENERATED_TRIPS}. Réduire la période de ` +
          `validité ou les jours de circulation.`,
      )
    }

    await ctx.db.patch(args.bookletId, {
      status,
      approvedBy: actor._id,
      approvedAt: Date.now(),
    })

    for (const item of planned) {
      await ctx.scheduler.runAfter(
        0,
        internal.functions.trips.generateOne,
        {
          scheduleId: item.scheduleId as never,
          serviceDate: item.serviceDate,
        },
      )
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "livret.activer",
      entityTable: "timetableBooklets",
      entityId: args.bookletId,
      before: { status: booklet.status },
      after: { status, plannedTrips: planned.length },
    })

    return { status, plannedTrips: planned.length }
  },
})

/** Nombre de dessertes qu'engendrerait l'activation, sans rien écrire. */
export const previewGeneration = query({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "livrets_horaires", "consulter")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")

    const schedules = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", args.bookletId))
      .collect()

    const byTrain: Record<string, number> = {}
    let total = 0
    for (const schedule of schedules) {
      const dates = enumerateServiceDates(
        toServiceDate(booklet.validFrom),
        toServiceDate(booklet.validUntil),
        schedule.daysOfWeek,
      )
      byTrain[schedule.trainNumber] =
        (byTrain[schedule.trainNumber] ?? 0) + dates.length
      total += dates.length
    }
    return {
      total,
      byTrain,
      exceedsLimit: total > MAX_GENERATED_TRIPS,
      limit: MAX_GENERATED_TRIPS,
      firstDeparture:
        schedules.length > 0
          ? fromServiceDate(
              toServiceDate(booklet.validFrom),
              schedules[0]!.departureTime,
            )
          : null,
    }
  },
})
