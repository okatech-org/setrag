import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { AppRole } from "../model/permissions"
import schema from "../schema"
import { modules } from "../test.setup"

async function asRole(t: ReturnType<typeof convexTest>, role: AppRole) {
  const authId = `fare-${role}-${Math.random()}`
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

async function draftFixture(t: ReturnType<typeof convexTest>) {
  const { client, userId } = await asRole(t, "admin_fonctionnel")
  const scheduleId = await t.run((ctx) =>
    ctx.db.insert("fareSchedules", {
      label: "Barème 2027",
      status: "brouillon",
      validFrom: Date.parse("2027-01-01T00:00:00Z"),
      validUntil: Date.parse("2027-06-30T23:59:59Z"),
      roundingBasis: "TTC",
      vatPct: 18,
      cssPct: 0,
      createdBy: userId,
    })
  )
  // Séparation des tâches : un second administrateur approuve.
  const { client: approver } = await asRole(t, "admin_fonctionnel")
  return {
    client,
    approver,
    userId,
    scheduleId: scheduleId as Id<"fareSchedules">,
  }
}

const BASE = {
  trainType: "EXPRESS" as const,
  serviceClass: "DEUXIEME" as const,
  shortDistanceRate: 38,
  longDistanceRate: 34,
}

describe("Grilles tarifaires — détail et cycle de vie", () => {
  it("modifie le barème et gère ses bases tant qu'il est en brouillon", async () => {
    const t = convexTest(schema, modules)
    const { client, approver, scheduleId } = await draftFixture(t)

    await client.mutation(api.functions.fareSchedules.update, {
      scheduleId,
      label: "  Barème voyageurs 2027  ",
      validFrom: Date.parse("2027-02-01T00:00:00Z"),
      validUntil: Date.parse("2027-08-31T23:59:59Z"),
      roundingBasis: "HT",
      vatPct: 18,
      cssPct: 1,
    })
    const baseId = await client.mutation(
      api.functions.fareSchedules.upsertBase,
      { scheduleId, ...BASE }
    )
    await client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId,
      baseId,
      ...BASE,
      shortDistanceRate: 40,
    })

    const detail = await client.query(api.functions.fareSchedules.get, {
      scheduleId,
    })
    expect(detail.schedule).toMatchObject({
      label: "Barème voyageurs 2027",
      roundingBasis: "HT",
      cssPct: 1,
    })
    expect(detail.bases).toMatchObject([{ shortDistanceRate: 40 }])
  })

  it("exécute soumission, rejet, correction, nouvelle soumission et activation", async () => {
    const t = convexTest(schema, modules)
    const { client, approver, scheduleId } = await draftFixture(t)
    await client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId,
      ...BASE,
    })

    await expect(
      client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    ).resolves.toBe("a_valider")
    await expect(
      client.mutation(api.functions.fareSchedules.reject, {
        scheduleId,
        reason: "  Taux longue distance à revoir  ",
      })
    ).resolves.toBe("rejete")

    await client.mutation(api.functions.fareSchedules.update, {
      scheduleId,
      label: "Barème corrigé",
      validFrom: Date.parse("2027-01-01T00:00:00Z"),
      validUntil: Date.parse("2027-06-30T23:59:59Z"),
      roundingBasis: "TTC",
      vatPct: 18,
      cssPct: 0,
    })
    expect((await t.run((ctx) => ctx.db.get(scheduleId)))?.status).toBe(
      "brouillon"
    )

    await client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    await expect(
      approver.mutation(api.functions.fareSchedules.approve, { scheduleId })
    ).resolves.toBe("actif")
    const active = await t.run((ctx) => ctx.db.get(scheduleId))
    expect(active).toMatchObject({
      status: "actif",
      approvedBy: expect.any(String),
      approvedAt: expect.any(Number),
    })
  })

  it("expire une grille active sans supprimer son barème historique", async () => {
    const t = convexTest(schema, modules)
    const { client, approver, scheduleId } = await draftFixture(t)
    const baseId = await client.mutation(
      api.functions.fareSchedules.upsertBase,
      { scheduleId, ...BASE }
    )
    await client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    await approver.mutation(api.functions.fareSchedules.approve, { scheduleId })

    await expect(
      client.mutation(api.functions.fareSchedules.expire, { scheduleId })
    ).resolves.toBe("expire")
    expect(await t.run((ctx) => ctx.db.get(scheduleId))).toMatchObject({
      status: "expire",
    })
    expect(await t.run((ctx) => ctx.db.get(baseId))).toMatchObject(BASE)

    await expect(
      client.mutation(api.functions.fareSchedules.update, {
        scheduleId,
        label: "Altération historique",
        validFrom: 1,
        validUntil: 2,
        roundingBasis: "TTC",
        vatPct: 0,
        cssPct: 0,
      })
    ).rejects.toThrow(/plus modifiable/)
    await expect(
      client.mutation(api.functions.fareSchedules.removeBase, { baseId })
    ).rejects.toThrow(/historique/)
  })

  it("refuse d'activer deux grilles dont les périodes se chevauchent", async () => {
    const t = convexTest(schema, modules)
    const first = await draftFixture(t)
    await first.client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId: first.scheduleId,
      ...BASE,
    })
    await first.client.mutation(api.functions.fareSchedules.submit, {
      scheduleId: first.scheduleId,
    })
    await first.approver.mutation(api.functions.fareSchedules.approve, {
      scheduleId: first.scheduleId,
    })

    const secondId = await t.run((ctx) =>
      ctx.db.insert("fareSchedules", {
        label: "Barème concurrent",
        status: "a_valider",
        validFrom: Date.parse("2027-06-01T00:00:00Z"),
        validUntil: Date.parse("2027-12-31T23:59:59Z"),
        roundingBasis: "TTC",
        vatPct: 18,
        cssPct: 0,
        createdBy: first.userId,
      })
    )
    await t.run((ctx) =>
      ctx.db.insert("fareBases", {
        scheduleId: secondId,
        ...BASE,
      })
    )
    await expect(
      first.approver.mutation(api.functions.fareSchedules.approve, {
        scheduleId: secondId,
      })
    ).rejects.toThrow(/Chevauchement/)
  })

  it("refuse que l'auteur ou le soumetteur approuve sa propre grille", async () => {
    const t = convexTest(schema, modules)
    const { client, approver, scheduleId } = await draftFixture(t)
    await client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId,
      ...BASE,
    })
    await client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    expect(await t.run((ctx) => ctx.db.get(scheduleId))).toMatchObject({
      submittedBy: expect.any(String),
      submittedAt: expect.any(Number),
    })
    await expect(
      client.mutation(api.functions.fareSchedules.approve, { scheduleId })
    ).rejects.toThrow(/Séparation des tâches/)
    await expect(
      approver.mutation(api.functions.fareSchedules.approve, { scheduleId })
    ).resolves.toBe("actif")
  })

  it("applique les droits fins et journalise les actions", async () => {
    const t = convexTest(schema, modules)
    const { client, scheduleId, userId } = await draftFixture(t)
    const { client: reader } = await asRole(t, "vendeur_guichet")

    await expect(
      reader.mutation(api.functions.fareSchedules.upsertBase, {
        scheduleId,
        ...BASE,
      })
    ).rejects.toThrow(/Accès refusé/)

    await client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId,
      ...BASE,
    })
    await client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    const logs = await t.run((ctx) => ctx.db.query("auditLogs").collect())
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining(["tarif.base.creer", "tarif.grille.soumettre"])
    )
    expect(logs.every((log) => log.actorId === userId)).toBe(true)
  })

  it("refuse la soumission d'une grille vide et les doublons de base", async () => {
    const t = convexTest(schema, modules)
    const { client, approver, scheduleId } = await draftFixture(t)
    await expect(
      client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    ).rejects.toThrow(/Grille vide/)

    await client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId,
      ...BASE,
    })
    await expect(
      client.mutation(api.functions.fareSchedules.upsertBase, {
        scheduleId,
        ...BASE,
      })
    ).rejects.toThrow(/existe déjà/)
  })
})

