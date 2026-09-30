import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex } from "@noble/hashes/utils"
import { v } from "convex/values"

import { internalMutation, query } from "../../_generated/server"
import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { requireRole } from "../../lib/auth"

const MAX_WINDOW_DURATION_MS = 31 * 24 * 60 * 60 * 1_000
const MAX_LOGS_PER_SEAL = 10_000
const MAX_SEALS_PER_PAGE = 100
const ADMIN_ROLES = ["admin_fonctionnel", "admin_it"] as const

function assertWindow(windowStart: number, windowEnd: number): void {
  if (
    !Number.isSafeInteger(windowStart) ||
    !Number.isSafeInteger(windowEnd) ||
    windowStart < 0 ||
    windowEnd <= windowStart
  ) {
    throw new Error("La fenêtre de scellement est invalide.")
  }
  if (windowEnd - windowStart > MAX_WINDOW_DURATION_MS) {
    throw new Error("La fenêtre de scellement ne peut pas dépasser 31 jours.")
  }
  if (windowEnd > Date.now()) {
    throw new Error("Une fenêtre de scellement doit être entièrement révolue.")
  }
}

function hash(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)))
}

/** Représentation ordonnée, stable et indépendante de l'ordre des propriétés. */
function canonicalLog(log: Doc<"auditLogs">): readonly unknown[] {
  return [
    String(log._id),
    log.createdAt,
    log.actorId ? String(log.actorId) : null,
    log.assignmentId ? String(log.assignmentId) : null,
    log.action,
    log.entityTable,
    log.entityId,
    log.permission ?? null,
    log.reason ?? null,
    log.result ?? null,
    log.correlationId ?? null,
    log.causationId ?? null,
    log.classification ?? null,
    log.before ?? null,
    log.after ?? null,
    log.metadata ?? null,
    log.context ?? null,
    log.ipAddress ?? null,
    log.deviceId ?? null,
  ]
}

export function previousUtcDayWindow(now: number): {
  windowStart: number
  windowEnd: number
} {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("L'horodatage du scellement est invalide.")
  }
  const instant = new Date(now)
  const windowEnd = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate()
  )
  return { windowStart: windowEnd - 24 * 60 * 60 * 1_000, windowEnd }
}

async function sealAuditWindow(
  ctx: MutationCtx,
  args: { windowStart: number; windowEnd: number }
) {
  assertWindow(args.windowStart, args.windowEnd)

  const existing = await ctx.db
    .query("auditSeals")
    .withIndex("by_window", (q) =>
      q.eq("windowStart", args.windowStart).eq("windowEnd", args.windowEnd)
    )
    .unique()
  if (existing) return existing._id

  const previous = await ctx.db
    .query("auditSeals")
    .withIndex("by_window_end")
    .order("desc")
    .first()
  if (previous && args.windowStart < previous.windowEnd) {
    throw new Error(
      "La chaîne d'audit ne peut être complétée que dans l'ordre chronologique."
    )
  }

  const logs = await ctx.db
    .query("auditLogs")
    .withIndex("by_createdAt", (q) =>
      q.gte("createdAt", args.windowStart).lt("createdAt", args.windowEnd)
    )
    .take(MAX_LOGS_PER_SEAL + 1)
  if (logs.length > MAX_LOGS_PER_SEAL) {
    throw new Error(
      `La fenêtre contient plus de ${MAX_LOGS_PER_SEAL} événements d'audit.`
    )
  }

  logs.sort(
    (left, right) =>
      left.createdAt - right.createdAt ||
      String(left._id).localeCompare(String(right._id))
  )
  const logsHash = hash(JSON.stringify(logs.map(canonicalLog)))
  const previousSealHash = previous?.sealHash
  const sealHash = hash(
    JSON.stringify([
      1,
      "sha256",
      args.windowStart,
      args.windowEnd,
      logs.length,
      logsHash,
      previousSealHash ?? null,
    ])
  )

  return await ctx.db.insert("auditSeals", {
    windowStart: args.windowStart,
    windowEnd: args.windowEnd,
    logCount: logs.length,
    logsHash,
    previousSealHash,
    sealHash,
    algorithm: "sha256",
    sealedAt: Date.now(),
  })
}

/**
 * Scelle une fenêtre close du journal et l'enchaîne au scellement précédent.
 * Un rejeu sur la même fenêtre renvoie le scellement existant sans le modifier.
 */
export const sealWindow = internalMutation({
  args: {
    windowStart: v.number(),
    windowEnd: v.number(),
  },
  handler: sealAuditWindow,
})

/** Scellement quotidien de la journée UTC entièrement révolue. */
export const sealPreviousUtcDay = internalMutation({
  args: {},
  handler: async (ctx) =>
    await sealAuditWindow(ctx, previousUtcDayWindow(Date.now())),
})

/** Lecture bornée de la chaîne, réservée aux administrateurs. */
export const listSeals = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES)
    const limit = args.limit ?? 25
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_SEALS_PER_PAGE
    ) {
      throw new Error(
        `La limite doit être un entier compris entre 1 et ${MAX_SEALS_PER_PAGE}.`
      )
    }
    return await ctx.db
      .query("auditSeals")
      .withIndex("by_window_end")
      .order("desc")
      .take(limit)
  },
})
