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

/**
 * Engendre une desserte, horloge simulée à la date de service.
 *
 * `isOpenForSale` se fige à la génération d'après `Date.now()` : une
 * desserte plantée sur une date fixe du scénario de test naît hors fenêtre
 * de vente dès que le vrai calendrier dépasse cette date. On simule donc
 * l'instant de génération plutôt que de coder une fenêtre de vente en dur.
 */
async function genererDesserte(
  t: ReturnType<typeof convexTest>,
  scheduleId: Id<"bookletSchedules">,
  serviceDate: string
) {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(Date.parse(`${serviceDate}T00:00:00Z`))
    return await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate,
    })
  } finally {
    vi.useRealTimers()
  }
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
    const rapport = await genererDesserte(t, scheduleId, "2026-08-14")
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

  it("marque une desserte annulée au lieu de la faire disparaître", async () => {
    // Comportement volontaire : le voyageur doit voir que son train habituel
    // ne circule pas, pas le voir disparaître des résultats sans explication.
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
    expect(resultats).toHaveLength(1)
    expect(resultats[0]?.trip.status).toBe("annule")
    expect(resultats[0]?.hasAvailability).toBe(false)
    expect(resultats[0]?.prixParClasse).toEqual({})
  })

  it("signale l'absence de disponibilité pour un groupe trop nombreux", async () => {
    // Le guichet vend aussi aux groupes (tarifs 10–49 et 50 et plus) : la
    // recherche ne plafonne pas l'effectif, elle dit qu'il n'y a pas la place.
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
    const rapport = await genererDesserte(t, scheduleId, "2026-08-14")
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

/**
 * Réseau, desserte engendrée et grille tarifaire active — pour les tests de
 * prix par classe, de réductions, du calendrier et des dessertes annulées.
 */
async function seedTarifee(t: ReturnType<typeof convexTest>) {
  const net = await seedNetwork(t)
  const { ctx, userId, bookletId, scheduleId } = await seedBooklet(t, net)
  await ctx.mutation(api.functions.booklets.submit, { bookletId })
  await ctx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await genererDesserte(t, scheduleId, "2026-08-14")
  const tripId = rapport.tripId as Id<"trips">

  await t.run(async (dbCtx) => {
    const fareScheduleId = await dbCtx.db.insert("fareSchedules", {
      label: "Barème de test",
      status: "actif",
      validFrom: 0,
      validUntil: Date.now() + 365 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 0,
      cssPct: 0,
      createdBy: userId,
    })
    await dbCtx.db.insert("fareBases", {
      scheduleId: fareScheduleId,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 47.51,
      longDistanceRate: 43.42,
    })
    await dbCtx.db.insert("fareBases", {
      scheduleId: fareScheduleId,
      trainType: "EXPRESS",
      serviceClass: "PREMIERE",
      shortDistanceRate: 65.2,
      longDistanceRate: 58.9,
    })
    await dbCtx.db.insert("discounts", {
      scheduleId: fareScheduleId,
      code: "ENFANT",
      label: "Enfant",
      ratePct: 50,
      minAge: 4,
      maxAge: 11,
      requiresProof: false,
      isActive: true,
    })
    await dbCtx.db.insert("discounts", {
      scheduleId: fareScheduleId,
      code: "PROMOTIONNEL",
      label: "Promotion échue",
      ratePct: 20,
      requiresProof: false,
      isActive: false,
    })
  })

  return { net, ctx, tripId }
}

describe("Prix par classe dans la recherche", () => {
  it("expose un prix par classe cohérent avec bookings.quote pour le même groupe", async () => {
    const t = convexTest(schema, modules)
    const { net, tripId } = await seedTarifee(t)
    const passengers = 2

    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
      passengers,
    })
    expect(resultats).toHaveLength(1)
    const desserte = resultats[0]!
    expect(desserte.prixParClasse.DEUXIEME).toBeDefined()
    expect(desserte.prixParClasse.PREMIERE).toBeDefined()

    for (const classe of ["DEUXIEME", "PREMIERE"] as const) {
      const devis = await t.query(api.functions.bookings.quote, {
        tripId,
        originStationId: net.owe,
        destinationStationId: net.fcv,
        serviceClass: classe,
        passengerCount: passengers,
      })
      expect(desserte.prixParClasse[classe]?.totalTtc).toBe(devis.totalTtc)
      expect(desserte.prixParClasse[classe]?.unitaireTtc).toBe(
        devis.lines[0]?.unitPriceTtc
      )
    }
  })

  it("applique la réduction ENFANT au prix par classe via discountCodes", async () => {
    const t = convexTest(schema, modules)
    const { net, tripId } = await seedTarifee(t)

    const sansReduction = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
      passengers: 2,
    })
    const avecReduction = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
      passengers: 2,
      discountCodes: ["", "ENFANT"],
    })

    const totalSans = sansReduction[0]?.prixParClasse.DEUXIEME?.totalTtc
    const totalAvec = avecReduction[0]?.prixParClasse.DEUXIEME?.totalTtc
    expect(totalSans).toBeDefined()
    expect(totalAvec).toBeLessThan(totalSans!)

    const devis = await t.query(api.functions.bookings.quote, {
      tripId,
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceClass: "DEUXIEME",
      passengerCount: 2,
      discountCodes: ["", "ENFANT"],
    })
    expect(totalAvec).toBe(devis.totalTtc)
  })

  it("garde les montants d'un groupe mixte en chiffrant une fois par réduction", async () => {
    const t = convexTest(schema, modules)
    const { net, tripId } = await seedTarifee(t)
    // Des contingents propres à chaque classe : la recherche les lit une fois
    // pour toute la desserte, le devis classe par classe.
    await t.run(async (dbCtx) => {
      for (const [serviceClass, coefficient] of [
        ["DEUXIEME", 0.8],
        ["PREMIERE", 1.1],
      ] as const) {
        await dbCtx.db.insert("fareClassQuotas", {
          tripId,
          serviceClass,
          label: `contingent ${serviceClass}`,
          priority: 1,
          seatCount: 50,
          soldCount: 0,
          coefficient,
          isActive: true,
        })
      }
    })
    const passengers = 5
    const discountCodes = ["ENFANT", "", "ENFANT"]

    const [desserte] = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
      passengers,
      discountCodes,
    })
    for (const classe of ["DEUXIEME", "PREMIERE"] as const) {
      const devis = await t.query(api.functions.bookings.quote, {
        tripId,
        originStationId: net.owe,
        destinationStationId: net.fcv,
        serviceClass: classe,
        passengerCount: passengers,
        discountCodes,
      })
      const enfant = await t.query(api.functions.bookings.quote, {
        tripId,
        originStationId: net.owe,
        destinationStationId: net.fcv,
        serviceClass: classe,
        passengerCount: passengers,
        discountCodes: ["ENFANT"],
      })
      const adulte = enfant.lines[1]!.unitPriceTtc
      const prixEnfant = enfant.lines[0]!.unitPriceTtc
      // Une ligne par voyageur, dans l'ordre, au prix de sa réduction.
      expect(devis.lines.map((ligne) => ligne.discountCode)).toEqual([
        "ENFANT",
        null,
        "ENFANT",
        null,
        null,
      ])
      expect(devis.lines.map((ligne) => ligne.unitPriceTtc)).toEqual([
        prixEnfant,
        adulte,
        prixEnfant,
        adulte,
        adulte,
      ])
      expect(devis.lines[0]?.quotaLabel).toBe(`contingent ${classe}`)
      expect(devis.totalTtc).toBe(2 * prixEnfant + 3 * adulte)
      expect(desserte?.prixParClasse[classe]?.totalTtc).toBe(devis.totalTtc)
    }
  })

  it("n'affiche aucun prix quand aucune grille tarifaire n'est active", async () => {
    const t = convexTest(schema, modules)
    const net = await seedNetwork(t)
    const { ctx, bookletId, scheduleId } = await seedBooklet(t, net)
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    await genererDesserte(t, scheduleId, "2026-08-14")

    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
    })
    expect(resultats).toHaveLength(1)
    expect(resultats[0]?.prixParClasse).toEqual({})
  })
})

