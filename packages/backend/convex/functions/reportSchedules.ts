import { v } from "convex/values"

import { internal } from "../_generated/api"
import { internalMutation, mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import { scheduledReportType } from "../schema"
import {
  exigerDroitsRapport,
  inscrireExecution,
  periodeProgrammee,
  typeCdc,
} from "./pilotage"

/**
 * Les six états du CDC, plus les quatre types historiques (ventes par canal,
 * remplissage, annulations, recettes), rattachés chacun à l'état qui le
 * couvre au moment de l'exécution (`typeCdc`).
 */
const reportType = scheduledReportType
const frequency = v.union(
  v.literal("quotidien"),
  v.literal("hebdomadaire"),
  v.literal("mensuel")
)
const reportFormat = v.union(
  v.literal("csv"),
  v.literal("xlsx"),
  v.literal("pdf")
)

function nextOccurrence(
  timestamp: number,
  cadence: "quotidien" | "hebdomadaire" | "mensuel"
) {
  const next = new Date(timestamp)
  if (cadence === "mensuel") {
    next.setUTCMonth(next.getUTCMonth() + 1)
  } else {
    next.setUTCDate(next.getUTCDate() + (cadence === "hebdomadaire" ? 7 : 1))
  }
  return next.getTime()
}

function normalizeRecipients(values: string[]) {
  const recipients = [
    ...new Set(
      values.map((value) => value.trim().toLowerCase()).filter(Boolean)
    ),
  ]
  const invalid = recipients.find(
    (recipient) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
  )
  if (invalid) throw new Error(`Adresse e-mail invalide : ${invalid}`)
  if (recipients.length === 0) {
    throw new Error("Au moins un destinataire est obligatoire")
  }
  return recipients
}

/** Programmations actives ou passées affichées dans le back-office. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "rapports", "consulter")
    return await ctx.db
      .query("reportSchedules")
      .withIndex("by_next_run")
      .order("asc")
      .take(100)
  },
})

export const get = query({
  args: { scheduleId: v.id("reportSchedules") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")
    return await ctx.db.get(args.scheduleId)
  },
})

/**
 * Crée une programmation et inscrit atomiquement sa première exécution dans
 * le planificateur Convex. Si la mutation échoue, aucun envoi n'est planifié.
 */
export const create = mutation({
  args: {
    label: v.string(),
    reportType,
    frequency,
    format: reportFormat,
    recipients: v.array(v.string()),
    nextRunAt: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await exigerDroitsRapport(ctx, typeCdc(args.reportType))
    const label = args.label.trim()
    if (!label) throw new Error("Le nom du rapport est obligatoire")
    if (!Number.isFinite(args.nextRunAt) || args.nextRunAt <= Date.now()) {
      throw new Error(
        "La première exécution doit être programmée dans le futur"
      )
    }
    const recipients = normalizeRecipients(args.recipients)
    const now = Date.now()
    const scheduleId = await ctx.db.insert("reportSchedules", {
      label,
      reportType: args.reportType,
      frequency: args.frequency,
      format: args.format,
      recipients,
      nextRunAt: args.nextRunAt,
      isActive: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAt(
      args.nextRunAt,
      internal.functions.reportSchedules.run,
      { scheduleId }
    )
    await audit(ctx, {
      actorId: actor._id,
      action: "rapport.programmer",
      entityTable: "reportSchedules",
      entityId: scheduleId,
      after: {
        label,
        reportType: args.reportType,
        frequency: args.frequency,
        format: args.format,
        recipients,
        nextRunAt: args.nextRunAt,
      },
    })
    return { scheduleId, nextRunAt: args.nextRunAt }
  },
})

export const update = mutation({
  args: {
    scheduleId: v.id("reportSchedules"),
    label: v.string(),
    reportType,
    frequency,
    format: reportFormat,
    recipients: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "rapports", "modifier")
    await exigerDroitsRapport(ctx, typeCdc(args.reportType), "modifier")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Cette programmation n’existe plus.")
    const label = args.label.trim()
    if (!label) throw new Error("Le nom du rapport est obligatoire")
    const recipients = normalizeRecipients(args.recipients)
    /*
     * La prochaine occurrence a déjà été inscrite dans le planificateur.
     * On la conserve donc lors d'un changement de fréquence : la nouvelle
     * cadence sera calculée par `run` après cette occurrence. Replanifier ici
     * sans identifiant de tâche créerait deux exécutions concurrentes.
     */
    const patch = {
      label,
      reportType: args.reportType,
      frequency: args.frequency,
      format: args.format,
      recipients,
      updatedAt: Date.now(),
    }
    await ctx.db.patch(args.scheduleId, patch)
    await audit(ctx, {
      actorId: actor._id,
      action: "rapport.modifier",
      entityTable: "reportSchedules",
      entityId: args.scheduleId,
      before: schedule,
      after: patch,
    })
    return args.scheduleId
  },
})

export const setActive = mutation({
  args: {
    scheduleId: v.id("reportSchedules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "rapports", "modifier")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Cette programmation n’existe plus.")
    if (schedule.isActive === args.isActive) {
      return args.scheduleId
    }
    const now = Date.now()
    const nextRunAt =
      args.isActive && schedule.nextRunAt <= now
        ? nextOccurrence(now, schedule.frequency)
        : schedule.nextRunAt
    await ctx.db.patch(args.scheduleId, {
      isActive: args.isActive,
      nextRunAt,
      updatedAt: now,
    })
    if (args.isActive) {
      await ctx.scheduler.runAt(
        nextRunAt,
        internal.functions.reportSchedules.run,
        { scheduleId: args.scheduleId }
      )
    }
    await audit(ctx, {
      actorId: actor._id,
      action: args.isActive ? "rapport.reactiver" : "rapport.suspendre",
      entityTable: "reportSchedules",
      entityId: args.scheduleId,
      before: { isActive: schedule.isActive },
      after: { isActive: args.isActive, nextRunAt },
    })
    return args.scheduleId
  },
})

export const runNow = mutation({
  args: { scheduleId: v.id("reportSchedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Cette programmation n’existe plus.")
    const type = typeCdc(schedule.reportType)
    const actor = await exigerDroitsRapport(ctx, type)
    const now = Date.now()
    const periode = periodeProgrammee(schedule.frequency, now)
    const runId = await inscrireExecution(ctx, {
      reportType: type,
      ...periode,
      filters: {},
      trigger: "manuel",
      scheduleId: schedule._id,
      requestedBy: actor._id,
      recipients: schedule.recipients,
    })
    await ctx.db.patch(args.scheduleId, {
      lastRunAt: now,
      updatedAt: now,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "rapport.executer_maintenant",
      entityTable: "reportSchedules",
      entityId: args.scheduleId,
      after: { queuedAt: now, runId, ...periode },
    })
    return { queued: true, runId }
  },
})

/**
 * Inscrit l'exécution (production du fichier, puis envoi aux destinataires
 * par la file durable) et programme l'occurrence suivante. La période
 * couverte est la période close précédente (veille, semaine, 30 jours).
 */
export const run = internalMutation({
  args: { scheduleId: v.id("reportSchedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule || !schedule.isActive) return { queued: false }

    const runAt = Date.now()
    const nextRunAt = nextOccurrence(runAt, schedule.frequency)
    await inscrireExecution(ctx, {
      reportType: typeCdc(schedule.reportType),
      ...periodeProgrammee(schedule.frequency, runAt),
      filters: {},
      trigger: "programme",
      scheduleId: schedule._id,
      recipients: schedule.recipients,
    })
    await ctx.db.patch(args.scheduleId, {
      lastRunAt: runAt,
      nextRunAt,
      updatedAt: runAt,
    })
    await ctx.scheduler.runAt(
      nextRunAt,
      internal.functions.reportSchedules.run,
      { scheduleId: args.scheduleId }
    )
    return { queued: true, nextRunAt }
  },
})
