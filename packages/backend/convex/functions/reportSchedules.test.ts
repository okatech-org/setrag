import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"

async function asReportManager(t: ReturnType<typeof convexTest>) {
  const authId = `kpi-${Math.floor(Math.random() * 1e9)}`
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Mireille",
      lastName: "NZENG",
      role: "responsable_kpi",
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return t.withIdentity({ subject: authId })
}

describe("Programmation des rapports", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-27T08:00:00Z"))
  })

  afterEach(() => vi.useRealTimers())

  it("persiste, planifie et audite le premier envoi", async () => {
    const t = convexTest(schema, modules)
    const manager = await asReportManager(t)
    const nextRunAt = Date.parse("2026-07-28T06:00:00Z")

    const result = await manager.mutation(
      api.functions.reportSchedules.create,
      {
        label: "CA quotidien",
        reportType: "ventes_canaux",
        frequency: "quotidien",
        format: "csv",
        recipients: ["DIRECTION@SETRAG.GA"],
        nextRunAt,
      }
    )

    const stored = await t.run(async (ctx) => ctx.db.get(result.scheduleId))
    expect(stored).toMatchObject({
      label: "CA quotidien",
      recipients: ["direction@setrag.ga"],
      nextRunAt,
      isActive: true,
    })
    const audit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "rapport.programmer"))
        .unique()
    )
    expect(audit?.entityId).toBe(result.scheduleId)
  })

  it("refuse une adresse invalide sans créer de programmation", async () => {
    const t = convexTest(schema, modules)
    const manager = await asReportManager(t)

    await expect(
      manager.mutation(api.functions.reportSchedules.create, {
        label: "Rapport recettes",
        reportType: "recettes",
        frequency: "hebdomadaire",
        format: "pdf",
        recipients: ["adresse-invalide"],
        nextRunAt: Date.parse("2026-07-28T06:00:00Z"),
      })
    ).rejects.toThrow("Adresse e-mail invalide")
    expect(
      await t.run(async (ctx) => ctx.db.query("reportSchedules").collect())
    ).toHaveLength(0)
  })

  it("dépose l’occurrence dans la file durable et calcule la suivante", async () => {
    const t = convexTest(schema, modules)
    const scheduleId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authId: "owner",
        role: "responsable_kpi",
        identitySource: "annuaire",
        isActive: true,
      })
      return await ctx.db.insert("reportSchedules", {
        label: "Contrôle hebdomadaire",
        reportType: "annulations",
        frequency: "hebdomadaire",
        format: "xlsx",
        recipients: ["controle@setrag.ga"],
        nextRunAt: Date.now(),
        isActive: true,
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.mutation(internal.functions.reportSchedules.run, {
      scheduleId: scheduleId as Id<"reportSchedules">,
    })
    expect(result.queued).toBe(true)
    const event = await t.run(async (ctx) =>
      ctx.db
        .query("outboxEvents")
        .withIndex("by_type_status", (q) =>
          q.eq("type", "notification").eq("status", "en_attente")
        )
        .unique()
    )
    expect(JSON.parse(event!.payload)).toMatchObject({
      kind: "scheduled_report",
      reportType: "annulations",
      recipients: ["controle@setrag.ga"],
    })
    expect(result.nextRunAt).toBe(Date.parse("2026-08-03T08:00:00Z"))
  })
})
