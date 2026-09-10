import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import appSchema from "../../schema"
import { modules } from "../../test.setup"
import type { CotrafDashboard } from "./model"

type ProvisionResult = {
  datasetId: GenericId<"cotrafDatasets">
  datasetKey: string
  dataOrigin: "synthetic_demo"
  movements: number
  segments: number
  events: number
  conflictsExpected: number
  pkRange: { from: number; to: number }
  created: boolean
}

const provision = makeFunctionReference<
  "mutation",
  Record<string, never>,
  ProvisionResult
>("seeds/cotrafDemo:provision")

const dashboard = makeFunctionReference<
  "query",
  Record<string, never>,
  CotrafDashboard
>("modules/cotraf/queries:dashboard")

type TestInstance = ReturnType<typeof convexTest>

async function seedStations(t: TestInstance) {
  const definitions = [
    ["OWE", "Owendo Virié", "Estuaire", 0],
    ["NDJ", "Ndjolé", "Moyen-Ogooué", 182],
    ["BOO", "Booué", "Ogooué-Ivindo", 338],
    ["MOA", "Moanda", "Haut-Ogooué", 619],
    ["FCV", "Franceville", "Haut-Ogooué", 669],
  ] as const

  return await t.run(async (ctx) => {
    const ids = new Map<string, Id<"stations">>()
    for (const [code, name, province, kilometerPoint] of definitions) {
      const id = await ctx.db.insert("stations", {
        code,
        name,
        province,
        kilometerPoint,
        isEquipped: true,
        isActive: true,
      })
      ids.set(code, id)
    }
    const owe = ids.get("OWE")
    const ndj = ids.get("NDJ")
    const boo = ids.get("BOO")
    const moa = ids.get("MOA")
    const fcv = ids.get("FCV")
    if (!owe || !ndj || !boo || !moa || !fcv) {
      throw new Error("Référentiel COTRAF incomplet dans le test")
    }
    return { OWE: owe, NDJ: ndj, BOO: boo, MOA: moa, FCV: fcv }
  })
}

async function seedUser(
  t: TestInstance,
  authId: string,
  role: "regulateur_cotraf" | "vendeur_guichet"
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

async function activateCotraf(t: TestInstance, changedBy: Id<"users">) {
  await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "cotraf",
      environment: "test",
      isEnabled: true,
      reason: "Test COTRAF",
      correlationId: `cotraf-${Math.random()}`,
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

describe("Projection persistante COTRAF", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("refuse le peuplement hors environnement de démonstration", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(appSchema, modules)

    await expect(t.mutation(provision, {})).rejects.toThrow(
      "DEMO_ACCOUNTS_ENABLED doit valoir true"
    )
  })

  it("reste désactivé tant qu'une activation COTRAF n'est pas persistée", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    const { client } = await seedUser(t, "cotraf-disabled", "regulateur_cotraf")

    await expect(client.query(dashboard, {})).rejects.toThrow(
      "Module désactivé : cotraf"
    )
  })

  it("provisionne quatre circulations sans duplication et expose un conflit illustratif", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    await seedStations(t)
    const { userId, client } = await seedUser(
      t,
      "cotraf-global",
      "regulateur_cotraf"
    )
    await activateCotraf(t, userId)

    const first = await t.mutation(provision, {})
    const second = await t.mutation(provision, {})
    expect(first).toMatchObject({
      dataOrigin: "synthetic_demo",
      movements: 4,
      segments: 4,
      events: 4,
      conflictsExpected: 1,
      pkRange: { from: 0, to: 669 },
      created: true,
    })
    expect(second).toEqual({ ...first, created: false })

    const result = await client.query(dashboard, {})
    expect(result).toMatchObject({
      moduleCode: "cotraf",
      dataState: "synthetic_demo",
      accessibleSiteIds: [],
      dataset: {
        key: "setrag-cotraf-synthetic-2026-09-10-v1",
        dataOrigin: "synthetic_demo",
      },
    })
    expect(result.dataset?.notice).toContain("entièrement synthétique")
    expect(result.dataset?.pkConvention).toContain("à valider")
    expect(result.stations.map((station) => station.kilometerPoint)).toEqual([
      0, 182, 338, 619, 669,
    ])
    expect(result.movements).toHaveLength(4)
    expect(result.segments).toHaveLength(4)
    expect(result.events).toHaveLength(4)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      fromStationCode: "NDJ",
      toStationCode: "BOO",
      severity: "critical",
    })
    expect(new Set(result.conflicts[0]?.trainNumbers)).toEqual(
      new Set(["PAX-101", "MIN-704"])
    )
    expect(
      result.kpis.find((kpi) => kpi.code === "conflits_detectes")
    ).toMatchObject({ value: 1, unit: "conflits", tone: "critical" })

    const counts = await t.run(async (ctx) => ({
      datasets: (await ctx.db.query("cotrafDatasets").collect()).length,
      movements: (await ctx.db.query("cotrafMovements").collect()).length,
      segments: (await ctx.db.query("cotrafSegments").collect()).length,
      events: (await ctx.db.query("cotrafEvents").collect()).length,
    }))
    expect(counts).toEqual({
      datasets: 1,
      movements: 4,
      segments: 4,
      events: 4,
    })
  })

  it("filtre circulations, sections et événements selon les sites accessibles", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    const stations = await seedStations(t)
    const administrator = await seedUser(
      t,
      "cotraf-activation-admin",
      "regulateur_cotraf"
    )
    const scoped = await seedUser(t, "cotraf-scoped", "vendeur_guichet")
    await activateCotraf(t, administrator.userId)
    await t.mutation(provision, {})

    const francevilleStationId = stations.FCV
    const siteId = await t.run(async (ctx) => {
      const now = Date.now()
      const organizationId = await ctx.db.insert("organizations", {
        code: "ORG-FCV-COTRAF",
        name: "Organisation COTRAF Franceville",
        type: "direction",
        isActive: true,
        createdBy: administrator.userId,
        createdAt: now,
        updatedAt: now,
      })
      const createdSiteId = await ctx.db.insert("sites", {
        code: "FCV",
        name: "Franceville",
        type: "gare",
        organizationId,
        stationId: francevilleStationId,
        isActive: true,
        createdBy: administrator.userId,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert("userAssignments", {
        userId: scoped.userId,
        role: "regulateur_cotraf",
        organizationId,
        siteId: createdSiteId,
        validFrom: now - 1_000,
        isActive: true,
        createdBy: administrator.userId,
        createdAt: now,
        updatedAt: now,
      })
      return createdSiteId
    })

    const result = await scoped.client.query(dashboard, {})
    expect(result.accessibleSiteIds).toEqual([siteId])
    expect(
      result.movements.map((movement) => movement.trainNumber).sort()
    ).toEqual(["PAX-101", "SRV-002"])
    expect(result.segments.map((segment) => segment.segmentCode)).toEqual([
      "DEMO-SEG-MOA-FCV",
    ])
    expect(result.events.map((event) => event.eventCode)).toEqual([
      "DEMO-EVT-OTR-SRV-002",
    ])
    expect(result.conflicts).toEqual([])
  })
})
