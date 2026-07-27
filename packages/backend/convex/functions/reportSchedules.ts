import { v } from "convex/values"

import { internal } from "../_generated/api"
import { internalMutation, mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"

const reportType = v.union(
  v.literal("ventes_canaux"),
  v.literal("remplissage"),
  v.literal("annulations"),
  v.literal("recettes")
)
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
    const actor = await requirePermission(ctx, "rapports", "creer")
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

/**
 * Dépose l'envoi dans la file durable puis programme l'occurrence suivante.
 * Le processeur de notifications peut ainsi être indisponible sans perdre le
 * rapport demandé.
 */
export const run = internalMutation({
  args: { scheduleId: v.id("reportSchedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule || !schedule.isActive) return { queued: false }

    const runAt = Date.now()
    const nextRunAt = nextOccurrence(runAt, schedule.frequency)
    await ctx.db.insert("outboxEvents", {
      type: "notification",
      entityId: args.scheduleId,
      payload: JSON.stringify({
        kind: "scheduled_report",
        reportType: schedule.reportType,
        format: schedule.format,
        recipients: schedule.recipients,
      }),
      status: "en_attente",
      attempts: 0,
      createdAt: runAt,
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
