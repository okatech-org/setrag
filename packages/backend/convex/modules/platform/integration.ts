import { v } from "convex/values"

import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../../_generated/server"
import type { Doc, Id } from "../../_generated/dataModel"
import { audit, requirePermission } from "../../lib/auth"
import {
  integrationBackoffMs,
  normalizeIntegrationError,
  shouldRejectIntegrationEvent,
  type IntegrationErrorInput,
} from "./integrationModel"

const transportValidator = v.union(
  v.literal("api"),
  v.literal("file"),
  v.literal("webhook")
)

const eventStatusValidator = v.union(
  v.literal("en_attente"),
  v.literal("en_cours"),
  v.literal("envoye"),
  v.literal("rejete")
)

const errorValidator = v.object({
  code: v.string(),
  message: v.string(),
  retryable: v.boolean(),
})

const MAX_LIST_LIMIT = 100
const HEALTH_SAMPLE_LIMIT = 1_000

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maxLength} caractères.`
    )
  }
  return normalized
}

function normalizedEndpointCode(value: string): string {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    throw new Error(
      "Le code d'intégration doit contenir 2 à 40 lettres, chiffres, tirets ou soulignés."
    )
  }
  return code
}

function positiveInteger(
  value: number,
  label: string,
  maximum: number
): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(
      `${label} doit être un entier compris entre 1 et ${maximum}.`
    )
  }
  return value
}

function validSchemaVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("La version de schéma doit être un entier positif.")
  }
  return value
}

function validTimestamp(value: number | undefined): number {
  if (value === undefined) return Date.now()
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("L'horodatage est invalide.")
  }
  return value
}

function jsonPayload(value: string, label = "Le payload"): string {
  const payload = requiredText(value, label, 250_000)
  try {
    JSON.parse(payload)
  } catch {
    throw new Error(`${label} doit être une chaîne JSON valide.`)
  }
  return payload
}

async function endpointByCode(ctx: MutationCtx, code: string) {
  return await ctx.db
    .query("integrationEndpoints")
    .withIndex("by_code", (builder) => builder.eq("code", code))
    .unique()
}

export type EnqueueIntegrationEventArgs = {
  endpointCode: string
  type: string
  schemaVersion: number
  idempotencyKey: string
  entityType: string
  entityId: string
  payload: string
  correlationId: string
  causationId?: string
  now?: number
}

/**
 * Ajoute un événement dans la transaction métier courante. Une même clé ne
 * peut produire qu'un événement par destination.
 */
export async function enqueueIntegrationEvent(
  ctx: MutationCtx,
  args: EnqueueIntegrationEventArgs
): Promise<{ eventId: Id<"integrationEvents">; duplicate: boolean }> {
  const endpointCode = normalizedEndpointCode(args.endpointCode)
  const endpoint = await endpointByCode(ctx, endpointCode)
  if (!endpoint) {
    throw new Error(`Destination d'intégration ${endpointCode} introuvable.`)
  }

  const idempotencyKey = requiredText(
    args.idempotencyKey,
    "La clé d'idempotence",
    200
  )
  const existing = await ctx.db
    .query("integrationEvents")
    .withIndex("by_endpoint_idempotency", (builder) =>
      builder
        .eq("endpointId", endpoint._id)
        .eq("idempotencyKey", idempotencyKey)
    )
    .unique()
  if (existing) return { eventId: existing._id, duplicate: true }
  if (!endpoint.isActive) {
    throw new Error(
      `La destination d'intégration ${endpointCode} est inactive.`
    )
  }

  const now = validTimestamp(args.now)
  const values = {
    endpointId: endpoint._id,
    type: requiredText(args.type, "Le type d'événement", 160),
    schemaVersion: validSchemaVersion(args.schemaVersion),
    idempotencyKey,
    entityType: requiredText(args.entityType, "Le type d'entité", 120),
    entityId: requiredText(args.entityId, "L'identifiant d'entité", 200),
    payload: jsonPayload(args.payload),
    status: "en_attente" as const,
    attempts: 0,
    maxAttempts: endpoint.maxAttempts,
    nextAttemptAt: now,
    correlationId: requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    ),
    causationId: args.causationId
      ? requiredText(args.causationId, "L'identifiant de causalité", 120)
      : undefined,
    createdAt: now,
    updatedAt: now,
  }
  const eventId = await ctx.db.insert("integrationEvents", values)
  return { eventId, duplicate: false }
}

