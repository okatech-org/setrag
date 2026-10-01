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
      dataset: null,
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

describe("Niveaux d'accès modulaires", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("dérive Lecture et Utilisation du rôle, et Admin du système", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const direction = await asRole(t, "direction_generale", "lecture")
    const seller = await asRole(t, "vendeur_guichet", "utilisation")
    const dsi = await asRole(t, "admin_it", "admin")

    await expect(
      direction.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "voyageurs",
      })
    ).resolves.toMatchObject({
      accessLevel: "lecture",
      accessSource: "role",
      canAccess: true,
    })
    await expect(
      seller.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "voyageurs",
      })
    ).resolves.toMatchObject({
      accessLevel: "utilisation",
      accessSource: "role",
      canAccess: true,
    })
    await expect(
      dsi.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "voyageurs",
      })
    ).resolves.toMatchObject({
      accessLevel: "admin",
      accessSource: "system",
      canAccess: true,
    })
    await expect(
      seller.client.query(api.modules.platform.queries.listMyModuleAccesses, {})
    ).resolves.toHaveLength(10)
  })

  it("applique un override explicite puis un refus, avec audit avant/après", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "override")
    const seller = await asRole(t, "vendeur_guichet", "override")

    const firstGrantId = await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: seller.userId,
        moduleCode: "fret",
        accessLevel: "lecture",
        reason: "Consultation du tableau de bord fret",
      }
    )
    await expect(
      seller.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
      })
    ).resolves.toMatchObject({
      accessLevel: "lecture",
      accessSource: "grant",
      canAccess: true,
    })
    // Le grant porte sur la ressource d'entrée Fret elle-même : Lecture suffit
    // au dashboard, sans ouvrir les éventuelles sous-ressources métier.
    await expect(
      seller.client.query(api.modules.fret.queries.dashboard, {})
    ).resolves.toMatchObject({ moduleCode: "fret", dataState: "empty" })

    const refusalGrantId = await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: seller.userId,
        moduleCode: "fret",
        reason: "Fin de la mission fret",
      }
    )
    expect(refusalGrantId).toBe(firstGrantId)
    await expect(
      seller.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
      })
    ).resolves.toMatchObject({
      accessLevel: null,
      accessSource: "grant",
      canAccess: false,
    })
    await expect(
      seller.client.query(api.modules.fret.queries.dashboard, {})
    ).rejects.toThrow("aucune affectation ni attribution")

    const state = await t.run(async (ctx) => ({
      grants: await ctx.db.query("moduleAccessGrants").collect(),
      logs: await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (query) =>
          query.eq("action", "plateforme.module.acces.attribuer")
        )
        .collect(),
    }))
    expect(state.grants).toHaveLength(1)
    expect(state.grants[0]).toMatchObject({
      userId: seller.userId,
      moduleCode: "fret",
      reason: "Fin de la mission fret",
      grantedBy: dsi.userId,
    })
    expect(state.grants[0].accessLevel).toBeUndefined()
    expect(state.logs).toHaveLength(2)
    expect(state.logs[1].before).toContain('"accessLevel":"lecture"')
    expect(state.logs[1].after).not.toContain("accessLevel")
  })

  it("conserve la portée site des affectations malgré un grant direct", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "scope")
    const scoped = await asRole(t, "vendeur_guichet", "scope")
    const { siteId } = await seedSite(t, dsi.userId, "SCOPE")
    const now = Date.now()
    await t.run(async (ctx) => {
      const common = {
        userId: scoped.userId,
        siteId,
        validFrom: now - 1_000,
        isActive: true,
        createdBy: dsi.userId,
        createdAt: now,
        updatedAt: now,
      }
      await ctx.db.insert("userAssignments", {
        ...common,
        role: "chef_gare",
      })
    })

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: scoped.userId,
        moduleCode: "fret",
        accessLevel: "utilisation",
        reason: "Usage Fret limité au site d'affectation",
      }
    )
    await expect(
      scoped.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
      })
    ).resolves.toMatchObject({
      accessLevel: "utilisation",
      accessSource: "grant",
      hasGlobalScope: false,
      accessibleSiteIds: [siteId],
    })
    await expect(
      scoped.client.query(api.modules.fret.queries.dashboard, {})
    ).resolves.toMatchObject({ accessibleSiteIds: [siteId] })

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: scoped.userId,
        moduleCode: "finance",
        accessLevel: "lecture",
        reason: "Lecture Finance limitée au site d'affectation",
      }
    )
    await expect(
      scoped.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "finance",
      })
    ).resolves.toMatchObject({
      enabled: true,
      accessLevel: "lecture",
      hasGlobalScope: false,
      accessibleSiteIds: [siteId],
    })
    const activation = await t.run((ctx) =>
      ctx.db
        .query("moduleActivations")
        .withIndex("by_environment_module_user", (query) =>
          query
            .eq("environment", "test")
            .eq("moduleCode", "finance")
            .eq("userId", scoped.userId)
        )
        .unique()
    )
    expect(activation).toMatchObject({ siteId, isEnabled: true })
    await expect(
      scoped.client.query(api.modules.finance.queries.getFinanceOverview, {})
    ).resolves.toMatchObject({ dataState: "empty" })
    const financeCommand = {
      chart: {
        code: "TEST-GRANT-SCOPE",
        label: "Plan du grant explicite",
        version: 1,
        legalSourceLabel: "Source de test",
        legalSourceUrl: "https://example.test/source",
        effectiveFrom: "2026-01-01",
      },
      account: {
        code: "5211",
        label: "Compte du grant explicite",
        isPostingAllowed: true,
      },
      reason: "Validation du niveau explicite",
      idempotencyKey: "TEST-GRANT-FINANCE-LEVEL",
      correlationId: "TEST-GRANT-FINANCE-LEVEL",
    }
    await expect(
      scoped.client.mutation(
        api.modules.finance.mutations.upsertAccount,
        financeCommand
      )
    ).rejects.toThrow("ne permet pas l'action")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: scoped.userId,
        moduleCode: "finance",
        accessLevel: "utilisation",
        reason: "Utilisation Finance limitée au site d'affectation",
      }
    )
    await expect(
      scoped.client.mutation(
        api.modules.finance.mutations.upsertAccount,
        financeCommand
      )
    ).rejects.toThrow("niveau « utilisation »")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: scoped.userId,
        moduleCode: "finance",
        accessLevel: "admin",
        reason: "Administration Finance limitée au site d'affectation",
      }
    )
    await expect(
      scoped.client.mutation(
        api.modules.finance.mutations.upsertAccount,
        financeCommand
      )
    ).resolves.toMatchObject({ created: true })
  })

  it("active une attribution positive sans réactiver un refus explicite", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "auto-activation")
    const accountant = await asRole(t, "comptable", "auto-activation")

    await expect(
      accountant.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "finance",
      })
    ).resolves.toMatchObject({ enabled: false, canAccess: false })
    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: accountant.userId,
        moduleCode: "finance",
        accessLevel: "lecture",
        reason: "Ouverture contrôlée de Finance",
      }
    )
    await expect(
      accountant.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "finance",
      })
    ).resolves.toMatchObject({
      enabled: true,
      accessLevel: "lecture",
      accessSource: "grant",
      hasGlobalScope: true,
      canAccess: true,
    })

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: accountant.userId,
        moduleCode: "rh",
        reason: "Refus RH explicite",
      }
    )
    const state = await t.run(async (ctx) => ({
      activations: await ctx.db.query("moduleActivations").collect(),
      autoActivationLogs: await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (query) =>
          query.eq("action", "plateforme.module.activation.auto_attribution")
        )
        .collect(),
    }))
    expect(state.activations).toHaveLength(1)
    expect(state.activations[0]).toMatchObject({
      moduleCode: "finance",
      userId: accountant.userId,
      isEnabled: true,
      changedBy: dsi.userId,
    })
    expect(state.autoActivationLogs).toHaveLength(1)
  })

  it("maintient toujours le niveau Admin de l'admin IT malgré un refus direct", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "inabaissable")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: dsi.userId,
        moduleCode: "fret",
        reason: "Tentative de plafonnement",
      }
    )
    await expect(
      dsi.client.query(api.modules.platform.queries.getMyModuleAccess, {
        moduleCode: "fret",
      })
    ).resolves.toMatchObject({
      accessLevel: "admin",
      accessSource: "system",
      canAccess: true,
    })
  })

  it("borne l'administration déléguée au seul module attribué", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "delegation")
    const delegated = await asRole(t, "gestionnaire_fret", "delegation")
    const target = await asRole(t, "vendeur_guichet", "delegation")

    await expect(
      delegated.client.query(
        api.modules.platform.queries.listModuleAccessAdministration,
        {}
      )
    ).rejects.toThrow("aucun module administrable")
    await expect(
      delegated.client.mutation(
        api.modules.platform.mutations.setModuleAccessLevel,
        {
          userId: target.userId,
          moduleCode: "fret",
          accessLevel: "lecture",
          reason: "Attribution non autorisée",
        }
      )
    ).rejects.toThrow("exige le niveau « admin »")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: delegated.userId,
        moduleCode: "fret",
        accessLevel: "admin",
        reason: "Délégation de l'administration fret",
      }
    )
    const matrix = await delegated.client.query(
      api.modules.platform.queries.listModuleAccessAdministration,
      {}
    )
    expect(matrix.modules.map(({ code }) => code)).toEqual(["fret"])
    expect(matrix.users).toHaveLength(3)
    // La clientèle n'entre pas dans la matrice : aucun accès modulaire à régler.
    await asRole(t, "voyageur", "delegation")
    const sansClientele = await delegated.client.query(
      api.modules.platform.queries.listModuleAccessAdministration,
      {}
    )
    expect(sansClientele.users).toHaveLength(3)
    expect(matrix.cells).toHaveLength(3)

    await expect(
      delegated.client.mutation(
        api.modules.platform.mutations.setModuleAccessLevel,
        {
          userId: target.userId,
          moduleCode: "fret",
          accessLevel: "utilisation",
          reason: "Délégation d'utilisation fret",
        }
      )
    ).resolves.toBeDefined()
    await expect(
      delegated.client.mutation(
        api.modules.platform.mutations.setModuleAccessLevel,
        {
          userId: target.userId,
          moduleCode: "finance",
          accessLevel: "lecture",
          reason: "Tentative hors périmètre",
        }
      )
    ).rejects.toThrow("exige le niveau « admin »")
    await expect(
      delegated.client.mutation(
        api.modules.platform.mutations.setModuleActivation,
        {
          moduleCode: "fret",
          environment: "test",
          isEnabled: true,
          reason: "Activation déléguée",
          correlationId: "TEST-DELEGATION-FRET",
        }
      )
    ).resolves.toBeDefined()
  })

  it("valide tout un lot avant d'appliquer atomiquement ses changements", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "batch")
    const delegated = await asRole(t, "gestionnaire_fret", "batch")
    const firstTarget = await asRole(t, "vendeur_guichet", "batch-first")
    const secondTarget = await asRole(t, "vendeur_guichet", "batch-second")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: delegated.userId,
        moduleCode: "fret",
        accessLevel: "admin",
        reason: "Délégation Fret pour le test atomique",
      }
    )
    await expect(
      delegated.client.mutation(
        api.modules.platform.mutations.setModuleAccessLevelsBatch,
        {
          changes: [
            {
              userId: firstTarget.userId,
              moduleCode: "fret",
              accessLevel: "lecture",
            },
            {
              userId: secondTarget.userId,
              moduleCode: "finance",
              accessLevel: "lecture",
            },
          ],
          reason: "Lot hors périmètre",
        }
      )
    ).rejects.toThrow("exige le niveau « admin »")
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("moduleAccessGrants")
          .withIndex("by_user", (query) =>
            query.eq("userId", firstTarget.userId)
          )
          .collect()
      )
    ).toEqual([])

    await expect(
      dsi.client.mutation(
        api.modules.platform.mutations.setModuleAccessLevelsBatch,
        {
          changes: [
            {
              userId: firstTarget.userId,
              moduleCode: "voyageurs",
              accessLevel: "lecture",
            },
            {
              userId: secondTarget.userId,
              moduleCode: "fret",
              accessLevel: "utilisation",
            },
          ],
          reason: "Attribution atomique validée",
        }
      )
    ).resolves.toMatchObject({ updated: 2 })
    const targetGrants = await t.run(async (ctx) =>
      (await ctx.db.query("moduleAccessGrants").collect()).filter(
        ({ userId }) =>
          userId === firstTarget.userId || userId === secondTarget.userId
      )
    )
    expect(targetGrants).toHaveLength(2)
    expect(
      targetGrants.map(({ moduleCode, accessLevel }) => ({
        moduleCode,
        accessLevel,
      }))
    ).toEqual([
      { moduleCode: "voyageurs", accessLevel: "lecture" },
      { moduleCode: "fret", accessLevel: "utilisation" },
    ])
  })

  it("ouvre les référentiels historiques sans élargir les données sensibles", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "plafond")
    const functional = await asRole(t, "gestionnaire_fret", "plafond")
    const args = {
      label: "Test plafond modulaire",
      validFrom: Date.now(),
      validUntil: Date.now() + 86_400_000,
      vatPct: 18,
      cssPct: 1,
      trainType: "EXPRESS" as const,
      serviceClass: "DEUXIEME" as const,
      shortDistanceRate: 10,
      longDistanceRate: 8,
    }

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: functional.userId,
        moduleCode: "voyageurs",
        accessLevel: "lecture",
        reason: "Consultation seule",
      }
    )
    await expect(
      functional.client.query(api.functions.management.listFareSchedules, {})
    ).resolves.toEqual([])
    await expect(
      functional.client.mutation(
        api.functions.management.createFareSchedule,
        args
      )
    ).rejects.toThrow("ne permet pas « creer »")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: functional.userId,
        moduleCode: "voyageurs",
        accessLevel: "utilisation",
        reason: "Utilisation autorisée",
      }
    )
    await expect(
      functional.client.mutation(
        api.functions.management.createFareSchedule,
        args
      )
    ).rejects.toThrow("niveau « utilisation »")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: functional.userId,
        moduleCode: "voyageurs",
        accessLevel: "admin",
        reason: "Administration des référentiels Voyageurs",
      }
    )
    await expect(
      functional.client.mutation(
        api.functions.management.createFareSchedule,
        args
      )
    ).resolves.toBeDefined()
    await expect(
      dsi.client.mutation(api.functions.management.createFareSchedule, {
        ...args,
        label: "Interdit au DSI",
      })
    ).rejects.toThrow("ne peut pas")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleActivation,
      {
        moduleCode: "finance",
        environment: "test",
        isEnabled: true,
        reason: "Précondition du test de séparation Finance",
        correlationId: "TEST-DSI-FINANCE-SEPARATION",
      }
    )
    await expect(
      dsi.client.mutation(api.modules.finance.mutations.upsertAccount, {
        chart: {
          code: "TEST-DSI",
          label: "Plan interdit au DSI",
          version: 1,
          legalSourceLabel: "Source de test",
          legalSourceUrl: "https://example.test/source",
          effectiveFrom: "2026-01-01",
        },
        account: {
          code: "5211",
          label: "Compte interdit",
          isPostingAllowed: true,
        },
        reason: "Cette écriture doit être refusée",
        idempotencyKey: "TEST-DSI-FINANCE-WRITE",
        correlationId: "TEST-DSI-FINANCE-WRITE",
      })
    ).rejects.toThrow("aucune affectation")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleActivation,
      {
        moduleCode: "securite",
        environment: "test",
        isEnabled: true,
        reason: "Précondition du test de séparation Sécurité",
        correlationId: "TEST-DSI-SECURITE-SEPARATION",
      }
    )
    await expect(
      dsi.client.mutation(api.modules.platform.approvals.requestApproval, {
        moduleCode: "securite",
        entityType: "incident",
        entityId: "INCIDENT-INTERDIT-DSI",
        workflowCode: "SECURITE-DSI",
        reason: "Cette approbation doit être refusée",
        correlationId: "TEST-DSI-SECURITE-APPROBATION",
        steps: [{ label: "Validation sécurité" }],
      })
    ).rejects.toThrow("aucune affectation")
  })

  it("applique Lecture aux ressources transverses exposées sous Gestion", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const dsi = await asRole(t, "admin_it", "gestion-resources")
    const functional = await asRole(
      t,
      "admin_fonctionnel",
      "gestion-resources"
    )
    const target = await asRole(t, "vendeur_guichet", "gestion-target")

    await dsi.client.mutation(
      api.modules.platform.mutations.setModuleAccessLevel,
      {
        userId: functional.userId,
        moduleCode: "voyageurs",
        accessLevel: "lecture",
        reason: "Consultation seule de l'espace Gestion",
      }
    )

    await expect(
      functional.client.query(api.functions.management.getSettings, {})
    ).resolves.toMatchObject({ key: "commercial" })
    await expect(
      functional.client.query(api.functions.management.listUsers, {})
    ).resolves.toHaveLength(3)
    await expect(
      functional.client.query(api.functions.reportSchedules.list, {})
    ).resolves.toEqual([])
    await expect(
      functional.client.query(api.functions.monitoring.stuckOutboxEvents, {})
    ).resolves.toEqual([])

    await expect(
      functional.client.mutation(api.functions.management.saveSettings, {
        vatPct: 18,
        cssPct: 1,
        seatHoldMinutes: 15,
        mobilePaymentAttempts: 3,
        degradedSalesEnabled: true,
        cashVarianceNotificationsEnabled: true,
      })
    ).rejects.toThrow("niveau « lecture »")
    await expect(
      functional.client.mutation(
        api.functions.administration.updateManagedUser,
        {
          userId: target.userId,
          firstName: "Lecture interdite",
          role: "vendeur_guichet",
        }
      )
    ).rejects.toThrow("niveau « lecture »")
    await expect(
      functional.client.mutation(api.functions.reportSchedules.create, {
        label: "Rapport interdit en Lecture",
        reportType: "recettes",
        frequency: "mensuel",
        format: "pdf",
        recipients: ["dsi@example.test"],
        nextRunAt: Date.now() + 86_400_000,
      })
    ).rejects.toThrow("niveau « lecture »")
    await expect(
      functional.client.mutation(
        api.functions.management.retryIntegrationFailures,
        {}
      )
    ).rejects.toThrow("niveau « lecture »")
  })

  it("privilégie l'activation utilisateur par site sur son activation globale", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const seller = await asRole(t, "vendeur_guichet", "legacy-site")
    const { siteId } = await seedSite(t, seller.userId, "LEGACY-SITE")

    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode: "voyageurs",
        environment: "test",
        userId: seller.userId,
        isEnabled: false,
        reason: "Désactivation globale de l'utilisateur",
        correlationId: "TEST-VOYAGEURS-USER-GLOBAL-OFF",
        changedBy: seller.userId,
        updatedAt: Date.now(),
      })
    )
    await expect(
      seller.client.query(api.functions.management.listFareSchedules, {})
    ).rejects.toThrow("Module désactivé : voyageurs")

    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode: "voyageurs",
        environment: "test",
        siteId,
        userId: seller.userId,
        isEnabled: true,
        reason: "Réactivation sur le site autorisé",
        correlationId: "TEST-VOYAGEURS-USER-SITE-ON",
        changedBy: seller.userId,
        updatedAt: Date.now(),
      })
    )
    await expect(
      seller.client.query(api.functions.management.listFareSchedules, {})
    ).resolves.toEqual([])
  })

  it("bloque un endpoint Voyageurs historique quand le module est désactivé", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const seller = await asRole(t, "vendeur_guichet", "legacy-disabled")
    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode: "voyageurs",
        environment: "test",
        isEnabled: false,
        reason: "Maintenance Voyageurs",
        correlationId: "TEST-VOYAGEURS-DISABLED",
        changedBy: seller.userId,
        updatedAt: Date.now(),
      })
    )

    await expect(
      seller.client.query(api.functions.management.listFareSchedules, {})
    ).rejects.toThrow("Module désactivé : voyageurs")
  })
})
