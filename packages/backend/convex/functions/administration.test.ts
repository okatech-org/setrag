import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { AppRole } from "../model/permissions"
import schema from "../schema"
import { modules } from "../test.setup"

async function asRole(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  suffix: string | number = Math.floor(Math.random() * 1e9)
) {
  const authId = `${role}-${suffix}`
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      email: `${authId}@setrag.ga`,
      firstName: "Admin",
      lastName: "Test",
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { client: t.withIdentity({ subject: authId }), userId }
}

async function seedPricingRule(
  t: ReturnType<typeof convexTest>,
  createdBy: Id<"users">
) {
  return await t.run((ctx) =>
    ctx.db.insert("pricingRules", {
      scope: "reseau",
      type: "remplissage",
      threshold: 70,
      modifierPct: 10,
      priority: 20,
      floorXaf: 2_000,
      capXaf: 150_000,
      code: "REMPLISSAGE_70",
      isActive: true,
      createdBy,
    })
  )
}

describe("Administration du yield", () => {
  it("modifie puis suspend et réactive une règle avec audit", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "admin_fonctionnel")
    const ruleId = await seedPricingRule(t, userId)

    await client.mutation(api.functions.administration.updatePricingRule, {
      ruleId,
      scope: "reseau",
      serviceClass: "PREMIERE",
      type: "anticipation",
      threshold: 14,
      modifierPct: -12,
      priority: 5,
      validFrom: Date.parse("2026-08-01T00:00:00Z"),
      validUntil: Date.parse("2026-09-01T00:00:00Z"),
      floorXaf: 5_000,
      capXaf: 120_000,
      code: "anticipation_14",
    })
    expect(await t.run((ctx) => ctx.db.get(ruleId))).toMatchObject({
      code: "ANTICIPATION_14",
      serviceClass: "PREMIERE",
      type: "anticipation",
      threshold: 14,
      modifierPct: -12,
      priority: 5,
    })

    await client.mutation(api.functions.administration.setPricingRuleStatus, {
      ruleId,
      isActive: false,
    })
    await client.mutation(api.functions.administration.setPricingRuleStatus, {
      ruleId,
      isActive: true,
    })
    expect((await t.run((ctx) => ctx.db.get(ruleId)))?.isActive).toBe(true)

    const actions = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).map((log) => log.action)
    )
    expect(actions).toContain("yield.regle.modifier")
    expect(actions).toContain("yield.regle.suspendre")
    expect(actions).toContain("yield.regle.reactiver")
  })

  it("refuse une règle incohérente", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "admin_fonctionnel")
    const ruleId = await seedPricingRule(t, userId)

    await expect(
      client.mutation(api.functions.administration.updatePricingRule, {
        ruleId,
        scope: "desserte",
        type: "remplissage",
        threshold: 120,
        modifierPct: 10,
        priority: 1,
        floorXaf: 20_000,
        capXaf: 10_000,
        code: "INVALIDE",
      })
    ).rejects.toThrow("remplissage")
  })
})

describe("Administration des utilisateurs", () => {
  it("modifie le profil, le rôle et le rattachement autorisés", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asRole(t, "admin_it")
    const pointOfSaleId = await t.run((ctx) =>
      ctx.db.insert("pointsOfSale", {
        code: "OWE-PV",
        name: "Owendo",
        type: "gare",
        counters: { passengers: 4, baggage: 1, parcels: 1 },
        isActive: true,
      })
    )
    const targetId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "target-user",
        email: "OLD@EXAMPLE.COM",
        role: "responsable_kpi",
        identitySource: "annuaire",
        isActive: true,
      })
    )

    await client.mutation(api.functions.administration.updateManagedUser, {
      userId: targetId,
      email: "  vendeur@example.com ",
      phone: "+241 06 00 00 00",
      firstName: "  Olga ",
      lastName: "Mboumba",
      role: "vendeur_guichet",
      matricule: " v-204 ",
      pointOfSaleId,
    })

    expect(await t.run((ctx) => ctx.db.get(targetId))).toMatchObject({
      authId: "target-user",
      identitySource: "annuaire",
      email: "vendeur@example.com",
      phone: "+24106000000",
      firstName: "Olga",
      lastName: "Mboumba",
      role: "vendeur_guichet",
      matricule: "V-204",
      pointOfSaleId,
      isActive: true,
    })
  })

  it("suspend et réactive sans effacer le compte", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asRole(t, "admin_it", "principal")
    await asRole(t, "admin_it", "secours")
    const targetId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "target-kpi",
        role: "responsable_kpi",
        identitySource: "local",
        isActive: true,
      })
    )

    await client.mutation(api.functions.administration.setManagedUserStatus, {
      userId: targetId,
      isActive: false,
    })
    expect((await t.run((ctx) => ctx.db.get(targetId)))?.isActive).toBe(false)
    await client.mutation(api.functions.administration.setManagedUserStatus, {
      userId: targetId,
      isActive: true,
    })
    expect((await t.run((ctx) => ctx.db.get(targetId)))?.isActive).toBe(true)
  })

  it("interdit l’auto-suspension et protège le dernier admin technique", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "admin_it")

    await expect(
      client.mutation(api.functions.administration.setManagedUserStatus, {
        userId,
        isActive: false,
      })
    ).rejects.toThrow("propre compte")

    const targetAdminId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "admin-cible",
        role: "admin_it",
        identitySource: "local",
        isActive: true,
      })
    )
    await client.mutation(api.functions.administration.setManagedUserStatus, {
      userId: targetAdminId,
      isActive: false,
    })
    await expect(
      client.mutation(api.functions.administration.setManagedUserStatus, {
        userId,
        isActive: false,
      })
    ).rejects.toThrow("propre compte")
  })
})