/** Point d'entrée interne pour les producteurs hors transaction métier. */
export const enqueueEvent = internalMutation({
  args: {
    endpointCode: v.string(),
    type: v.string(),
    schemaVersion: v.number(),
    idempotencyKey: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    payload: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: enqueueIntegrationEvent,
})

export const upsertIntegrationEndpoint = mutation({
  args: {
    endpointId: v.optional(v.id("integrationEndpoints")),
    code: v.string(),
    name: v.string(),
    transport: transportValidator,
    isActive: v.boolean(),
    maxAttempts: v.number(),
    baseBackoffMs: v.number(),
    reason: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "integrations", "modifier")
    const code = normalizedEndpointCode(args.code)
    const reason = requiredText(args.reason, "Le motif", 500)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const maxAttempts = positiveInteger(
      args.maxAttempts,
      "Le nombre maximal de tentatives",
      50
    )
    const baseBackoffMs = positiveInteger(
      args.baseBackoffMs,
      "Le délai de reprise",
      24 * 60 * 60 * 1_000
    )
    const existing = args.endpointId
      ? await ctx.db.get(args.endpointId)
      : await ctx.db
          .query("integrationEndpoints")
          .withIndex("by_code", (builder) => builder.eq("code", code))
          .unique()
    if (args.endpointId && !existing) {
      throw new Error("Destination d'intégration introuvable.")
    }
    const conflicting = await ctx.db
      .query("integrationEndpoints")
      .withIndex("by_code", (builder) => builder.eq("code", code))
      .unique()
    if (conflicting && conflicting._id !== existing?._id) {
      throw new Error(`La destination d'intégration ${code} existe déjà.`)
    }

    const now = Date.now()
    const values = {
      code,
      name: requiredText(args.name, "Le nom", 160),
      transport: args.transport,
      isActive: args.isActive,
      maxAttempts,
      baseBackoffMs,
      updatedBy: actor._id,
      updatedAt: now,
    }
    const endpointId = existing
      ? existing._id
      : await ctx.db.insert("integrationEndpoints", {
          ...values,
          createdBy: actor._id,
          createdAt: now,
        })
    if (existing) await ctx.db.patch(existing._id, values)

    await audit(ctx, {
      actorId: actor._id,
      action: existing
        ? "plateforme.integration.destination.modifier"
        : "plateforme.integration.destination.creer",
      entityTable: "integrationEndpoints",
      entityId: endpointId,
      permission: "modifier",
      reason,
      correlationId,
      classification: "interne",
      before: existing,
      after: values,
      metadata: { reason, correlationId },
    })
    return endpointId
  },
})

async function claimEvent(
  ctx: MutationCtx,
  event: Doc<"integrationEvents">,
  now: number
) {
  if (event.status !== "en_attente" || event.nextAttemptAt > now) return null
  if (event.attempts >= event.maxAttempts) {
    await ctx.db.patch(event._id, {
      status: "rejete",
      rejectedAt: now,
      updatedAt: now,
      error: normalizeIntegrationError(
        {
          code: "ATTEMPTS_EXHAUSTED",
          message: "Le nombre maximal de tentatives est atteint.",
          retryable: false,
        },
        now
      ),
    })
    return null
  }

  const attempts = event.attempts + 1
  await ctx.db.patch(event._id, {
    status: "en_cours",
    attempts,
    error: undefined,
    updatedAt: now,
  })
  return {
    ...event,
    status: "en_cours" as const,
    attempts,
    error: undefined,
    updatedAt: now,
  }
}

/** Réserve atomiquement le prochain événement éligible, sans appel réseau. */
export const claimNextIntegrationEvent = internalMutation({
  args: {
    endpointCode: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = validTimestamp(args.now)
    if (args.endpointCode) {
      const endpoint = await endpointByCode(
        ctx,
        normalizedEndpointCode(args.endpointCode)
      )
      if (!endpoint || !endpoint.isActive) return null
      const event = await ctx.db
        .query("integrationEvents")
        .withIndex("by_endpoint_status_created", (builder) =>
          builder.eq("endpointId", endpoint._id).eq("status", "en_attente")
        )
        .filter((builder) => builder.lte(builder.field("nextAttemptAt"), now))
        .order("asc")
        .first()
      return event ? await claimEvent(ctx, event, now) : null
    }

    const due = await ctx.db
      .query("integrationEvents")
      .withIndex("by_status_next_attempt", (builder) =>
        builder.eq("status", "en_attente").lte("nextAttemptAt", now)
      )
      .take(MAX_LIST_LIMIT)
    for (const event of due) {
      const endpoint = await ctx.db.get(event.endpointId)
      if (endpoint?.isActive) return await claimEvent(ctx, event, now)
    }
    return null
  },
})