describe("Dessertes annulées dans la recherche", () => {
  it("renvoie une desserte annulée, marquée, sans disponibilité ni prix", async () => {
    const t = convexTest(schema, modules)
    const { net, ctx, tripId } = await seedTarifee(t)

    await ctx.mutation(api.functions.trips.setStatus, {
      tripId,
      status: "annule",
    })

    const resultats = await t.query(api.functions.trips.search, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
    })
    expect(resultats).toHaveLength(1)
    expect(resultats[0]?.trip.status).toBe("annule")
    expect(resultats[0]?.hasAvailability).toBe(false)
    expect(resultats[0]?.prixParClasse).toEqual({})
  })
})

describe("Coût des requêtes publiques", () => {
  it("plafonne l'effectif d'une recherche au-delà d'une rame", async () => {
    const t = convexTest(schema, modules)
    const { net } = await seedTarifee(t)
    const recherche = {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      serviceDate: "2026-08-14",
    }
    await expect(
      t.query(api.functions.trips.search, { ...recherche, passengers: 500 })
    ).resolves.toHaveLength(1)
    await expect(
      t.query(api.functions.trips.search, { ...recherche, passengers: 501 })
    ).rejects.toThrow(/au plus 500/)
  })

  it("borne le calendrier à neuf voyageurs et vingt et un jours", async () => {
    const t = convexTest(schema, modules)
    const { net } = await seedTarifee(t)
    const calendrier = {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      from: "2026-08-14",
    }
    await expect(
      t.query(api.functions.trips.fareCalendar, {
        ...calendrier,
        days: 21,
        passengers: 9,
      })
    ).resolves.toHaveLength(21)
    await expect(
      t.query(api.functions.trips.fareCalendar, {
        ...calendrier,
        days: 7,
        passengers: 10,
      })
    ).rejects.toThrow(/au plus 9/)
    await expect(
      t.query(api.functions.trips.fareCalendar, { ...calendrier, days: 22 })
    ).rejects.toThrow(/Nombre de jours invalide/)
  })
})