describe("Réductions publiques (publicDiscounts)", () => {
  it("ne renvoie que les réductions actives de la grille active, triées par taux décroissant", async () => {
    const t = convexTest(schema, modules)
    const { client, approver, scheduleId } = await draftFixture(t)
    await client.mutation(api.functions.fareSchedules.upsertBase, {
      scheduleId,
      ...BASE,
    })
    await t.run((ctx) =>
      Promise.all([
        ctx.db.insert("discounts", {
          scheduleId,
          code: "ENFANT",
          label: "Enfant",
          ratePct: 50,
          minAge: 4,
          maxAge: 11,
          requiresProof: false,
          isActive: true,
        }),
        ctx.db.insert("discounts", {
          scheduleId,
          code: "MILITAIRE",
          label: "Militaire",
          ratePct: 10,
          requiresProof: true,
          isActive: true,
        }),
        ctx.db.insert("discounts", {
          scheduleId,
          code: "PROMOTIONNEL",
          label: "Promotion échue",
          ratePct: 20,
          requiresProof: false,
          isActive: false,
        }),
      ])
    )
    await client.mutation(api.functions.fareSchedules.submit, { scheduleId })
    await approver.mutation(api.functions.fareSchedules.approve, { scheduleId })

    const discounts = await t.query(
      api.functions.fareSchedules.publicDiscounts,
      {}
    )
    // La réduction inactive (PROMOTIONNEL) est absente, et l'ordre suit le
    // taux décroissant, pas l'ordre d'insertion.
    expect(discounts.map((d) => d.code)).toEqual(["ENFANT", "MILITAIRE"])
    expect(discounts[0]).toMatchObject({
      code: "ENFANT",
      ratePct: 50,
      minAge: 4,
      maxAge: 11,
      requiresProof: false,
    })
  })

  it("renvoie une liste vide sans grille tarifaire active", async () => {
    const t = convexTest(schema, modules)
    const discounts = await t.query(
      api.functions.fareSchedules.publicDiscounts,
      {}
    )
    expect(discounts).toEqual([])
  })
})
