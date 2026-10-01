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

  it("produit l’état de la période close, l’envoie et calcule l’occurrence suivante", async () => {
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
    expect(result.nextRunAt).toBe(Date.parse("2026-08-03T08:00:00Z"))

    // La production du fichier est confiée à une action planifiée aussitôt.
    vi.advanceTimersByTime(1000)
    await t.finishInProgressScheduledFunctions()

    const [run, schedule, event] = await t.run(async (ctx) => [
      await ctx.db.query("reportRuns").unique(),
      await ctx.db.get(scheduleId),
      await ctx.db
        .query("outboxEvents")
        .withIndex("by_type_status", (q) => q.eq("type", "notification"))
        .unique(),
    ])
    // Les annulations historiques sont servies par l'état des remboursements,
    // sur la semaine close précédente.
    expect(run).toMatchObject({
      reportType: "remboursements",
      trigger: "programme",
      from: "2026-07-20",
      to: "2026-07-26",
      status: "produit",
      rowCount: 0,
      delivery: { recipients: ["controle@setrag.ga"], status: "envoye" },
    })
    expect(run?.storageId).toBeDefined()
    expect(schedule?.lastRunId).toBe(run?._id)
    expect(JSON.parse(event!.payload)).toMatchObject({
      kind: "scheduled_report",
      reportType: "remboursements",
      recipients: ["controle@setrag.ga"],
      simulated: true,
    })
  })

  it("permet de modifier, suspendre et réactiver une programmation", async () => {
    const t = convexTest(schema, modules)
    const manager = await asReportManager(t)
    const created = await manager.mutation(
      api.functions.reportSchedules.create,
      {
        label: "Rapport initial",
        reportType: "recettes",
        frequency: "mensuel",
        format: "pdf",
        recipients: ["direction@setrag.ga"],
        nextRunAt: Date.parse("2026-08-01T06:00:00Z"),
      }
    )

    await manager.mutation(api.functions.reportSchedules.update, {
      scheduleId: created.scheduleId,
      label: "Rapport hebdomadaire",
      reportType: "remplissage",
      frequency: "hebdomadaire",
      format: "xlsx",
      recipients: ["KPI@SETRAG.GA", "kpi@setrag.ga"],
    })
    expect(
      await t.run(async (ctx) => ctx.db.get(created.scheduleId))
    ).toMatchObject({
      frequency: "hebdomadaire",
      nextRunAt: Date.parse("2026-08-01T06:00:00Z"),
    })
    await manager.mutation(api.functions.reportSchedules.setActive, {
      scheduleId: created.scheduleId,
      isActive: false,
    })
    expect(
      await manager.query(api.functions.reportSchedules.get, {
        scheduleId: created.scheduleId,
      })
    ).toMatchObject({
      label: "Rapport hebdomadaire",
      reportType: "remplissage",
      frequency: "hebdomadaire",
      format: "xlsx",
      recipients: ["kpi@setrag.ga"],
      isActive: false,
    })

    await manager.mutation(api.functions.reportSchedules.setActive, {
      scheduleId: created.scheduleId,
      isActive: true,
    })
    expect(
      await t.run(async (ctx) => ctx.db.get(created.scheduleId))
    ).toMatchObject({ isActive: true })
  })

  it("ne replanifie pas une programmation dont l’état ne change pas", async () => {
    const t = convexTest(schema, modules)
    const manager = await asReportManager(t)
    const created = await manager.mutation(
      api.functions.reportSchedules.create,
      {
        label: "Rapport idempotent",
        reportType: "recettes",
        frequency: "quotidien",
        format: "csv",
        recipients: ["direction@setrag.ga"],
        nextRunAt: Date.parse("2026-07-28T06:00:00Z"),
      }
    )
    const before = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    )

    await manager.mutation(api.functions.reportSchedules.setActive, {
      scheduleId: created.scheduleId,
      isActive: true,
    })

    const after = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    )
    expect(after).toHaveLength(before.length)
  })

  it("peut lancer immédiatement un rapport sans modifier sa cadence", async () => {
    const t = convexTest(schema, modules)
    const manager = await asReportManager(t)
    const nextRunAt = Date.parse("2026-08-01T06:00:00Z")
    const created = await manager.mutation(
      api.functions.reportSchedules.create,
      {
        label: "Rapport à la demande",
        reportType: "ventes_canaux",
        frequency: "mensuel",
        format: "csv",
        recipients: ["direction@setrag.ga"],
        nextRunAt,
      }
    )

    const { runId } = await manager.mutation(
      api.functions.reportSchedules.runNow,
      { scheduleId: created.scheduleId }
    )
    vi.advanceTimersByTime(1000)
    await t.finishInProgressScheduledFunctions()
    const [schedule, run, events] = await t.run(async (ctx) => [
      await ctx.db.get(created.scheduleId),
      await ctx.db.get(runId),
      await ctx.db.query("outboxEvents").collect(),
    ])
    expect(schedule?.nextRunAt).toBe(nextRunAt)
    expect(schedule?.lastRunAt).toBe(Date.now() - 1000)
    expect(run).toMatchObject({
      reportType: "ventes",
      trigger: "manuel",
      status: "produit",
      from: "2026-06-27",
      to: "2026-07-26",
    })
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0]!.payload)).toMatchObject({
      kind: "scheduled_report",
      reportType: "ventes",
    })
  })
})
