import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import { addDays, toServiceDate } from "../model/calendar"
import { DEMO_TRIP_HORIZON_DAYS } from "./demo"

describe("seed des dessertes de démonstration", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("refuse de peupler un environnement sans mode démo", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(internal.seeds.demo.run, { withActivity: false })
    ).rejects.toThrow(/DEMO_ACCOUNTS_ENABLED/)
  })

  it("crée chaque jour un trajet dans les deux sens avec toutes les gares", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-28T08:00:00.000Z"))
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    const report = await t.mutation(internal.seeds.demo.run, {
      days: 2,
      withActivity: false,
    })
    expect(report.trips).toBe(2)
    expect(report.tripsScheduled).toBe(4)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const today = toServiceDate(Date.now())
    const [stations, trips, stops] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.query("stations").collect(),
        ctx.db.query("trips").collect(),
        ctx.db.query("tripStops").collect(),
      ])
    )
    expect(trips).toHaveLength(6)
    expect(new Set(trips.map((trip) => trip.serviceDate))).toEqual(
      new Set([today, addDays(today, 1), addDays(today, 2)])
    )

    for (const date of [today, addDays(today, 1), addDays(today, 2)]) {
      const daily = trips.filter((trip) => trip.serviceDate === date)
      expect(daily).toHaveLength(2)
      expect(
        daily.map((trip) => [
          stations.find((station) => station._id === trip.originStationId)
            ?.code,
          stations.find((station) => station._id === trip.destinationStationId)
            ?.code,
        ])
      ).toEqual([
        ["OWE", "FCV"],
        ["FCV", "OWE"],
      ])
      for (const trip of daily) {
        expect(stops.filter((stop) => stop.tripId === trip._id)).toHaveLength(
          stations.length
        )
      }
    }

    const andem = stations.find((station) => station.code === "AND")!
    const lifouta = stations.find((station) => station.code === "LIF")!
    const date = addDays(today, 2)
    const [outbound, inbound] = await Promise.all([
      t.query(api.functions.trips.search, {
        originStationId: andem._id,
        destinationStationId: lifouta._id,
        serviceDate: date,
      }),
      t.query(api.functions.trips.search, {
        originStationId: lifouta._id,
        destinationStationId: andem._id,
        serviceDate: date,
      }),
    ])
    expect(outbound).toHaveLength(1)
    expect(inbound).toHaveLength(1)
    expect(outbound[0]?.hasAvailability).toBe(true)
    expect(inbound[0]?.hasAvailability).toBe(true)
  })

  it("maintient automatiquement une date vendable à J+62", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-28T08:00:00.000Z"))
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    await t.mutation(internal.seeds.demo.run, {
      days: 1,
      withActivity: false,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const result = await t.mutation(internal.seeds.demo.topUpTripHorizon, {})
    if (!("date" in result)) throw new Error("Horizon de démo absent")
    expect(result.date).toBe(
      addDays(toServiceDate(Date.now()), DEMO_TRIP_HORIZON_DAYS)
    )
    expect(result.trips).toBe(2)

    const horizonTrips = await t.run(async (ctx) =>
      ctx.db.query("trips").collect()
    )
    expect(
      horizonTrips.some(
        (trip) =>
          trip.serviceDate ===
          addDays(toServiceDate(Date.now()), DEMO_TRIP_HORIZON_DAYS)
      )
    ).toBe(true)
  })
})
