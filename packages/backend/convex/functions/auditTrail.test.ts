import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "../_generated/api"
import type { AppRole } from "../model/permissions"
import schema from "../schema"
import { modules } from "../test.setup"

async function asRole(t: ReturnType<typeof convexTest>, role: AppRole, nom: string) {
  const authId = `${role}-${nom}`
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: nom,
      lastName: "Test",
      matricule: `M-${nom}`,
      role,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return { client: t.withIdentity({ subject: authId }), userId }
}

describe("Journal d'audit", () => {
  it("pagine, filtre par agent, famille et texte, détaille et scelle", async () => {
    const t = convexTest(schema, modules)
    const { client, userId } = await asRole(t, "admin_it", "Dsi")
    const { userId: autre } = await asRole(t, "chef_gare", "Serge")
    const hier = Date.now() - 2 * 86_400_000
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        actorId: autre,
        action: "place.bloquer",
        entityTable: "seatBlocks",
        entityId: "bloc-1",
        reason: "Réservation protocole",
        after: JSON.stringify({ place: "3A" }),
        deviceId: "OWE-SUP",
        createdAt: hier,
      })
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        action: "utilisateur.modifier",
        entityTable: "users",
        entityId: "u-1",
        before: JSON.stringify({ role: "vendeur_guichet" }),
        after: JSON.stringify({ role: "chef_gare" }),
        result: "succes",
        createdAt: hier + 1000,
      })
      await ctx.db.insert("auditLogs", {
        action: "integrations.rejouer_echecs",
        entityTable: "outboxEvents",
        entityId: "batch",
        result: "echec",
        createdAt: hier + 2000,
      })
    })

    const tout = await client.query(api.functions.auditTrail.journal, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(tout.page.map((l) => l.action)).toEqual([
      "integrations.rejouer_echecs",
      "utilisateur.modifier",
      "place.bloquer",
    ])
    expect(tout.page[2]).toMatchObject({ acteur: { court: "S. Test" }, result: "succes" })

    const places = await client.query(api.functions.auditTrail.journal, {
      paginationOpts: { numItems: 10, cursor: null },
      categorie: "places",
    })
    expect(places.page.map((l) => l.entityId)).toEqual(["bloc-1"])
    const parAgent = await client.query(api.functions.auditTrail.journal, {
      paginationOpts: { numItems: 10, cursor: null },
      acteurId: userId,
    })
    expect(parAgent.page).toHaveLength(1)
    const echecs = await client.query(api.functions.auditTrail.journal, {
      paginationOpts: { numItems: 10, cursor: null },
      resultat: "echec",
    })
    expect(echecs.page.map((l) => l.action)).toEqual(["integrations.rejouer_echecs"])
    const texte = await client.query(api.functions.auditTrail.journal, {
      paginationOpts: { numItems: 10, cursor: null },
      recherche: "protocole",
    })
    expect(texte.page.map((l) => l.entityId)).toEqual(["bloc-1"])

    const avantScellement = await client.query(api.functions.auditTrail.entree, {
      logId: tout.page[1]!._id,
    })
    expect(avantScellement?.scellement).toBeNull()
    expect(JSON.parse(avantScellement!.log.after!)).toEqual({ role: "chef_gare" })

    await t.mutation(internal.modules.platform.audit.sealWindow, {
      windowStart: hier - 1000,
      windowEnd: hier + 10_000,
    })
    const scellee = await client.query(api.functions.auditTrail.entree, {
      logId: tout.page[1]!._id,
    })
    expect(scellee?.scellement).toMatchObject({ logCount: 3, sealHash: expect.any(String) })
    expect((await client.query(api.functions.auditTrail.scellement, {})).dernier?.logCount).toBe(3)
  })

  it("trace l'export et refuse la consultation sans droit sur les comptes", async () => {
    const t = convexTest(schema, modules)
    const { client } = await asRole(t, "admin_it", "Dsi")
    const { client: chef } = await asRole(t, "chef_gare", "Serge")
    await t.run((ctx) =>
      ctx.db.insert("auditLogs", {
        action: "livret.soumettre",
        entityTable: "timetableBooklets",
        entityId: "lv-1",
        createdAt: Date.now() - 1000,
      })
    )
    const exporte = await client.mutation(api.functions.auditTrail.exporterJournal, {
      categorie: "referentiels",
    })
    expect(exporte.lignes.map((l) => l.action)).toEqual(["livret.soumettre"])
    const traces = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).map((l) => l.action)
    )
    expect(traces).toContain("audit.exporter")
    await expect(
      chef.query(api.functions.auditTrail.journal, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrow(/Accès refusé/)
  })
})
