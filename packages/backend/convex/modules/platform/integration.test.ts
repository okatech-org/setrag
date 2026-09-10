import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { modules } from "../../test.setup"
import {
  integrationBackoffMs,
  normalizeIntegrationError,
} from "./integrationModel"

type EventStatus = "en_attente" | "en_cours" | "envoye" | "rejete"

const upsertEndpoint = makeFunctionReference<
  "mutation",
  {
    endpointId?: Id<"integrationEndpoints">
    code: string
    name: string
    transport: "api" | "file" | "webhook"
    isActive: boolean
    maxAttempts: number
    baseBackoffMs: number
    reason: string
    correlationId: string
  },
  Id<"integrationEndpoints">
>("modules/platform/integration:upsertIntegrationEndpoint")

const enqueue = makeFunctionReference<
  "mutation",
  {
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
  },
  { eventId: Id<"integrationEvents">; duplicate: boolean }
>("modules/platform/integration:enqueueEvent")

const claimNext = makeFunctionReference<
  "mutation",
  { endpointCode?: string; now?: number },
  | ({ _id: Id<"integrationEvents">; attempts: number } & Record<
      string,
      unknown
    >)
  | null
>("modules/platform/integration:claimNextIntegrationEvent")

const failAttempt = makeFunctionReference<
  "mutation",
  {
    eventId: Id<"integrationEvents">
    error: { code: string; message: string; retryable: boolean }
    now?: number
  },
  {
    eventId: Id<"integrationEvents">
    status: EventStatus
    retry: boolean
    duplicate: boolean
    nextAttemptAt?: number
  }
>("modules/platform/integration:failIntegrationAttempt")

const acknowledge = makeFunctionReference<
  "mutation",
  {
    eventId: Id<"integrationEvents">
    receiptKey: string
    payload?: string
    correlationId: string
    now?: number
  },
  {
    eventId: Id<"integrationEvents">
    receiptId?: Id<"integrationReceipts">
    duplicate: boolean
  }
>("modules/platform/integration:acknowledgeIntegrationEvent")

const replay = makeFunctionReference<
  "mutation",
  {
    eventId: Id<"integrationEvents">
    reason: string
    correlationId: string
  },
  { eventId: Id<"integrationEvents">; replayed: true }
>("modules/platform/integration:replayIntegrationEvent")

const health = makeFunctionReference<"query", Record<string, never>>(
  "modules/platform/integration:integrationHealth"
)

const listEvents = makeFunctionReference<
  "query",
  { status?: EventStatus; endpointCode?: string; limit?: number }
>("modules/platform/integration:listIntegrationEvents")