export const acknowledgeIntegrationEvent = internalMutation({
  args: {
    eventId: v.id("integrationEvents"),
    receiptKey: v.string(),
    payload: v.optional(v.string()),
    correlationId: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Événement d'intégration introuvable.")
    const receiptKey = requiredText(
      args.receiptKey,
      "La clé d'acquittement",
      200
    )
    const existingReceipt = await ctx.db
      .query("integrationReceipts")
      .withIndex("by_event", (builder) => builder.eq("eventId", event._id))
      .unique()
    if (event.status === "envoye") {
      if (!existingReceipt) {
        throw new Error("L'événement envoyé ne possède aucun acquittement.")
      }
      if (existingReceipt.receiptKey !== receiptKey) {
        throw new Error("L'événement a déjà été acquitté avec une autre clé.")
      }
      return {
        eventId: event._id,
        receiptId: existingReceipt._id,
        duplicate: true,
      }
    }
    if (event.status !== "en_cours") {
      throw new Error("Seul un événement en cours peut être acquitté.")
    }
    if (existingReceipt) {
      throw new Error("L'événement possède déjà un acquittement incohérent.")
    }

    const conflictingReceipt = await ctx.db
      .query("integrationReceipts")
      .withIndex("by_endpoint_receipt", (builder) =>
        builder.eq("endpointId", event.endpointId).eq("receiptKey", receiptKey)
      )
      .unique()
    if (conflictingReceipt) {
      throw new Error("Cette clé d'acquittement est déjà utilisée.")
    }

    const now = validTimestamp(args.now)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const receiptId = await ctx.db.insert("integrationReceipts", {
      eventId: event._id,
      endpointId: event.endpointId,
      receiptKey,
      payload:
        args.payload === undefined
          ? undefined
          : jsonPayload(args.payload, "Le payload d'acquittement"),
      correlationId,
      receivedAt: now,
    })
    await ctx.db.patch(event._id, {
      status: "envoye",
      error: undefined,
      sentAt: now,
      updatedAt: now,
    })
    return { eventId: event._id, receiptId, duplicate: false }
  },
})

export const failIntegrationAttempt = internalMutation({
  args: {
    eventId: v.id("integrationEvents"),
    error: errorValidator,
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Événement d'intégration introuvable.")
    if (event.status === "envoye" || event.status === "rejete") {
      return {
        eventId: event._id,
        status: event.status,
        retry: false,
        duplicate: true,
      }
    }
    if (event.status !== "en_cours") {
      throw new Error("Seul un événement en cours peut échouer.")
    }

    const endpoint = await ctx.db.get(event.endpointId)
    if (!endpoint) throw new Error("Destination d'intégration introuvable.")
    const now = validTimestamp(args.now)
    const error = normalizeIntegrationError(
      args.error as IntegrationErrorInput,
      now
    )
    const rejected = shouldRejectIntegrationEvent({
      attempts: event.attempts,
      maxAttempts: event.maxAttempts,
      retryable: error.retryable,
    })
    if (rejected) {
      await ctx.db.patch(event._id, {
        status: "rejete",
        error,
        rejectedAt: now,
        updatedAt: now,
      })
      return {
        eventId: event._id,
        status: "rejete" as const,
        retry: false,
        duplicate: false,
      }
    }

    const nextAttemptAt =
      now + integrationBackoffMs(endpoint.baseBackoffMs, event.attempts)
    await ctx.db.patch(event._id, {
      status: "en_attente",
      error,
      nextAttemptAt,
      updatedAt: now,
    })
    return {
      eventId: event._id,
      status: "en_attente" as const,
      retry: true,
      duplicate: false,
      nextAttemptAt,
    }
  },
})

export const replayIntegrationEvent = mutation({
  args: {
    eventId: v.id("integrationEvents"),
    reason: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "integrations", "modifier")
    const reason = requiredText(args.reason, "Le motif", 500)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Événement d'intégration introuvable.")
    if (event.status !== "rejete") {
      throw new Error("Seul un événement rejeté peut être rejoué.")
    }
    const endpoint = await ctx.db.get(event.endpointId)
    if (!endpoint?.isActive) {
      throw new Error("La destination d'intégration est absente ou inactive.")
    }

    const now = Date.now()
    const after = {
      status: "en_attente" as const,
      attempts: 0,
      maxAttempts: endpoint.maxAttempts,
      nextAttemptAt: now,
      error: undefined,
      rejectedAt: undefined,
      sentAt: undefined,
      causationId: event.correlationId,
      correlationId,
      updatedAt: now,
    }
    await ctx.db.patch(event._id, after)
    await audit(ctx, {
      actorId: actor._id,
      action: "plateforme.integration.evenement.rejouer",
      entityTable: "integrationEvents",
      entityId: event._id,
      permission: "modifier",
      reason,
      correlationId,
      causationId: event.correlationId,
      classification: "interne",
      before: event,
      after,
      metadata: { reason, correlationId },
    })
    return { eventId: event._id, replayed: true as const }
  },
})

