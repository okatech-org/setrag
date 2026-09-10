import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "../../_generated/api"
import schema from "../../schema"
import { modules } from "../../test.setup"

async function seedUser(
  t: ReturnType<typeof convexTest>,
  authId: string,
  role: "admin_fonctionnel" | "vendeur_guichet"
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

describe("Administration de la fondation plateforme", () => {
  it("configure et audite les référentiels, l'affectation et l'activation", async () => {
    const t = convexTest(schema, modules)
    const admin = await seedUser(t, "admin-fondation", "admin_fonctionnel")
    const target = await seedUser(t, "agent-fret", "vendeur_guichet")

    const organizationId = await admin.client.mutation(
      api.modules.platform.mutations.createOrganization,
      {
        code: " dir-fret ",
        name: " Direction Fret ",
        type: "direction",
      }
    )
    const siteId = await admin.client.mutation(
      api.modules.platform.mutations.createSite,
      {
        code: "owe-fret",
        name: "Terminal minéralier",
        type: "site",
        organizationId,
      }
    )
    const positionId = await admin.client.mutation(
      api.modules.platform.mutations.createPosition,
      {
        code: "chef-fret",
        name: "Chef de terminal",
        organizationId,
      }
    )
    const assignmentId = await admin.client.mutation(
      api.modules.platform.mutations.createUserAssignment,
      {
        userId: target.userId,
        role: "chef_gare",
        positionId,
        organizationId,
        siteId,
        validFrom: Date.now() - 1_000,
      }
    )

    const activationArgs = {
      moduleCode: "fret" as const,
      environment: "test" as const,
      siteId,
      isEnabled: true,
      reason: "Ouverture du pilote",
      correlationId: "PILOTE-FRET-001",
    }
    const firstActivationId = await admin.client.mutation(
      api.modules.platform.mutations.setModuleActivation,
      activationArgs
    )
    const secondActivationId = await admin.client.mutation(
      api.modules.platform.mutations.setModuleActivation,
      { ...activationArgs, reason: "Confirmation du pilote" }
    )

    expect(secondActivationId).toBe(firstActivationId)
    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      assignment: await ctx.db.get(assignmentId),
      activations: await ctx.db.query("moduleActivations").collect(),
      logs: await ctx.db.query("auditLogs").collect(),
    }))
    expect(state.organization).toMatchObject({
      code: "DIR-FRET",
      name: "Direction Fret",
    })
    expect(state.assignment).toMatchObject({
      userId: target.userId,
      role: "chef_gare",
      siteId,
      isActive: true,
      createdBy: admin.userId,
    })
    expect(state.activations).toHaveLength(1)
    expect(state.activations[0]).toMatchObject({
      changedBy: admin.userId,
      reason: "Confirmation du pilote",
      correlationId: "PILOTE-FRET-001",
    })
    expect(state.logs.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "plateforme.organisation.creer",
        "plateforme.site.creer",
        "plateforme.poste.creer",
        "plateforme.affectation.creer",
        "plateforme.module.activation",
      ])
    )
  })

  it("refuse l'administration à un rôle métier", async () => {
    const t = convexTest(schema, modules)
    const seller = await seedUser(t, "vendeur-fondation", "vendeur_guichet")

    await expect(
      seller.client.mutation(
        api.modules.platform.mutations.createOrganization,
        {
          code: "INTERDIT",
          name: "Interdit",
          type: "partenaire",
        }
      )
    ).rejects.toThrow("ne peut pas")
  })
})
