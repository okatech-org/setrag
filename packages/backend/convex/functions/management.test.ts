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

async function seedPointOfSale(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const stationId = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const pointOfSaleId = await ctx.db.insert("pointsOfSale", {
      code: "OWE-PV",
      name: "Point de vente Owendo",
      type: "gare",
      stationId,
      counters: { passengers: 4, baggage: 2, parcels: 1 },
      isActive: true,
    })
    return { stationId, pointOfSaleId }
  })
}

async function seedSeatInventory(
  t: ReturnType<typeof convexTest>,
  adminId: Awaited<ReturnType<typeof asAdmin>>["userId"]
) {
  return await t.run(async (ctx) => {
    const stations = []
    for (const [sequence, code, name] of [
      [0, "OWE", "Owendo"],
      [1, "BOO", "Booué"],
      [2, "FCV", "Franceville"],
    ] as const) {
      const stationId = await ctx.db.insert("stations", {
        code,
        name,
        province: "Test",
        kilometerPoint: sequence * 300,
        isEquipped: true,
        isActive: true,
      })
      stations.push(stationId)
    }
    const trainId = await ctx.db.insert("trains", {
      number: "TR-BLOCK",
      name: "Train blocage",
      type: "EXPRESS",
      isActive: true,
    })
    const coachId = await ctx.db.insert("coaches", {
      trainId,
      label: "B2",
      serviceClass: "DEUXIEME",
      rowCount: 1,
      columnCount: 1,
      seatCount: 1,
      standingCapacity: 0,
      position: 1,
    })
    const seatId = await ctx.db.insert("seats", {
      coachId,
      trainId,
      label: "1A",
      row: 1,
      column: 1,
      isActive: true,
    })
    const bookletId = await ctx.db.insert("timetableBooklets", {
      label: "Livret blocage",
      validFrom: 0,
      validUntil: Date.now() + 86_400_000,
      status: "actif",
      createdBy: adminId,
    })
    const tripId = await ctx.db.insert("trips", {
      bookletId,
      trainId,
      trainNumber: "TR-BLOCK",
      trainType: "EXPRESS",
      serviceDate: "2026-08-15",
      departureAt: Date.now(),
      arrivalAt: Date.now() + 10_000,
      originStationId: stations[0]!,
      destinationStationId: stations[2]!,
      status: "planifie",
      delayMinutes: 0,
      segmentCount: 2,
      isOpenForSale: true,
    })
    for (const [sequence, stationId] of stations.entries()) {
      await ctx.db.insert("tripStops", {
        tripId,
        stationId,
        sequence,
        kilometerPoint: sequence * 300,
      })
    }
    const occupancyId = await ctx.db.insert("seatOccupancy", {
      tripId,
      seatId,
      coachId,
      serviceClass: "DEUXIEME",
      soldMask: 0,
      heldMask: 0,
      blockedMask: 0,
    })
    for (let segmentIndex = 0; segmentIndex < 2; segmentIndex += 1) {
      await ctx.db.insert("segmentCounters", {
        tripId,
        serviceClass: "DEUXIEME",
        segmentIndex,
        capacity: 1,
        sold: 0,
        held: 0,
        reserved: 0,
        available: 1,
      })
    }
    return { tripId, seatId, occupancyId, stations }
  })
}

