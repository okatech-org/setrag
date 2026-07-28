import { v } from "convex/values"
import { internal } from "../_generated/api"
import { mutation, query } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
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

const scheduleInput = {
  trainId: v.id("trains"),
  departureTime: v.string(),
  daysOfWeek: v.array(v.number()),
  stops: v.array(
    v.object({
      stationId: v.id("stations"),
      sequence: v.number(),
      arrivalOffsetMinutes: v.optional(v.number()),
      departureOffsetMinutes: v.optional(v.number()),
    })
  ),
}

type ScheduleInput = {
  trainId: Id<"trains">
  departureTime: string
  daysOfWeek: number[]
  stops: Array<{
    stationId: Id<"stations">
    sequence: number
    arrivalOffsetMinutes?: number
    departureOffsetMinutes?: number
  }>
}

async function validateScheduleInput(ctx: MutationCtx, args: ScheduleInput) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.departureTime)) {
    throw new Error("Heure de départ invalide : format HH:MM attendu")
  }
  if (
    args.daysOfWeek.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6
    ) ||
    new Set(args.daysOfWeek).size !== args.daysOfWeek.length
  ) {
    throw new Error("Jours de circulation invalides")
  }

  const train = await ctx.db.get(args.trainId)
  if (!train) throw new Error("Train introuvable")
  if (!train.isActive) throw new Error("Train désactivé : horaire refusé")

  const enriched = []
  let previousOffset = -1
  for (const stop of args.stops) {
    const station = await ctx.db.get(stop.stationId)
    if (!station) throw new Error("Gare introuvable dans la desserte")
    if (!station.isActive) {
      throw new Error(`Gare ${station.code} fermée : desserte refusée`)
    }
    for (const offset of [
      stop.arrivalOffsetMinutes,
      stop.departureOffsetMinutes,
    ]) {
      if (
        offset !== undefined &&
        (!Number.isFinite(offset) || offset < previousOffset)
      ) {
        throw new Error("Les horaires des arrêts doivent être chronologiques")
      }
      if (offset !== undefined) previousOffset = offset
    }
    enriched.push({
      stationId: stop.stationId as string,
      sequence: stop.sequence,
      kilometerPoint: station.kilometerPoint,
    })
  }
  validateStopSequence(enriched)

  const coaches = await ctx.db
    .query("coaches")
    .withIndex("by_train", (q) => q.eq("trainId", args.trainId))
    .collect()
  if (coaches.length === 0) {
    throw new Error(
      `Le train ${train.number} n'a aucune voiture : horaire refusé`
    )
  }
  return train
}

async function markCorrected(
  ctx: MutationCtx,
  booklet: {
    _id: Id<"timetableBooklets">
    status: "brouillon" | "a_valider" | "actif" | "rejete" | "expire"
  }
) {
  if (booklet.status === "rejete") {
    await ctx.db.patch(booklet._id, {
      status: applyTransition(booklet.status, "reprendre"),
      rejectionReason: undefined,
    })
  }
}

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

export const update = mutation({
  args: {
    bookletId: v.id("timetableBooklets"),
    label: v.string(),
    description: v.optional(v.string()),
    validFrom: v.number(),
    validUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "modifier")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (!isEditable(booklet.status)) {
      throw new Error(`Livret « ${booklet.status} » : il n'est plus modifiable`)
    }
    if (!args.label.trim()) throw new Error("Le libellé est obligatoire")
    assertValidityWindow(args.validFrom, args.validUntil)
    const status =
      booklet.status === "rejete"
        ? applyTransition(booklet.status, "reprendre")
        : booklet.status
    const after = {
      label: args.label.trim(),
      description: args.description?.trim() || undefined,
      validFrom: args.validFrom,
      validUntil: args.validUntil,
      status,
      rejectionReason: undefined,
    }
    await ctx.db.patch(booklet._id, after)
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.modifier",
      entityTable: "timetableBooklets",
      entityId: booklet._id,
      before: booklet,
      after,
    })
    return booklet._id
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
    ...scheduleInput,
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "modifier")

    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (!isEditable(booklet.status)) {
      throw new Error(`Livret « ${booklet.status} » : il n'est plus modifiable`)
    }

    const train = await validateScheduleInput(ctx, args)

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
    await markCorrected(ctx, booklet)
    return id
  },
})