describe("Calendrier des prix (fareCalendar)", () => {
  it("distingue jour sans train, jour complet et prix minimum", async () => {
    const t = convexTest(schema, modules)
    const { net, ctx } = await seedTarifee(t)

    // Un second livret, actif le 20 août seulement — hors de la période du
    // premier livret (14-16 août) pour éviter le refus « Chevauchement ».
    const { bookletId: secondBookletId, scheduleId: secondScheduleId } =
      await seedBooklet(t, net, {
        validFrom: Date.UTC(2026, 7, 20),
        validUntil: Date.UTC(2026, 7, 20, 23, 0),
      })
    await ctx.mutation(api.functions.booklets.submit, {
      bookletId: secondBookletId,
    })
    await ctx.mutation(api.functions.booklets.approve, {
      bookletId: secondBookletId,
    })
    const secondRapport = await genererDesserte(
      t,
      secondScheduleId,
      "2026-08-20"
    )
    const secondTripId = secondRapport.tripId as Id<"trips">
    // Sature complètement toutes les classes de la desserte du 20 août.
    await t.run(async (dbCtx) => {
      const rows = await dbCtx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", secondTripId))
        .collect()
      for (const row of rows) {
        await dbCtx.db.patch(row._id, { available: 0, sold: row.capacity })
      }
    })

    // Sept jours : le 14 (une desserte ouverte, tarifée), le 15 (aucune
    // desserte) et le 20 (une desserte complète) en font partie.
    const jours = await t.query(api.functions.trips.fareCalendar, {
      originStationId: net.owe,
      destinationStationId: net.fcv,
      from: "2026-08-14",
      days: 7,
    })
    expect(jours.map((j) => j.serviceDate)).toEqual([
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
    ])

    const jour14 = jours[0]!
    expect(jour14.trains).toBe(1)
    expect(jour14.trainsDisponibles).toBe(1)
    expect(jour14.complet).toBe(false)
    expect(jour14.prixMinTtc).not.toBeNull()

    const jour15 = jours[1]!
    expect(jour15.trains).toBe(0)
    expect(jour15.trainsDisponibles).toBe(0)
    expect(jour15.complet).toBe(false)
    expect(jour15.prixMinTtc).toBeNull()

    const jour20 = jours[6]!
    expect(jour20.trains).toBe(1)
    expect(jour20.trainsDisponibles).toBe(0)
    expect(jour20.complet).toBe(true)
    expect(jour20.prixMinTtc).toBeNull()
  })
})
