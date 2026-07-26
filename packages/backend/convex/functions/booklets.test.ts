import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { toServiceDate, addDays } from "../model/calendar"

/**
 * Consultation des livrets, circuit de rejet et fenêtre glissante de vente.
 * Complète `trips.test.ts`, qui couvre la génération elle-même.
 */

async function asRole(t: ReturnType<typeof convexTest>, role: AppRole) {
  const authId = `auth-${role}-${Math.floor(Math.random() * 1e9)}`
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      identitySource: "annuaire",
      isActive: true,
    }),
  )
  return t.withIdentity({ subject: authId })
}

async function seedMinimalNetwork(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const owe = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
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
    const coachId = await ctx.db.insert("coaches", {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 1,
      columnCount: 2,
      seatCount: 2,
      standingCapacity: 0,
      position: 1,
    })
    await ctx.db.insert("seats", {
      coachId,
      trainId,
      label: "1A",
      row: 1,
      column: 1,
      isActive: true,
    })
    await ctx.db.insert("seats", {
      coachId,
      trainId,
      label: "1B",
      row: 1,
      column: 2,
      isActive: true,
    })
    return { owe, fcv, trainId }
  })
}

describe("Consultation des livrets", () => {
  it("liste les livrets pour un rôle habilité", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asRole(t, "admin_fonctionnel")
    await ctx.mutation(api.functions.booklets.create, {
      label: "Été 2026",
      validFrom: Date.UTC(2026, 5, 1),
      validUntil: Date.UTC(2026, 7, 31),
    })
    const livrets = await ctx.query(api.functions.booklets.list, {})
    expect(livrets).toHaveLength(1)
    expect(livrets[0]?.label).toBe("Été 2026")
    expect(livrets[0]?.status).toBe("brouillon")
  })

  it("refuse la consultation à un rôle non habilité", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asRole(t, "voyageur")
    await expect(ctx.query(api.functions.booklets.list, {})).rejects.toThrow(
      /Accès refusé/,
    )
  })

  it("retourne le livret avec ses horaires", async () => {
    const t = convexTest(schema, modules)
    const net = await seedMinimalNetwork(t)
    const ctx = await asRole(t, "admin_fonctionnel")
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "Été 2026",
      description: "Desserte estivale",
      validFrom: Date.UTC(2026, 5, 1),
      validUntil: Date.UTC(2026, 5, 3),
    })
    await ctx.mutation(api.functions.booklets.addSchedule, {
      bookletId,
      trainId: net.trainId,
      departureTime: "08:00",
      daysOfWeek: [],
      stops: [
        { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
        { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
      ],
    })

    const detail = await ctx.query(api.functions.booklets.get, { bookletId })
    expect(detail.booklet.description).toBe("Desserte estivale")
    expect(detail.schedules).toHaveLength(1)
    expect(detail.schedules[0]?.trainNumber).toBe("TR-201")
    expect(detail.schedules[0]?.stops).toHaveLength(2)
  })

  it("signale un livret introuvable", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asRole(t, "admin_fonctionnel")
    const fantome = await t.run(async (c) => {
      const id = await c.db.insert("timetableBooklets", {
        label: "Temporaire",
        validFrom: 1,
        validUntil: 2,
        status: "brouillon",
        createdBy: (await c.db
          .query("users")
          .first())!._id as Id<"users">,
      })
      await c.db.delete(id)
      return id
    })
    await expect(
      ctx.query(api.functions.booklets.get, { bookletId: fantome }),
    ).rejects.toThrow(/introuvable/)
  })
})

describe("Circuit de rejet", () => {
  async function submitted(t: ReturnType<typeof convexTest>) {
    const net = await seedMinimalNetwork(t)
    const ctx = await asRole(t, "admin_fonctionnel")
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "À corriger",
      validFrom: Date.UTC(2026, 5, 1),
      validUntil: Date.UTC(2026, 5, 3),
    })
    await ctx.mutation(api.functions.booklets.addSchedule, {
      bookletId,
      trainId: net.trainId,
      departureTime: "08:00",
      daysOfWeek: [],
      stops: [
        { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
        { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
      ],
    })
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    return { ctx, bookletId, net }
  }

  it("rejette avec un motif et le conserve", async () => {
    const t = convexTest(schema, modules)
    const { ctx, bookletId } = await submitted(t)
    const status = await ctx.mutation(api.functions.booklets.reject, {
      bookletId,
      reason: "Horaires incompatibles avec le plan de transport",
    })
    expect(status).toBe("rejete")

    const detail = await ctx.query(api.functions.booklets.get, { bookletId })
    expect(detail.booklet.rejectionReason).toContain("plan de transport")
  })

  it("rend le livret de nouveau modifiable après rejet", async () => {
    const t = convexTest(schema, modules)
    const { ctx, bookletId, net } = await submitted(t)
    await ctx.mutation(api.functions.booklets.reject, {
      bookletId,
      reason: "À revoir",
    })
    // Un livret rejeté redevient modifiable, sans passer par une reprise.
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
      }),
    ).resolves.toBeDefined()
  })

  it("journalise le rejet avec l'avant et l'après", async () => {
    const t = convexTest(schema, modules)
    const { ctx, bookletId } = await submitted(t)
    await ctx.mutation(api.functions.booklets.reject, {
      bookletId,
      reason: "Motif de test",
    })
    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    const rejet = logs.find((l) => l.action === "livret.rejeter")
    expect(rejet?.before).toContain("a_valider")
    expect(rejet?.after).toContain("Motif de test")
  })

  it("refuse de rejeter un livret qui n'a pas été soumis", async () => {
    const t = convexTest(schema, modules)
    await seedMinimalNetwork(t)
    const ctx = await asRole(t, "admin_fonctionnel")
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "Brouillon",
      validFrom: Date.UTC(2026, 5, 1),
      validUntil: Date.UTC(2026, 5, 3),
    })
    await expect(
      ctx.mutation(api.functions.booklets.reject, {
        bookletId,
        reason: "Trop tôt",
      }),
    ).rejects.toThrow(/Transition impossible/)
  })
})

