import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"

async function asRole(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  suffix: string
) {
  const authId = `${role}-${suffix}`
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { client: t.withIdentity({ subject: authId }), userId }
}

async function seedSite(
  t: ReturnType<typeof convexTest>,
  actorId: Id<"users">,
  code: string
) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const organizationId = await ctx.db.insert("organizations", {
      code: `ORG-${code}`,
      name: `Organisation ${code}`,
      type: "direction",
      isActive: true,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    })
    const siteId = await ctx.db.insert("sites", {
      code,
      name: `Site ${code}`,
      type: "gare",
      organizationId,
      isActive: true,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    })
    return { organizationId, siteId }
  })
}

async function activate(
  t: ReturnType<typeof convexTest>,
  changedBy: Id<"users">,
  isEnabled: boolean,
  scope: { siteId?: Id<"sites">; userId?: Id<"users"> } = {}
) {
  return await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "fret",
      environment: "test",
      ...scope,
      isEnabled,
      reason: "Test d'accès",
      correlationId: `test-${Math.random()}`,
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

describe("Accès modulaire Fret", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("autorise les rôles Fret et retourne un dashboard réellement vide", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client } = await asRole(t, "responsable_kpi", "positif")

    await expect(
      client.query(api.modules.platform.queries.listMyModules, {})
    ).resolves.toContain("fret")
    await expect(
      client.query(api.modules.fret.queries.dashboard, {})
    ).resolves.toEqual({
      moduleCode: "fret",
      dataState: "empty",
      accessibleSiteIds: [],
      kpis: [],
      operations: [],
      alerts: [],
    })
  })

  it("refuse un rôle non habilité même avec un override utilisateur actif", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "vendeur_guichet", "refus")
    await activate(t, userId, true, { userId })

    const access = await client.query(
      api.modules.platform.queries.getMyModuleAccess,
      { moduleCode: "fret" }
    )
    expect(access).toMatchObject({
      enabled: true,
      permissionGranted: false,
      canAccess: false,
      activationSource: "user",
      permissionSource: null,
    })
    await expect(
      client.query(api.modules.fret.queries.dashboard, {})
    ).rejects.toThrow("aucune affectation")
  })

  it("combine des affectations multiples et effectives-datées", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "vendeur_guichet", "affecte")
    const { siteId } = await seedSite(t, userId, "OWE")
    const now = Date.now()

    await t.run(async (ctx) => {
      const common = {
        userId,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        isActive: true,
      }
      await ctx.db.insert("userAssignments", {
        ...common,
        role: "admin_fonctionnel",
        validFrom: now - 20_000,
        validUntil: now - 10_000,
      })
      await ctx.db.insert("userAssignments", {
        ...common,
        role: "chef_gare",
        siteId,
        validFrom: now - 1_000,
        validUntil: now + 60_000,
      })
      await ctx.db.insert("userAssignments", {
        ...common,
        role: "responsable_kpi",
        validFrom: now + 60_000,
      })
    })

    const landing = await client.query(
      api.modules.platform.queries.getMyModuleAccess,
      { moduleCode: "fret" }
    )
    expect(landing).toMatchObject({
      canAccess: true,
      permissionSource: "assignment",
      hasGlobalScope: false,
      accessibleSiteIds: [siteId],
    })
    await expect(
      client.query(api.modules.fret.queries.dashboard, {})
    ).resolves.toMatchObject({ accessibleSiteIds: [siteId] })

    await activate(t, userId, false, { siteId })
    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
      })
    ).resolves.toMatchObject({
      permissionGranted: true,
      enabled: false,
      canAccess: false,
      accessibleSiteIds: [],
    })
    await expect(
      client.query(api.modules.fret.queries.dashboard, {})
    ).rejects.toThrow("Module désactivé")
  })

  it("refuse un compte désactivé avant toute autre décision", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "responsable_kpi", "inactif")
    await t.run((ctx) => ctx.db.patch(userId, { isActive: false }))

    await expect(
      client.query(api.modules.fret.queries.dashboard, {})
    ).rejects.toThrow("Compte désactivé")
  })

  it("applique la désactivation globale", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "responsable_kpi", "global")
    await activate(t, userId, false)

    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
      })
    ).resolves.toMatchObject({
      enabled: false,
      canAccess: false,
      activationSource: "environment",
    })
    await expect(
      client.query(api.modules.fret.queries.dashboard, {})
    ).rejects.toThrow("Module désactivé")
  })

  it("applique la précédence utilisateur puis site puis environnement", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "responsable_kpi", "precedence")
    const { siteId } = await seedSite(t, userId, "MDA")
    const globalId = await activate(t, userId, false)
    const siteActivationId = await activate(t, userId, true, { siteId })
    const userActivationId = await activate(t, userId, false, {
      siteId,
      userId,
    })

    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
        siteId,
      })
    ).resolves.toMatchObject({
      enabled: false,
      activationSource: "user",
    })

    await t.run((ctx) => ctx.db.delete(userActivationId))
    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
        siteId,
      })
    ).resolves.toMatchObject({ enabled: true, activationSource: "site" })

    await t.run((ctx) => ctx.db.delete(siteActivationId))
    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
        siteId,
      })
    ).resolves.toMatchObject({
      enabled: false,
      activationSource: "environment",
    })
    expect(await t.run((ctx) => ctx.db.get(globalId))).not.toBeNull()
  })

  it("isole une désactivation de site des autres sites", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "responsable_kpi", "sites")
    const first = await seedSite(t, userId, "NTJ")
    const second = await seedSite(t, userId, "FCV")
    await activate(t, userId, false, { siteId: first.siteId })

    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
        siteId: first.siteId,
      })
    ).resolves.toMatchObject({ enabled: false, activationSource: "site" })
    await expect(
      client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
        siteId: second.siteId,
      })
    ).resolves.toMatchObject({ enabled: true, activationSource: "default" })
  })
})