export const updateSchedule = mutation({
  args: {
    scheduleId: v.id("bookletSchedules"),
    ...scheduleInput,
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "modifier")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Horaire de livret introuvable")
    const booklet = await ctx.db.get(schedule.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (!isEditable(booklet.status)) {
      throw new Error(`Livret « ${booklet.status} » : il n'est plus modifiable`)
    }
    const train = await validateScheduleInput(ctx, args)
    const after = {
      trainId: args.trainId,
      trainNumber: train.number,
      trainType: train.type,
      departureTime: args.departureTime,
      daysOfWeek: args.daysOfWeek,
      stops: args.stops,
    }
    await ctx.db.patch(schedule._id, after)
    await markCorrected(ctx, booklet)
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.horaire.modifier",
      entityTable: "bookletSchedules",
      entityId: schedule._id,
      before: schedule,
      after,
    })
    return schedule._id
  },
})

export const removeSchedule = mutation({
  args: { scheduleId: v.id("bookletSchedules") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "supprimer")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Horaire de livret introuvable")
    const booklet = await ctx.db.get(schedule.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (!isEditable(booklet.status)) {
      throw new Error(
        "Un horaire soumis, actif ou historique ne peut pas être supprimé"
      )
    }
    const generatedTrip = await ctx.db
      .query("trips")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .first()
    if (generatedTrip) {
      throw new Error("Horaire déjà utilisé par une desserte : retrait refusé")
    }
    await ctx.db.delete(schedule._id)
    await markCorrected(ctx, booklet)
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.horaire.supprimer",
      entityTable: "bookletSchedules",
      entityId: schedule._id,
      before: schedule,
    })
  },
})

export const removeDraft = mutation({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "supprimer")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (booklet.status !== "brouillon") {
      throw new Error("Seul un livret en brouillon peut être supprimé")
    }
    const generatedTrip = await ctx.db
      .query("trips")
      .withIndex("by_booklet", (q) => q.eq("bookletId", booklet._id))
      .first()
    if (generatedTrip) {
      throw new Error(
        "Livret déjà utilisé par une desserte : suppression refusée"
      )
    }
    const schedules = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", booklet._id))
      .collect()
    for (const schedule of schedules) await ctx.db.delete(schedule._id)
    await ctx.db.delete(booklet._id)
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.brouillon.supprimer",
      entityTable: "timetableBooklets",
      entityId: booklet._id,
      before: { ...booklet, schedules: schedules.length },
    })
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

    const editableStatus =
      booklet.status === "rejete"
        ? applyTransition(booklet.status, "reprendre")
        : booklet.status
    const status = applyTransition(editableStatus, "soumettre")
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
    const reason = args.reason.trim()
    if (reason.length === 0) {
      throw new Error("Un motif de rejet est obligatoire")
    }
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")

    const status = applyTransition(booklet.status, "rejeter")
    await ctx.db.patch(args.bookletId, {
      status,
      rejectionReason: reason,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.rejeter",
      entityTable: "timetableBooklets",
      entityId: args.bookletId,
      before: { status: booklet.status },
      after: { status, reason },
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
          autre.validUntil
        )
      ) {
        throw new Error(
          `Chevauchement avec le livret actif « ${autre.label} » : ` +
            `activation refusée`
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
        schedule.daysOfWeek
      )
      for (const serviceDate of dates) {
        planned.push({ scheduleId: schedule._id, serviceDate })
      }
    }

    if (planned.length > MAX_GENERATED_TRIPS) {
      throw new Error(
        `Ce livret engendrerait ${planned.length} dessertes, au-delà du ` +
          `plafond de ${MAX_GENERATED_TRIPS}. Réduire la période de ` +
          `validité ou les jours de circulation.`
      )
    }

    await ctx.db.patch(args.bookletId, {
      status,
      approvedBy: actor._id,
      approvedAt: Date.now(),
    })

    for (const item of planned) {
      await ctx.scheduler.runAfter(0, internal.functions.trips.generateOne, {
        scheduleId: item.scheduleId as never,
        serviceDate: item.serviceDate,
      })
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
        schedule.daysOfWeek
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
              schedules[0]!.departureTime
            )
          : null,
    }
  },
})
