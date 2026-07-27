import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"

/**
 * Tests de la chaîne livret horaire → dessertes → inventaire.
 *
 * L'enjeu central : une desserte engendrée doit posséder un inventaire
 * complet et cohérent. Une desserte sans inventaire serait vendable à
 * l'infini, et c'est exactement le défaut de traçabilité que le cahier des
 * charges dénonce dans l'existant.
 */

async function asRole(t: ReturnType<typeof convexTest>, role: AppRole) {
  const authId = `auth-${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return { ctx: t.withIdentity({ subject: authId }), userId }
}

/** Réseau minimal : 4 gares, donc 3 segments. */
async function seedNetwork(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const owe = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const ndj = await ctx.db.insert("stations", {
      code: "NDJ",
      name: "Ndjolé",
      province: "Moyen-Ogooué",
      kilometerPoint: 175,
      isEquipped: true,
      isActive: true,
    })
    const boo = await ctx.db.insert("stations", {
      code: "BOO",
      name: "Booué",
      province: "Ogooué-Ivindo",
      kilometerPoint: 340,
      isEquipped: true,
      isActive: true,
    })
    const fcv = await ctx.db.insert("stations", {
      code: "FCV",
      name: "Franceville",
      province: "Haut-Ogooué",
      kilometerPoint: 648,
      isEquipped: true,
      isActive: true,
    })

    const trainId = await ctx.db.insert("trains", {
      number: "TR-201",
      name: "Express",
      type: "EXPRESS",
      isActive: true,
    })
    // Une voiture 2e (2×2 = 4 places, 6 debout) et une 1re (1×2 = 2 places).
    const c1 = await ctx.db.insert("coaches", {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 2,
      columnCount: 2,
      seatCount: 4,
      standingCapacity: 6,
      position: 1,
    })
    for (const [label, row, column] of [
      ["1A", 1, 1],
      ["1B", 1, 2],
      ["2A", 2, 1],
      ["2B", 2, 2],
    ] as const) {
      await ctx.db.insert("seats", {
        coachId: c1,
        trainId,
        label,
        row,
        column,
        isActive: true,
      })
    }
    const c2 = await ctx.db.insert("coaches", {
      trainId,
      label: "V2",
      serviceClass: "PREMIERE",
      rowCount: 1,
      columnCount: 2,
      seatCount: 2,
      standingCapacity: 0,
      position: 2,
    })
    for (const [label, row, column] of [
      ["1A", 1, 1],
      ["1B", 1, 2],
    ] as const) {
      await ctx.db.insert("seats", {
        coachId: c2,
        trainId,
        label,
        row,
        column,
        isActive: true,
      })
    }
    return { owe, ndj, boo, fcv, trainId }
  })
}

/** Livret actif avec un horaire quotidien, prêt à engendrer des dessertes. */
async function seedBooklet(
  t: ReturnType<typeof convexTest>,
  net: Awaited<ReturnType<typeof seedNetwork>>,
  options: { validFrom?: number; validUntil?: number } = {}
) {
  const { ctx, userId } = await asRole(t, "admin_fonctionnel")
  const bookletId = await ctx.mutation(api.functions.booklets.create, {
    label: "Livret de test",
    validFrom: options.validFrom ?? Date.UTC(2026, 7, 14),
    validUntil: options.validUntil ?? Date.UTC(2026, 7, 16),
  })
  const scheduleId = await ctx.mutation(api.functions.booklets.addSchedule, {
    bookletId,
    trainId: net.trainId,
    departureTime: "08:00",
    daysOfWeek: [],
    stops: [
      { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
      {
        stationId: net.ndj,
        sequence: 1,
        arrivalOffsetMinutes: 200,
        departureOffsetMinutes: 210,
      },
      {
        stationId: net.boo,
        sequence: 2,
        arrivalOffsetMinutes: 380,
        departureOffsetMinutes: 395,
      },
      { stationId: net.fcv, sequence: 3, arrivalOffsetMinutes: 700 },
    ],
  })
  return { ctx, userId, bookletId, scheduleId }
}

describe("Génération d'une desserte", () => {
  it("crée la desserte, ses arrêts et tout son inventaire", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })

    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })

    expect(rapport.created).toBe(true)
    expect(rapport.stops).toBe(4)
    expect(rapport.segments).toBe(3)
    // 6 places actives réparties sur deux voitures.
    expect(rapport.seats).toBe(6)
    // 2 classes × 3 segments.
    expect(rapport.counters).toBe(6)
  })

  it("dimensionne les compteurs sur la capacité totale, places debout comprises", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect()
    )
    const deuxieme = counters.filter((c) => c.serviceClass === "DEUXIEME")
    const premiere = counters.filter((c) => c.serviceClass === "PREMIERE")

    expect(deuxieme).toHaveLength(3)
    // 4 places assises + 6 debout.
    for (const c of deuxieme) {
      expect(c.capacity).toBe(10)
      expect(c.available).toBe(10)
      expect(c.sold).toBe(0)
    }
    for (const c of premiere) {
      expect(c.capacity).toBe(2)
    }
  })

  it("initialise toutes les places à l'état libre", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })

    const occupancy = await t.run(async (c) =>
      c.db.query("seatOccupancy").collect()
    )
    expect(occupancy).toHaveLength(6)
    for (const o of occupancy) {
      expect(o.soldMask).toBe(0)
      expect(o.heldMask).toBe(0)
      expect(o.blockedMask).toBe(0)
    }
  })

  it("calcule les horaires d'arrêt depuis les décalages", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })

    const detail = await t.query(api.functions.trips.get, {
      tripId: rapport.tripId as Id<"trips">,
    })
    // Départ 08:00 locale = 07:00 UTC.
    expect(new Date(detail.trip.departureAt).getUTCHours()).toBe(7)
    // Arrivée à 700 minutes, soit 11 h 40 plus tard.
    expect(detail.trip.arrivalAt - detail.trip.departureAt).toBe(700 * 60_000)
    expect(detail.stops).toHaveLength(4)
    expect(detail.stops[1]?.arrivalAt).toBe(
      detail.trip.departureAt + 200 * 60_000
    )
  })

  it("est idempotente : rejouer ne crée pas de doublon", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })

    await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })
    const second = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })

    expect(second.created).toBe(false)
    const trips = await t.run(async (c) => c.db.query("trips").collect())
    const occupancy = await t.run(async (c) =>
      c.db.query("seatOccupancy").collect()
    )
    expect(trips).toHaveLength(1)
    expect(occupancy).toHaveLength(6)
  })

  it("refuse d'engendrer depuis un livret non actif", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { scheduleId } = await seedBooklet(t, net)
    await expect(
      t.mutation(internal.functions.trips.generateOne, {
        scheduleId,
        serviceDate: "2026-08-14",
      })
    ).rejects.toThrow(/génération refusée/)
  })
})

describe("Activation d'un livret et génération en lot", () => {
  it("planifie une desserte par jour de circulation", async () => {
    vi.useFakeTimers()
    try {
      const t = convexTest(schema, modules)
      const net = await seedNetwork(t)
      const { ctx, bookletId } = await seedBooklet(t, net)
      await ctx.mutation(api.functions.booklets.submit, { bookletId })

      const resultat = await ctx.mutation(api.functions.booklets.approve, {
        bookletId,
      })
      // Du 14 au 16 août inclus, tous les jours.
      expect(resultat.plannedTrips).toBe(3)

      await t.finishAllScheduledFunctions(vi.runAllTimers)

      const trips = await t.run(async (c) => c.db.query("trips").collect())
      expect(trips).toHaveLength(3)
      expect(trips.map((x) => x.serviceDate).sort()).toEqual([
        "2026-08-14",
        "2026-08-15",
        "2026-08-16",
      ])

      // Chaque desserte a bien son inventaire complet.
      const occupancy = await t.run(async (c) =>
        c.db.query("seatOccupancy").collect()
      )
      const counters = await t.run(async (c) =>
        c.db.query("segmentCounters").collect()
      )
      expect(occupancy).toHaveLength(3 * 6)
      expect(counters).toHaveLength(3 * 6)
    } finally {
      vi.useRealTimers()
    }
  })

  it("annonce le volume avant activation, sans rien écrire", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId } = await seedBooklet(t, net)

    const apercu = await ctx.query(api.functions.booklets.previewGeneration, {
      bookletId,
    })
    expect(apercu.total).toBe(3)
    expect(apercu.byTrain["TR-201"]).toBe(3)
    expect(apercu.exceedsLimit).toBe(false)

    const trips = await t.run(async (c) => c.db.query("trips").collect())
    expect(trips).toHaveLength(0)
  })

  it("refuse un livret qui engendrerait trop de dessertes", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    // Trois ans de circulation quotidienne dépassent le plafond.
    const { ctx, bookletId } = await seedBooklet(t, net, {
      validFrom: Date.UTC(2026, 0, 1),
      validUntil: Date.UTC(2029, 0, 1),
    })
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await expect(
      ctx.mutation(api.functions.booklets.approve, { bookletId })
    ).rejects.toThrow(/au-delà du plafond/)
  })

  it("refuse deux livrets actifs sur des périodes qui se chevauchent", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const premier = await seedBooklet(t, net)
    await premier.ctx.mutation(api.functions.booklets.submit, {
      bookletId: premier.bookletId,
    })
    await premier.ctx.mutation(api.functions.booklets.approve, {
      bookletId: premier.bookletId,
    })

    const second = await seedBooklet(t, net, {
      validFrom: Date.UTC(2026, 7, 15),
      validUntil: Date.UTC(2026, 7, 20),
    })
    await second.ctx.mutation(api.functions.booklets.submit, {
      bookletId: second.bookletId,
    })
    await expect(
      second.ctx.mutation(api.functions.booklets.approve, {
        bookletId: second.bookletId,
      })
    ).rejects.toThrow(/Chevauchement/)
  })

  it("filtre sur les jours de circulation déclarés", async () => {
    vi.useFakeTimers()
    try {
      const t = convexTest(schema, modules)
      const net = await seedNetwork(t)
      const { ctx } = await asRole(t, "admin_fonctionnel")
      const bookletId = await ctx.mutation(api.functions.booklets.create, {
        label: "Livret vendredi",
        validFrom: Date.UTC(2026, 7, 10),
        validUntil: Date.UTC(2026, 7, 23),
      })
      await ctx.mutation(api.functions.booklets.addSchedule, {
        bookletId,
        trainId: net.trainId,
        departureTime: "08:00",
        daysOfWeek: [5], // vendredi seulement
        stops: [
          { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
          { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
        ],
      })
      await ctx.mutation(api.functions.booklets.submit, { bookletId })
      const resultat = await ctx.mutation(api.functions.booklets.approve, {
        bookletId,
      })
      expect(resultat.plannedTrips).toBe(2)

      await t.finishAllScheduledFunctions(vi.runAllTimers)
      const trips = await t.run(async (c) => c.db.query("trips").collect())
      expect(trips.map((x) => x.serviceDate).sort()).toEqual([
        "2026-08-14",
        "2026-08-21",
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("Validation du livret", () => {
  it("refuse de soumettre un livret vide", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "Vide",
      validFrom: Date.UTC(2026, 7, 14),
      validUntil: Date.UTC(2026, 7, 16),
    })
    await expect(
      ctx.mutation(api.functions.booklets.submit, { bookletId })
    ).rejects.toThrow(/Livret vide/)
  })

  it("refuse une période de validité inversée", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    await expect(
      ctx.mutation(api.functions.booklets.create, {
        label: "Incohérent",
        validFrom: Date.UTC(2026, 7, 20),
        validUntil: Date.UTC(2026, 7, 10),
      })
    ).rejects.toThrow(/postérieure/)
  })

  it("gèle le livret dès la soumission", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })

    await expect(
      ctx.mutation(api.functions.booklets.addSchedule, {
        bookletId,
        trainId: net.trainId,
        departureTime: "18:00",
        daysOfWeek: [],
        stops: [
          { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
          { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
        ],
      })
    ).rejects.toThrow(/n'est plus modifiable/)
  })

  it("exige un motif pour rejeter", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await expect(
      ctx.mutation(api.functions.booklets.reject, { bookletId, reason: "  " })
    ).rejects.toThrow(/motif de rejet est obligatoire/)
  })

  it("refuse une desserte aux gares non monotones", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "Rebroussement",
      validFrom: Date.UTC(2026, 7, 14),
      validUntil: Date.UTC(2026, 7, 16),
    })
    await expect(
      ctx.mutation(api.functions.booklets.addSchedule, {
        bookletId,
        trainId: net.trainId,
        departureTime: "08:00",
        daysOfWeek: [],
        stops: [
          { stationId: net.owe, sequence: 0 },
          { stationId: net.boo, sequence: 1 },
          { stationId: net.ndj, sequence: 2 },
        ],
      })
    ).rejects.toThrow(/non monotones/)
  })

  it("refuse un train sans composition", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    const nu = await t.run(async (c) =>
      c.db.insert("trains", {
        number: "TR-999",
        name: "Sans voiture",
        type: "OMNIBUS",
        isActive: true,
      })
    )
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "Sans composition",
      validFrom: Date.UTC(2026, 7, 14),
      validUntil: Date.UTC(2026, 7, 16),
    })
    await expect(
      ctx.mutation(api.functions.booklets.addSchedule, {
        bookletId,
        trainId: nu,
        departureTime: "08:00",
        daysOfWeek: [],
        stops: [
          { stationId: net.owe, sequence: 0 },
          { stationId: net.fcv, sequence: 1 },
        ],
      })
    ).rejects.toThrow(/aucune voiture/)
  })

  it("réserve la validation aux rôles habilités", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })

    const { ctx: chefGare } = await asRole(t, "chef_gare")
    await expect(
      chefGare.mutation(api.functions.booklets.approve, { bookletId })
    ).rejects.toThrow(/Accès refusé/)
  })
})

describe("Recherche de dessertes", () => {
  async function withGeneratedTrip(t: ReturnType<typeof convexTest>) {
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })
    return { net, ctx, tripId: rapport.tripId as Id<"trips"> }
  }

  it("trouve une desserte sur le trajet complet", async () => {
    const t = convexTest(schema, modules)
    const { net } = await withGeneratedTrip(t)
    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
    })
    expect(resultats).toHaveLength(1)
    expect(resultats[0]?.distanceKm).toBe(648)
    expect(resultats[0]?.availableByClass.DEUXIEME).toBe(10)
    expect(resultats[0]?.availableByClass.PREMIERE).toBe(2)
    expect(resultats[0]?.hasAvailability).toBe(true)
  })

  it("retourne les prochains départs réellement ouverts depuis une gare", async () => {
    const t = convexTest(schema, modules)
    const { tripId } = await withGeneratedTrip(t)

    const resultats = await t.query(api.functions.trips.nextDepartures, {
      originCode: "OWE",
      limit: 2,
      after: Date.UTC(2026, 7, 14, 6),
    })

    expect(resultats).toHaveLength(1)
    expect(resultats[0]).toMatchObject({
      tripId,
      trainNumber: "TR-201",
      serviceDate: "2026-08-14",
      origin: { code: "OWE", name: "Owendo" },
      destination: { code: "FCV", name: "Franceville" },
    })

    const apresDepart = await t.query(api.functions.trips.nextDepartures, {
      originCode: "OWE",
      after: Date.UTC(2026, 7, 14, 8),
    })
    expect(apresDepart).toHaveLength(0)
  })

  it("trouve une desserte sur un trajet intermédiaire", async () => {
    const t = convexTest(schema, modules)
    const { net } = await withGeneratedTrip(t)
    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.ndj,
      destinationStationId: net.boo,
      serviceDate: "2026-08-14",
    })
    expect(resultats).toHaveLength(1)
    expect(resultats[0]?.distanceKm).toBe(165)
  })

  it("ignore un trajet à contresens", async () => {
    const t = convexTest(schema, modules)
    const { net } = await withGeneratedTrip(t)
    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.fcv,
      destinationStationId: net.owe,
      serviceDate: "2026-08-14",
    })
    expect(resultats).toHaveLength(0)
  })

  it("ignore une autre date", async () => {
    const t = convexTest(schema, modules)
    const { net } = await withGeneratedTrip(t)
    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-15",
    })
    expect(resultats).toHaveLength(0)
  })

  it("exclut une desserte annulée", async () => {
    const t = convexTest(schema, modules)
    const { net, ctx, tripId } = await withGeneratedTrip(t)
    await ctx.mutation(api.functions.trips.setStatus, {
      tripId,
      status: "annule",
    })
    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
    })
    expect(resultats).toHaveLength(0)
  })

  it("signale l'absence de disponibilité pour un groupe trop nombreux", async () => {
    const t = convexTest(schema, modules)
    const { net } = await withGeneratedTrip(t)
    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
      passengers: 50,
    })
    expect(resultats[0]?.hasAvailability).toBe(false)
  })

  it("liste les places libres avec leur état", async () => {
    const t = convexTest(schema, modules)
    const { tripId } = await withGeneratedTrip(t)
    const places = await t.query(api.functions.trips.availableSeats, {
      tripId,
      fromIndex: 0,
      toIndex: 3,
      serviceClass: "DEUXIEME",
    })
    expect(places).toHaveLength(4)
    expect(places.every((p) => p.isFree)).toBe(true)
    expect(places[0]?.label).toBe("1A")
    expect(places[0]).toMatchObject({
      coachLabel: "V1",
      coachPosition: 1,
      coachRowCount: 2,
      coachColumnCount: 2,
      isBlocked: false,
      isOccupied: false,
    })
  })

  it("tient compte de l'occupation par segment pour le plan de voiture", async () => {
    const t = convexTest(schema, modules)
    const { tripId } = await withGeneratedTrip(t)

    // Occupe la place 1A d'Owendo à Ndjolé, soit le segment 0 seulement.
    await t.run(async (c) => {
      const row = await c.db
        .query("seatOccupancy")
        .withIndex("by_trip_class", (q) => q.eq("tripId", tripId))
        .first()
      await c.db.patch(row!._id, { soldMask: 0b001 })
    })

    const surSegment0 = await t.query(api.functions.trips.availableSeats, {
      tripId,
      fromIndex: 0,
      toIndex: 1,
    })
    expect(surSegment0.filter((p) => p.isFree)).toHaveLength(5)

    // La même place reste libre plus loin sur le parcours.
    const surSegments12 = await t.query(api.functions.trips.availableSeats, {
      tripId,
      fromIndex: 1,
      toIndex: 3,
    })
    expect(surSegments12.every((p) => p.isFree)).toBe(true)
  })
})

describe("Statut et fenêtre de vente", () => {
  it("retire de la vente une desserte annulée", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })
    const tripId = rapport.tripId as Id<"trips">

    await ctx.mutation(api.functions.trips.setStatus, {
      tripId,
      status: "annule",
    })
    const detail = await t.query(api.functions.trips.get, { tripId })
    expect(detail.trip.isOpenForSale).toBe(false)
  })

  it("enregistre un retard et le journalise", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })
    const tripId = rapport.tripId as Id<"trips">

    await ctx.mutation(api.functions.trips.setStatus, {
      tripId,
      status: "retarde",
      delayMinutes: 45,
    })
    const detail = await t.query(api.functions.trips.get, { tripId })
    expect(detail.trip.delayMinutes).toBe(45)
    expect(detail.trip.isOpenForSale).toBe(true)

    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    expect(logs.some((l) => l.action === "desserte.statut")).toBe(true)
  })

  it("refuse un retard négatif", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate: "2026-08-14",
    })
    await expect(
      ctx.mutation(api.functions.trips.setStatus, {
        tripId: rapport.tripId as Id<"trips">,
        status: "retarde",
        delayMinutes: -10,
      })
    ).rejects.toThrow(/Retard invalide/)
  })
})