async function seedUser(
  t: ReturnType<typeof convexTest>,
  authId: string,
  role: "admin_it" | "comptable" | "vendeur_guichet"
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function createEndpoint(
  client: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  overrides: Partial<{
    maxAttempts: number
    baseBackoffMs: number
  }> = {}
) {
  return await client.mutation(upsertEndpoint, {
    code: "SAGE",
    name: "SAGE X3",
    transport: "api",
    isActive: true,
    maxAttempts: overrides.maxAttempts ?? 3,
    baseBackoffMs: overrides.baseBackoffMs ?? 1_000,
    reason: "Configuration du connecteur comptable",
    correlationId: "CONFIG-SAGE-001",
  })
}

function eventArgs(idempotencyKey: string, now = 1_000) {
  return {
    endpointCode: "SAGE",
    type: "accounting.day.closed",
    schemaVersion: 1,
    idempotencyKey,
    entityType: "accountingDay",
    entityId: "DAY-2026-09-10",
    payload: JSON.stringify({ day: "2026-09-10", amount: 125_000 }),
    correlationId: `CORR-${idempotencyKey}`,
    now,
  }
}

describe("Modèle de reprise des intégrations", () => {
  it("borne le backoff exponentiel et normalise les erreurs", () => {
    expect(integrationBackoffMs(1_000, 1)).toBe(1_000)
    expect(integrationBackoffMs(1_000, 4)).toBe(8_000)
    expect(integrationBackoffMs(1_000_000, 20)).toBe(86_400_000)
    expect(
      normalizeIntegrationError(
        { code: " http 500 ", message: "  indisponible  ", retryable: true },
        42
      )
    ).toEqual({
      code: "HTTP_500",
      message: "indisponible",
      retryable: true,
      occurredAt: 42,
    })
  })
})

describe("Outbox d'intégration plateforme", () => {
  it("déduplique transactionnellement par destination et clé", async () => {
    const t = convexTest(schema, modules)
    const admin = await seedUser(t, "admin-integration-idempotence", "admin_it")
    await createEndpoint(admin.client)

    const first = await t.mutation(enqueue, eventArgs("DAY-001"))
    const duplicate = await t.mutation(enqueue, eventArgs("DAY-001", 9_000))

    expect(first.duplicate).toBe(false)
    expect(duplicate).toEqual({ eventId: first.eventId, duplicate: true })
    const events = await t.run((ctx) =>
      ctx.db.query("integrationEvents").collect()
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      status: "en_attente",
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: 1_000,
      correlationId: "CORR-DAY-001",
    })
  })

  it("réessaie avec backoff puis rejette à la borne", async () => {
    const t = convexTest(schema, modules)
    const admin = await seedUser(t, "admin-integration-backoff", "admin_it")
    await createEndpoint(admin.client, { maxAttempts: 2, baseBackoffMs: 1_000 })
    const { eventId } = await t.mutation(enqueue, eventArgs("DAY-RETRY"))

    const firstClaim = await t.mutation(claimNext, {
      endpointCode: "SAGE",
      now: 1_000,
    })
    expect(firstClaim).toMatchObject({ _id: eventId, attempts: 1 })
    const firstFailure = await t.mutation(failAttempt, {
      eventId,
      error: { code: "timeout", message: "Délai dépassé", retryable: true },
      now: 2_000,
    })
    expect(firstFailure).toMatchObject({
      status: "en_attente",
      retry: true,
      nextAttemptAt: 3_000,
    })
    await expect(
      t.mutation(claimNext, { endpointCode: "SAGE", now: 2_999 })
    ).resolves.toBeNull()

    const secondClaim = await t.mutation(claimNext, {
      endpointCode: "SAGE",
      now: 3_000,
    })
    expect(secondClaim).toMatchObject({ _id: eventId, attempts: 2 })
    const terminalFailure = await t.mutation(failAttempt, {
      eventId,
      error: { code: "HTTP 503", message: "Indisponible", retryable: true },
      now: 4_000,
    })
    expect(terminalFailure).toMatchObject({
      status: "rejete",
      retry: false,
    })
    const stored = await t.run((ctx) => ctx.db.get(eventId))
    expect(stored).toMatchObject({
      status: "rejete",
      attempts: 2,
      rejectedAt: 4_000,
      error: { code: "HTTP_503", occurredAt: 4_000 },
    })
  })

  it("acquitte une seule fois et conserve un reçu", async () => {
    const t = convexTest(schema, modules)
    const admin = await seedUser(t, "admin-integration-ack", "admin_it")
    await createEndpoint(admin.client)
    const { eventId } = await t.mutation(enqueue, eventArgs("DAY-ACK"))
    await t.mutation(claimNext, { now: 1_000 })

    const first = await t.mutation(acknowledge, {
      eventId,
      receiptKey: "SAGE-ACK-001",
      payload: JSON.stringify({ accepted: true }),
      correlationId: "ACK-001",
      now: 2_000,
    })
    const duplicate = await t.mutation(acknowledge, {
      eventId,
      receiptKey: "SAGE-ACK-001",
      correlationId: "ACK-001-RETRY",
      now: 3_000,
    })

    expect(first.duplicate).toBe(false)
    expect(duplicate).toEqual({
      eventId,
      receiptId: first.receiptId,
      duplicate: true,
    })
    await expect(
      t.mutation(acknowledge, {
        eventId,
        receiptKey: "SAGE-ACK-CONFLICT",
        correlationId: "ACK-001-CONFLICT",
        now: 4_000,
      })
    ).rejects.toThrow("déjà été acquitté avec une autre clé")
    const state = await t.run(async (ctx) => ({
      event: await ctx.db.get(eventId),
      receipts: await ctx.db.query("integrationReceipts").collect(),
    }))
    expect(state.event).toMatchObject({ status: "envoye", sentAt: 2_000 })
    expect(state.receipts).toHaveLength(1)
  })

  it("protège la supervision et réserve le rejeu à l'admin technique", async () => {
    const t = convexTest(schema, modules)
    const admin = await seedUser(t, "admin-integration-replay", "admin_it")
    const accountant = await seedUser(t, "accountant-integration", "comptable")
    const seller = await seedUser(t, "seller-integration", "vendeur_guichet")
    await createEndpoint(admin.client, { maxAttempts: 1 })
    const { eventId } = await t.mutation(enqueue, eventArgs("DAY-REPLAY"))
    await t.mutation(claimNext, { now: 1_000 })
    await t.mutation(failAttempt, {
      eventId,
      error: { code: "REJECTED", message: "Rejet distant", retryable: false },
      now: 2_000,
    })

    await expect(accountant.client.query(health, {})).resolves.toMatchObject({
      totals: { rejete: 1 },
      endpoints: [{ code: "SAGE", lastError: "Rejet distant" }],
    })
    await expect(
      accountant.client.query(listEvents, { status: "rejete", limit: 10 })
    ).resolves.toMatchObject({ events: [{ _id: eventId }] })
    await expect(seller.client.query(health, {})).rejects.toThrow("ne peut pas")
    await expect(
      accountant.client.mutation(replay, {
        eventId,
        reason: "Correction de la destination",
        correlationId: "REPLAY-DAY-001",
      })
    ).rejects.toThrow("ne peut pas")

    await expect(
      admin.client.mutation(replay, {
        eventId,
        reason: "Correction de la destination",
        correlationId: "REPLAY-DAY-001",
      })
    ).resolves.toEqual({ eventId, replayed: true })
    const state = await t.run(async (ctx) => ({
      event: await ctx.db.get(eventId),
      logs: await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (builder) =>
          builder.eq("entityTable", "integrationEvents").eq("entityId", eventId)
        )
        .collect(),
    }))
    expect(state.event).toMatchObject({
      status: "en_attente",
      attempts: 0,
      correlationId: "REPLAY-DAY-001",
      causationId: "CORR-DAY-REPLAY",
    })
    expect(state.logs[state.logs.length - 1]?.action).toBe(
      "plateforme.integration.evenement.rejouer"
    )
  })
})