export const listIntegrationEvents = query({
  args: {
    status: v.optional(eventStatusValidator),
    endpointCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "integrations", "consulter")
    const limit = Math.min(
      MAX_LIST_LIMIT,
      positiveInteger(args.limit ?? 50, "La limite", MAX_LIST_LIMIT)
    )
    let endpoint: Doc<"integrationEndpoints"> | null = null
    if (args.endpointCode) {
      endpoint = await ctx.db
        .query("integrationEndpoints")
        .withIndex("by_code", (builder) =>
          builder.eq("code", normalizedEndpointCode(args.endpointCode!))
        )
        .unique()
      if (!endpoint) return { events: [], limit }
    }

    const events = endpoint
      ? args.status
        ? await ctx.db
            .query("integrationEvents")
            .withIndex("by_endpoint_status_created", (builder) =>
              builder.eq("endpointId", endpoint!._id).eq("status", args.status!)
            )
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("integrationEvents")
            .withIndex("by_endpoint_created", (builder) =>
              builder.eq("endpointId", endpoint!._id)
            )
            .order("desc")
            .take(limit)
      : args.status
        ? await ctx.db
            .query("integrationEvents")
            .withIndex("by_status_next_attempt", (builder) =>
              builder.eq("status", args.status!)
            )
            .order("desc")
            .take(limit)
        : await ctx.db.query("integrationEvents").order("desc").take(limit)

    const endpointCache = new Map<
      string,
      Pick<Doc<"integrationEndpoints">, "code" | "name" | "transport"> | null
    >()
    const enriched = await Promise.all(
      events.map(async (event) => {
        const key = event.endpointId as string
        if (!endpointCache.has(key)) {
          const destination = await ctx.db.get(event.endpointId)
          endpointCache.set(
            key,
            destination
              ? {
                  code: destination.code,
                  name: destination.name,
                  transport: destination.transport,
                }
              : null
          )
        }
        return { ...event, endpoint: endpointCache.get(key) ?? null }
      })
    )
    return { events: enriched, limit }
  },
})

type StatusCounts = Record<Doc<"integrationEvents">["status"], number>

function emptyStatusCounts(): StatusCounts {
  return { en_attente: 0, en_cours: 0, envoye: 0, rejete: 0 }
}

export const integrationHealth = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "integrations", "consulter")
    const generatedAt = Date.now()
    const endpointsPage = await ctx.db
      .query("integrationEndpoints")
      .take(MAX_LIST_LIMIT + 1)
    const statusPages = await Promise.all(
      (["en_attente", "en_cours", "envoye", "rejete"] as const).map(
        async (status) => ({
          status,
          events: await ctx.db
            .query("integrationEvents")
            .withIndex("by_status_next_attempt", (builder) =>
              builder.eq("status", status)
            )
            .take(HEALTH_SAMPLE_LIMIT + 1),
        })
      )
    )
    const truncated =
      endpointsPage.length > MAX_LIST_LIMIT ||
      statusPages.some(({ events }) => events.length > HEALTH_SAMPLE_LIMIT)
    const endpoints = endpointsPage.slice(0, MAX_LIST_LIMIT)
    const events = statusPages.flatMap(({ events: rows }) =>
      rows.slice(0, HEALTH_SAMPLE_LIMIT)
    )

    const totals = emptyStatusCounts()
    let due = 0
    let oldestPendingAgeMs: number | null = null
    for (const event of events) {
      totals[event.status] += 1
      if (event.status === "en_attente") {
        if (event.nextAttemptAt <= generatedAt) due += 1
        const age = Math.max(0, generatedAt - event.createdAt)
        oldestPendingAgeMs = Math.max(oldestPendingAgeMs ?? 0, age)
      }
    }

    const endpointHealth = endpoints.map((endpoint) => {
      const ownEvents = events.filter(
        (event) => event.endpointId === endpoint._id
      )
      const counts = emptyStatusCounts()
      let endpointDue = 0
      let endpointOldestPendingAgeMs: number | null = null
      let lastError: string | null = null
      let lastErrorAt = -1
      for (const event of ownEvents) {
        counts[event.status] += 1
        if (event.status === "en_attente") {
          if (event.nextAttemptAt <= generatedAt) endpointDue += 1
          const age = Math.max(0, generatedAt - event.createdAt)
          endpointOldestPendingAgeMs = Math.max(
            endpointOldestPendingAgeMs ?? 0,
            age
          )
        }
        if (event.error && event.error.occurredAt > lastErrorAt) {
          lastErrorAt = event.error.occurredAt
          lastError = event.error.message
        }
      }
      return {
        endpointId: endpoint._id,
        code: endpoint.code,
        name: endpoint.name,
        transport: endpoint.transport,
        isActive: endpoint.isActive,
        maxAttempts: endpoint.maxAttempts,
        counts,
        due: endpointDue,
        oldestPendingAgeMs: endpointOldestPendingAgeMs,
        lastError,
      }
    })

    return {
      generatedAt,
      truncated,
      totals,
      due,
      oldestPendingAgeMs,
      endpoints: endpointHealth,
    }
  },
})