describe("Actions de gestion", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("crée une grille modifiable en brouillon avec sa première base", async () => {
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
    expect(schedule?.status).toBe("brouillon")
    expect(bases).toMatchObject([
      { shortDistanceRate: 38, longDistanceRate: 34 },
    ])
    const auditLog = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "tarif.grille.creer"))
        .unique()
    )
    expect(auditLog?.entityId).toBe(scheduleId)
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

  it("restitue le détail et les dépendances d’un point de vente", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)
    const fixture = await seedPointOfSale(t)
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authId: "vendeur-rattache",
        firstName: "Paul",
        lastName: "Moussavou",
        matricule: "V-101",
        role: "vendeur_guichet",
        pointOfSaleId: fixture.pointOfSaleId,
        identitySource: "local",
        isActive: true,
      })
      await ctx.db.insert("sales", {
        number: "V-OWE-001",
        kind: "vente",
        product: "billet",
        channel: "guichet",
        status: "confirmee",
        pointOfSaleId: fixture.pointOfSaleId,
        amounts: { ht: 10_000, vat: 0, css: 0, ttc: 10_000, received: 10_000 },
        soldAt: Date.now(),
      })
    })

    const detail = await client.query(api.functions.management.getPointOfSale, {
      pointOfSaleId: fixture.pointOfSaleId,
    })
    expect(detail).toMatchObject({
      pointOfSale: { code: "OWE-PV", isActive: true },
      station: { code: "OWE" },
      attachedUsers: [
        {
          displayName: "Paul Moussavou",
          matricule: "V-101",
          isActive: true,
        },
      ],
      dependencies: {
        attachedUsers: 1,
        activeUsers: 1,
        sales: 1,
        openCashSessions: 0,
      },
    })
  })

  it("modifie les informations, compteurs, rattachement et royalties", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)
    const fixture = await seedPointOfSale(t)
    const stationId = await t.run((ctx) =>
      ctx.db.insert("stations", {
        code: "NDJ",
        name: "Ndjolé",
        province: "Moyen-Ogooué",
        kilometerPoint: 175,
        isEquipped: true,
        isActive: true,
      })
    )

    await client.mutation(api.functions.management.updatePointOfSale, {
      pointOfSaleId: fixture.pointOfSaleId,
      code: "ag-ndj-01",
      name: "  Agence Ndjolé Centre  ",
      type: "agence_accreditee",
      stationId,
      passengerCounters: 3,
      baggageCounters: 1,
      parcelCounters: 2,
      royaltyPct: 7.5,
    })

    expect(
      await t.run((ctx) => ctx.db.get(fixture.pointOfSaleId))
    ).toMatchObject({
      code: "AG-NDJ-01",
      name: "Agence Ndjolé Centre",
      type: "agence_accreditee",
      stationId,
      counters: { passengers: 3, baggage: 1, parcels: 2 },
      royaltyPct: 7.5,
      isActive: true,
    })
    const logs = await t.run((ctx) => ctx.db.query("auditLogs").collect())
    expect(logs[logs.length - 1]?.action).toBe(
      "referentiel.point_de_vente.modifier"
    )
  })

  it("refuse les codes dupliqués et les valeurs métier invalides", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asAdmin(t)
    const fixture = await seedPointOfSale(t)
    await t.run((ctx) =>
      ctx.db.insert("pointsOfSale", {
        code: "AG-LBV-02",
        name: "Agence Libreville",
        type: "agence_accreditee",
        counters: { passengers: 1, baggage: 0, parcels: 0 },
        isActive: true,
      })
    )

    await expect(
      client.mutation(api.functions.management.updatePointOfSale, {
        pointOfSaleId: fixture.pointOfSaleId,
        code: "AG-LBV-02",
        name: "Doublon",
        type: "gare",
        stationId: fixture.stationId,
        passengerCounters: 1,
        baggageCounters: 0,
        parcelCounters: 0,
      })
    ).rejects.toThrow("existe déjà")

    await expect(
      client.mutation(api.functions.management.updatePointOfSale, {
        pointOfSaleId: fixture.pointOfSaleId,
        code: "OWE-PV",
        name: "Owendo",
        type: "gare",
        stationId: fixture.stationId,
        passengerCounters: -1,
        baggageCounters: 0,
        parcelCounters: 0,
        royaltyPct: 101,
      })
    ).rejects.toThrow("guichets")
  })

  it("protège la suspension tant qu’une caisse est ouverte", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asAdmin(t)
    const fixture = await seedPointOfSale(t)
    const accountingDayId = await t.run((ctx) =>
      ctx.db.insert("accountingDays", {
        date: "2026-07-28",
        status: "ouverte",
        openedAt: Date.now(),
        totalTtc: 0,
        totalReceived: 0,
      })
    )
    const cashSessionId = await t.run((ctx) =>
      ctx.db.insert("cashSessions", {
        sellerId: userId,
        pointOfSaleId: fixture.pointOfSaleId,
        accountingDayId,
        openedAt: Date.now(),
        openingFloatXaf: 50_000,
        expectedByMethod: [],
        status: "ouverte",
      })
    )

    await expect(
      client.mutation(api.functions.management.setPointOfSaleStatus, {
        pointOfSaleId: fixture.pointOfSaleId,
        isActive: false,
      })
    ).rejects.toThrow("1 caisse(s) ouverte(s)")

    await t.run((ctx) =>
      ctx.db.patch(cashSessionId, {
        status: "cloturee",
        closedAt: Date.now(),
      })
    )
    const quotaId = await t.run(async (ctx) => {
      const destinationId = await ctx.db.insert("stations", {
        code: "NDJ",
        name: "Ndjolé",
        province: "Moyen-Ogooué",
        kilometerPoint: 175,
        isEquipped: true,
        isActive: true,
      })
      const trainId = await ctx.db.insert("trains", {
        number: "TR-TEST-PV",
        name: "Train test",
        type: "EXPRESS",
        isActive: true,
      })
      const bookletId = await ctx.db.insert("timetableBooklets", {
        label: "Livret test",
        validFrom: 0,
        validUntil: Date.now() + 86_400_000,
        status: "actif",
        createdBy: userId,
      })
      const tripId = await ctx.db.insert("trips", {
        bookletId,
        trainId,
        trainNumber: "TR-TEST-PV",
        trainType: "EXPRESS",
        serviceDate: "2026-07-28",
        departureAt: Date.now(),
        arrivalAt: Date.now() + 3_600_000,
        originStationId: fixture.stationId,
        destinationStationId: destinationId,
        status: "planifie",
        delayMinutes: 0,
        segmentCount: 1,
        isOpenForSale: true,
      })
      return await ctx.db.insert("agencyQuotas", {
        pointOfSaleId: fixture.pointOfSaleId,
        tripId,
        serviceClass: "DEUXIEME",
        allocated: 10,
        sold: 0,
        isActive: true,
        createdBy: userId,
      })
    })
    await expect(
      client.mutation(api.functions.management.setPointOfSaleStatus, {
        pointOfSaleId: fixture.pointOfSaleId,
        isActive: false,
      })
    ).rejects.toThrow("1 quota(s) agence actif(s)")

    await t.run((ctx) => ctx.db.patch(quotaId, { isActive: false }))
    await client.mutation(api.functions.management.setPointOfSaleStatus, {
      pointOfSaleId: fixture.pointOfSaleId,
      isActive: false,
    })
    expect(
      (await t.run((ctx) => ctx.db.get(fixture.pointOfSaleId)))?.isActive
    ).toBe(false)

    await client.mutation(api.functions.management.setPointOfSaleStatus, {
      pointOfSaleId: fixture.pointOfSaleId,
      isActive: true,
    })
    expect(
      (await t.run((ctx) => ctx.db.get(fixture.pointOfSaleId)))?.isActive
    ).toBe(true)
  })

  it("bloque puis libère une place en maintenant les masques et compteurs", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asAdmin(t)
    const fixture = await seedSeatInventory(t, userId)

    const blockId = await client.mutation(
      api.functions.management.createSeatBlock,
      {
        tripId: fixture.tripId,
        seatId: fixture.seatId,
        fromStopIndex: 0,
        toStopIndex: 2,
        reason: "maintenance",
        comment: "Sellerie à réparer",
      }
    )
    expect(await t.run((ctx) => ctx.db.get(fixture.occupancyId))).toMatchObject(
      {
        blockedMask: 3,
        soldMask: 0,
        heldMask: 0,
      }
    )
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("segmentCounters")
          .withIndex("by_trip_class", (q) =>
            q.eq("tripId", fixture.tripId).eq("serviceClass", "DEUXIEME")
          )
          .collect()
      )
    ).toEqual([
      expect.objectContaining({ reserved: 1, available: 0 }),
      expect.objectContaining({ reserved: 1, available: 0 }),
    ])
    const detail = await client.query(api.functions.management.getSeatBlock, {
      blockId,
    })
    expect(detail).toMatchObject({
      block: { reason: "maintenance", isActive: true },
      trip: { trainNumber: "TR-BLOCK" },
      seat: { label: "1A" },
      coach: { label: "B2" },
      blockedSegments: [0, 1],
    })

    await client.mutation(api.functions.management.releaseSeatBlock, {
      blockId,
      note: "Siège réparé et contrôlé",
    })
    expect(await t.run((ctx) => ctx.db.get(fixture.occupancyId))).toMatchObject(
      {
        blockedMask: 0,
      }
    )
    expect(await t.run((ctx) => ctx.db.get(blockId))).toMatchObject({
      isActive: false,
      releasedBy: userId,
    })
    const counters = await t.run((ctx) =>
      ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", fixture.tripId).eq("serviceClass", "DEUXIEME")
        )
        .collect()
    )
    expect(counters).toEqual([
      expect.objectContaining({ reserved: 0, available: 1 }),
      expect.objectContaining({ reserved: 0, available: 1 }),
    ])
    const logs = await t.run((ctx) => ctx.db.query("auditLogs").collect())
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining(["place.bloquer", "place.liberer"])
    )
  })

  it("refuse de bloquer une place déjà vendue", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asAdmin(t)
    const fixture = await seedSeatInventory(t, userId)
    await t.run((ctx) =>
      ctx.db.patch(fixture.occupancyId, {
        soldMask: 1,
      })
    )

    await expect(
      client.mutation(api.functions.management.createSeatBlock, {
        tripId: fixture.tripId,
        seatId: fixture.seatId,
        fromStopIndex: 0,
        toStopIndex: 1,
        reason: "exploitation",
        comment: "Essai interdit",
      })
    ).rejects.toThrow(/déjà vendue/)
  })

  it("restitue une fiche voyageur transactionnelle sans mutation destructive", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asAdmin(t)
    const fixture = await seedSeatInventory(t, userId)
    const saleId = await t.run((ctx) =>
      ctx.db.insert("sales", {
        number: "V-TRAVELER-001",
        kind: "vente",
        product: "billet",
        channel: "ligne",
        status: "confirmee",
        contactPhone: "+24106123456",
        contactEmail: "ariane@example.ga",
        amounts: {
          ht: 20_000,
          vat: 0,
          css: 0,
          ttc: 20_000,
          received: 20_000,
        },
        soldAt: Date.now(),
      })
    )
    const ticketId = await t.run((ctx) =>
      ctx.db.insert("tickets", {
        saleId,
        number: "B-TRAVELER-001",
        tripId: fixture.tripId,
        passenger: {
          firstName: "Ariane",
          lastName: "Moussavou",
          gender: "F",
          emergencyPhone: "+24107123456",
        },
        originStationId: fixture.stations[0]!,
        destinationStationId: fixture.stations[2]!,
        fromStopIndex: 0,
        toStopIndex: 2,
        serviceClass: "DEUXIEME",
        seatId: fixture.seatId,
        seatLabel: "1A",
        coachLabel: "B2",
        isStanding: false,
        fare: {
          distanceKm: 600,
          chargeableKm: 600,
          ratePerKm: 33,
          discountPct: 0,
          appliedRules: [],
          roundingStep: 50,
        },
        unitPriceTtc: 20_000,
        status: "valide",
        duplicateCount: 0,
      })
    )

    const detail = await client.query(
      api.functions.management.getTravelerTicket,
      { ticketId }
    )
    expect(detail).toMatchObject({
      ticket: {
        number: "B-TRAVELER-001",
        passenger: { firstName: "Ariane", lastName: "Moussavou" },
        status: "valide",
      },
      sale: {
        contactPhone: "+24106123456",
        contactEmail: "ariane@example.ga",
      },
      trip: { trainNumber: "TR-BLOCK" },
      origin: { code: "OWE" },
      destination: { code: "FCV" },
    })

    const travelers = await client.query(
      api.functions.management.listTravelers,
      { limit: 1 }
    )
    expect(travelers).toHaveLength(1)
    expect(travelers[0]).toMatchObject({
      ticket: {
        _id: ticketId,
        passenger: { firstName: "Ariane", lastName: "Moussavou" },
      },
      trip: { trainNumber: "TR-BLOCK" },
    })
  })
})