describe("Fenêtre glissante de mise en vente", () => {
  /** Engendre une desserte à une date donnée, hors fenêtre par défaut. */
  async function tripAt(
    t: ReturnType<typeof convexTest>,
    serviceDate: string,
  ) {
    const net = await seedMinimalNetwork(t)
    const ctx = await asRole(t, "admin_fonctionnel")
    const from = Date.parse(`${serviceDate}T00:00:00Z`)
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: `Livret ${serviceDate}`,
      validFrom: from,
      validUntil: from + 86_400_000,
    })
    const scheduleId = await ctx.mutation(api.functions.booklets.addSchedule, {
      bookletId,
      trainId: net.trainId,
      departureTime: "08:00",
      daysOfWeek: [],
      stops: [
        { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
        { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
      ],
    })
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })
    const rapport = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId,
      serviceDate,
    })
    return { tripId: rapport.tripId as Id<"trips">, ctx }
  }

  it("ouvre à la vente une desserte dans la fenêtre", async () => {
    const t = convexTest(schema, modules)
    const demain = addDays(toServiceDate(Date.now()), 1)
    const { tripId } = await tripAt(t, demain)
    const detail = await t.query(api.functions.trips.get, { tripId })
    expect(detail.trip.isOpenForSale).toBe(true)
  })

  it("laisse fermée une desserte au-delà de la fenêtre", async () => {
    const t = convexTest(schema, modules)
    const loin = addDays(toServiceDate(Date.now()), 200)
    const { tripId } = await tripAt(t, loin)
    const detail = await t.query(api.functions.trips.get, { tripId })
    expect(detail.trip.isOpenForSale).toBe(false)
  })

  it("le cron ouvre les dessertes entrées dans la fenêtre", async () => {
    const t = convexTest(schema, modules)
    const loin = addDays(toServiceDate(Date.now()), 200)
    const { tripId } = await tripAt(t, loin)

    // Fenêtre élargie : la desserte lointaine y entre.
    const resultat = await t.mutation(internal.functions.trips.rollSaleWindow, {
      windowDays: 365,
    })
    expect(resultat.opened).toBe(1)

    const detail = await t.query(api.functions.trips.get, { tripId })
    expect(detail.trip.isOpenForSale).toBe(true)
  })

  it("le cron n'ouvre rien deux fois", async () => {
    const t = convexTest(schema, modules)
    const loin = addDays(toServiceDate(Date.now()), 200)
    await tripAt(t, loin)
    await t.mutation(internal.functions.trips.rollSaleWindow, {
      windowDays: 365,
    })
    const second = await t.mutation(internal.functions.trips.rollSaleWindow, {
      windowDays: 365,
    })
    expect(second.opened).toBe(0)
  })

  it("le cron laisse fermé ce qui reste hors fenêtre", async () => {
    const t = convexTest(schema, modules)
    const loin = addDays(toServiceDate(Date.now()), 200)
    const { tripId } = await tripAt(t, loin)
    const resultat = await t.mutation(internal.functions.trips.rollSaleWindow, {
      windowDays: 10,
    })
    expect(resultat.opened).toBe(0)
    const detail = await t.query(api.functions.trips.get, { tripId })
    expect(detail.trip.isOpenForSale).toBe(false)
  })
})

describe("Dessertes du jour", () => {
  it("liste les dessertes d'une date, triées par départ", async () => {
    const t = convexTest(schema, modules)
    const net = await seedMinimalNetwork(t)
    const ctx = await asRole(t, "admin_fonctionnel")
    const bookletId = await ctx.mutation(api.functions.booklets.create, {
      label: "Deux départs",
      validFrom: Date.UTC(2026, 7, 14),
      validUntil: Date.UTC(2026, 7, 14, 23),
    })
    for (const heure of ["17:30", "08:00"]) {
      await ctx.mutation(api.functions.booklets.addSchedule, {
        bookletId,
        trainId: net.trainId,
        departureTime: heure,
        daysOfWeek: [],
        stops: [
          { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
          { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
        ],
      })
    }
    await ctx.mutation(api.functions.booklets.submit, { bookletId })
    await ctx.mutation(api.functions.booklets.approve, { bookletId })

    const schedules = await t.run(async (c) =>
      c.db.query("bookletSchedules").collect(),
    )
    for (const s of schedules) {
      await t.mutation(internal.functions.trips.generateOne, {
        scheduleId: s._id,
        serviceDate: "2026-08-14",
      })
    }

    const dessertes = await t.query(api.functions.trips.listByDate, {
      serviceDate: "2026-08-14",
    })
    expect(dessertes).toHaveLength(2)
    expect(dessertes[0]!.departureAt).toBeLessThan(dessertes[1]!.departureAt)
  })

  it("retourne une liste vide pour une date sans circulation", async () => {
    const t = convexTest(schema, modules)
    const dessertes = await t.query(api.functions.trips.listByDate, {
      serviceDate: "2026-01-01",
    })
    expect(dessertes).toEqual([])
  })
})
