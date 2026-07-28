import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "../_generated/api"
import type { AppRole } from "../model/permissions"
import schema from "../schema"
import { modules } from "../test.setup"

async function asRole(t: ReturnType<typeof convexTest>, role: AppRole) {
  const authId = `booklet-crud-${role}-${Math.random()}`
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return { client: t.withIdentity({ subject: authId }), userId }
}

async function fixture(t: ReturnType<typeof convexTest>) {
  const { client, userId } = await asRole(t, "admin_fonctionnel")
  const network = await t.run(async (ctx) => {
    const origin = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const destination = await ctx.db.insert("stations", {
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
    await ctx.db.insert("coaches", {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 1,
      columnCount: 1,
      seatCount: 1,
      standingCapacity: 0,
      position: 1,
    })
    return { origin, destination, trainId }
  })
  const bookletId = await client.mutation(api.functions.booklets.create, {
    label: "Livret en préparation",
    validFrom: Date.parse("2027-01-01T00:00:00Z"),
    validUntil: Date.parse("2027-03-31T23:59:59Z"),
  })
  const scheduleId = await client.mutation(api.functions.booklets.addSchedule, {
    bookletId,
    trainId: network.trainId,
    departureTime: "08:00",
    daysOfWeek: [1, 3, 5],
    stops: [
      {
        stationId: network.origin,
        sequence: 0,
        departureOffsetMinutes: 0,
      },
      {
        stationId: network.destination,
        sequence: 1,
        arrivalOffsetMinutes: 700,
      },
    ],
  })
  return { client, userId, bookletId, scheduleId, ...network }
}

describe("CRUD des livrets horaires", () => {
  it("modifie l'en-tête et journalise les valeurs avant/après", async () => {
    const t = convexTest(schema, modules)
    const { client, bookletId } = await fixture(t)
    await client.mutation(api.functions.booklets.update, {
      bookletId,
      label: "  Livret corrigé  ",
      description: "  Offre du premier trimestre  ",
      validFrom: Date.parse("2027-01-15T00:00:00Z"),
      validUntil: Date.parse("2027-04-30T23:59:59Z"),
    })

    expect(await t.run((ctx) => ctx.db.get(bookletId))).toMatchObject({
      label: "Livret corrigé",
      description: "Offre du premier trimestre",
    })
    const audit = (
      await t.run((ctx) => ctx.db.query("auditLogs").collect())
    ).find((log) => log.action === "livret.modifier")
    expect(audit?.before).toContain("Livret en préparation")
    expect(audit?.after).toContain("Livret corrigé")
  })

  it("modifie puis retire un horaire de brouillon", async () => {
    const t = convexTest(schema, modules)
    const { client, bookletId, scheduleId, trainId, origin, destination } =
      await fixture(t)
    await client.mutation(api.functions.booklets.updateSchedule, {
      scheduleId,
      trainId,
      departureTime: "17:30",
      daysOfWeek: [],
      stops: [
        { stationId: origin, sequence: 0, departureOffsetMinutes: 0 },
        {
          stationId: destination,
          sequence: 1,
          arrivalOffsetMinutes: 720,
        },
      ],
    })
    expect(await t.run((ctx) => ctx.db.get(scheduleId))).toMatchObject({
      departureTime: "17:30",
      daysOfWeek: [],
    })

    await client.mutation(api.functions.booklets.removeSchedule, { scheduleId })
    expect(await t.run((ctx) => ctx.db.get(scheduleId))).toBeNull()
    await expect(
      client.mutation(api.functions.booklets.submit, { bookletId })
    ).rejects.toThrow(/Livret vide/)
  })

  it("valide l'heure, les jours et la chronologie d'un horaire", async () => {
    const t = convexTest(schema, modules)
    const { client, scheduleId, trainId, origin, destination } =
      await fixture(t)
    await expect(
      client.mutation(api.functions.booklets.updateSchedule, {
        scheduleId,
        trainId,
        departureTime: "25:10",
        daysOfWeek: [1],
        stops: [
          { stationId: origin, sequence: 0, departureOffsetMinutes: 0 },
          {
            stationId: destination,
            sequence: 1,
            arrivalOffsetMinutes: 700,
          },
        ],
      })
    ).rejects.toThrow(/format HH:MM/)
    await expect(
      client.mutation(api.functions.booklets.updateSchedule, {
        scheduleId,
        trainId,
        departureTime: "08:00",
        daysOfWeek: [1, 1],
        stops: [
          { stationId: origin, sequence: 0, departureOffsetMinutes: 0 },
          {
            stationId: destination,
            sequence: 1,
            arrivalOffsetMinutes: 700,
          },
        ],
      })
    ).rejects.toThrow(/Jours de circulation/)
  })

  it("permet de corriger puis resoumettre un livret rejeté", async () => {
    const t = convexTest(schema, modules)
    const { client, bookletId } = await fixture(t)
    await client.mutation(api.functions.booklets.submit, { bookletId })
    await client.mutation(api.functions.booklets.reject, {
      bookletId,
      reason: "  Ajouter une précision  ",
    })

    await client.mutation(api.functions.booklets.update, {
      bookletId,
      label: "Livret corrigé",
      description: "Précision ajoutée",
      validFrom: Date.parse("2027-01-01T00:00:00Z"),
      validUntil: Date.parse("2027-03-31T23:59:59Z"),
    })
    const corrected = await t.run((ctx) => ctx.db.get(bookletId))
    expect(corrected?.status).toBe("brouillon")
    expect(corrected?.rejectionReason).toBeUndefined()
    await expect(
      client.mutation(api.functions.booklets.submit, { bookletId })
    ).resolves.toBe("a_valider")
  })

  it("supprime entièrement un brouillon mais conserve les autres statuts", async () => {
    const t = convexTest(schema, modules)
    const first = await fixture(t)
    await first.client.mutation(api.functions.booklets.removeDraft, {
      bookletId: first.bookletId,
    })
    expect(await t.run((ctx) => ctx.db.get(first.bookletId))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(first.scheduleId))).toBeNull()

    const second = await fixture(t)
    await second.client.mutation(api.functions.booklets.submit, {
      bookletId: second.bookletId,
    })
    await expect(
      second.client.mutation(api.functions.booklets.removeDraft, {
        bookletId: second.bookletId,
      })
    ).rejects.toThrow(/Seul un livret en brouillon/)
  })

  it("réserve modifications et suppressions aux droits correspondants", async () => {
    const t = convexTest(schema, modules)
    const { bookletId, scheduleId, trainId, origin, destination } =
      await fixture(t)
    const { client: reader } = await asRole(t, "vendeur_guichet")
    await expect(
      reader.mutation(api.functions.booklets.updateSchedule, {
        scheduleId,
        trainId,
        departureTime: "09:00",
        daysOfWeek: [],
        stops: [
          { stationId: origin, sequence: 0, departureOffsetMinutes: 0 },
          {
            stationId: destination,
            sequence: 1,
            arrivalOffsetMinutes: 700,
          },
        ],
      })
    ).rejects.toThrow(/Accès refusé/)
    await expect(
      reader.mutation(api.functions.booklets.removeDraft, { bookletId })
    ).rejects.toThrow(/Accès refusé/)
  })
})
