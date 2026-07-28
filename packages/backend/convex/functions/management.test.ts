import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"

async function asAdmin(t: ReturnType<typeof convexTest>) {
  const authId = `admin-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Mireille",
      lastName: "NZENG",
      role: "admin_fonctionnel",
      identitySource: "local",
      isActive: true,
    })
  )
  return { client: t.withIdentity({ subject: authId }), userId }
}

describe("Actions de gestion", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("crée une grille soumise à validation avec sa base", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)
    const scheduleId = await client.mutation(
      api.functions.management.createFareSchedule,
      {
        label: "Grille rentrée",
        validFrom: Date.parse("2026-09-01T00:00:00Z"),
        validUntil: Date.parse("2026-12-31T23:59:59Z"),
        vatPct: 18,
        cssPct: 0,
        trainType: "EXPRESS",
        serviceClass: "DEUXIEME",
        shortDistanceRate: 38,
        longDistanceRate: 34,
      }
    )

    const schedule = await t.run((ctx) => ctx.db.get(scheduleId))
    const bases = await t.run((ctx) =>
      ctx.db
        .query("fareBases")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
        .collect()
    )
    expect(schedule?.status).toBe("a_valider")
    expect(bases).toMatchObject([
      { shortDistanceRate: 38, longDistanceRate: 34 },
    ])
  })

  it("persiste le paramétrage métier et le restitue", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)
    await client.mutation(api.functions.management.saveSettings, {
      vatPct: 18,
      cssPct: 1,
      seatHoldMinutes: 20,
      mobilePaymentAttempts: 4,
      degradedSalesEnabled: false,
      cashVarianceNotificationsEnabled: true,
    })

    expect(
      await client.query(api.functions.management.getSettings, {})
    ).toMatchObject({
      vatPct: 18,
      cssPct: 1,
      seatHoldMinutes: 20,
      mobilePaymentAttempts: 4,
      degradedSalesEnabled: false,
    })
  })

  it("transmet une demande de reprise sans contourner la séparation des tâches", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)
    await t.run((ctx) =>
      ctx.db.insert("outboxEvents", {
        type: "notification",
        entityId: "demo",
        payload: "{}",
        status: "echec",
        attempts: 2,
        lastError: "Passerelle indisponible",
        createdAt: Date.now(),
      })
    )

    expect(
      await client.mutation(
        api.functions.management.retryIntegrationFailures,
        {}
      )
    ).toEqual({ count: 1, requested: true })
    const events = await t.run((ctx) => ctx.db.query("outboxEvents").collect())
    expect(events).toHaveLength(2)
    expect(events.find((event) => event.status === "echec")).toBeDefined()
    expect(
      events.find(
        (event) =>
          JSON.parse(event.payload).kind === "integration_retry_request"
      )
    ).toMatchObject({ type: "notification", status: "en_attente" })
  })

  it("nomme précisément la configuration d’annuaire manquante", async () => {
    vi.stubEnv("ERAMET_DIRECTORY_SYNC_URL", "")
    vi.stubEnv("ERAMET_DIRECTORY_SYNC_TOKEN", "")
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)

    await expect(
      client.action(api.functions.management.synchronizeDirectory, {})
    ).resolves.toEqual({
      synchronized: false,
      message: expect.stringContaining(
        "ERAMET_DIRECTORY_SYNC_URL, ERAMET_DIRECTORY_SYNC_TOKEN"
      ),
    })
  })
})
