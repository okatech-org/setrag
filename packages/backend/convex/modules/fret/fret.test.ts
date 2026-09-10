import { defineSchema, makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import appSchema from "../../schema"
import { modules } from "../../test.setup"
import type { FretDashboard } from "./model"
import { fretTables } from "./tables"

const schema = defineSchema({ ...appSchema.tables, ...fretTables })

type ProvisionResult = {
  datasetId: GenericId<"fretDatasets">
  datasetKey: string
  dataOrigin: "synthetic_demo"
  operations: number
  alerts: number
  created: boolean
}

const provision = makeFunctionReference<
  "mutation",
  Record<string, never>,
  ProvisionResult
>("seeds/fretDemo:provision")

const dashboard = makeFunctionReference<
  "query",
  Record<string, never>,
  FretDashboard
>("modules/fret/queries:dashboard")

describe("Démonstration persistante Fret", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("refuse tout peuplement hors environnement de démonstration", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)

    await expect(t.mutation(provision, {})).rejects.toThrow(
      "DEMO_ACCOUNTS_ENABLED doit valoir true"
    )
  })

  it("provisionne quatre filières sans duplication et les expose comme synthétiques", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)

    const first = await t.mutation(provision, {})
    const second = await t.mutation(provision, {})
    expect(first).toMatchObject({
      dataOrigin: "synthetic_demo",
      operations: 4,
      alerts: 3,
      created: true,
    })
    expect(second).toEqual({ ...first, created: false })

    const actorAuthId = "fret-demo-reader"
    await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: actorAuthId,
        role: "gestionnaire_fret",
        identitySource: "local",
        isActive: true,
      })
    )

    const result = await t
      .withIdentity({ subject: actorAuthId })
      .query(dashboard, {})
    expect(result.dataState).toBe("synthetic_demo")
    expect(result.dataset).toMatchObject({
      key: "setrag-owendo-franceville-v1",
      routeLengthKm: 648,
      dataOrigin: "synthetic_demo",
    })
    expect(result.operations).toHaveLength(4)
    expect(new Set(result.operations.map((row) => row.cargoType))).toEqual(
      new Set(["manganese", "bois", "hydrocarbures", "conteneurs"])
    )
    expect(result.alerts).toHaveLength(3)
    expect(
      result.kpis.find((kpi) => kpi.code === "tonnes_en_mouvement")
    ).toMatchObject({ label: "Tonnes en mouvement", value: 11_160, unit: "t" })

    const counts = await t.run(async (ctx) => ({
      datasets: (await ctx.db.query("fretDatasets").collect()).length,
      operations: (await ctx.db.query("fretOperations").collect()).length,
      alerts: (await ctx.db.query("fretAlerts").collect()).length,
    }))
    expect(counts).toEqual({ datasets: 1, operations: 4, alerts: 3 })
  })
})
