import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"

/**
 * Sessions de caisse et journée comptable.
 *
 * Le circuit de contrôle des recettes du CDC §7.7 repose sur deux verrous :
 * un écart non justifié bloque la clôture de caisse, et une caisse ouverte
 * bloque la clôture de la journée. Ces deux règles sont les garde-fous
 * anti-fraude du système.
 */

async function seedPointOfSale(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("pointsOfSale", {
      code: "OWE-PV",
      name: "Owendo — point de vente",
      type: "gare",
      counters: { passengers: 4, baggage: 2, parcels: 2 },
      isActive: true,
    }),
  )
}

async function asUser(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  posId?: Id<"pointsOfSale">,
) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    }),
  )
  return { ctx: t.withIdentity({ subject: authId }), userId }
}

describe("Ouverture de caisse", () => {
  it("ouvre une session avec son fond de caisse", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "vendeur_guichet", pos)

    const id = await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 50000,
    })
    expect(id).toBeDefined()

    const etat = await ctx.query(api.functions.cash.mySession, {})
    expect(etat?.session.openingFloatXaf).toBe(50000)
    expect(etat?.session.status).toBe("ouverte")
    expect(etat?.salesCount).toBe(0)
  })

  it("crée la journée comptable si elle n'existe pas encore", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "vendeur_guichet", pos)
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 0,
    })
    const jours = await t.run(async (c) =>
      c.db.query("accountingDays").collect(),
    )
    expect(jours).toHaveLength(1)
    expect(jours[0]?.status).toBe("ouverte")
  })

  it("refuse une seconde session pour le même vendeur", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "vendeur_guichet", pos)
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 10000,
    })
    await expect(
      ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 10000 }),
    ).rejects.toThrow(/déjà ouverte/)
  })

  it("refuse un fond de caisse négatif", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "vendeur_guichet", pos)
    await expect(
      ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: -1 }),
    ).rejects.toThrow(/Fond de caisse invalide/)
  })

  it("refuse un agent sans point de vente", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asUser(t, "vendeur_guichet")
    await expect(
      ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 }),
    ).rejects.toThrow(/non rattaché/)
  })

  it("refuse un rôle non habilité à la caisse", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "responsable_kpi", pos)
    await expect(
      ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 }),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("retourne null quand aucune session n'est ouverte", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "vendeur_guichet", pos)
    expect(await ctx.query(api.functions.cash.mySession, {})).toBeNull()
  })
})

describe("Clôture de caisse", () => {
  async function openedSession(t: ReturnType<typeof convexTest>) {
    const pos = await seedPointOfSale(t)
    const { ctx, userId } = await asUser(t, "vendeur_guichet", pos)
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 50000,
    })
    return { ctx, userId, pos }
  }

  it("clôture sans écart quand le comptage correspond", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await openedSession(t)
    const resultat = await ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: 0 }],
    })
    expect(resultat.varianceXaf).toBe(0)
    expect(await ctx.query(api.functions.cash.mySession, {})).toBeNull()
  })

  it("bloque la clôture sur un écart non justifié", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await openedSession(t)
    await expect(
      ctx.mutation(api.functions.cash.closeSession, {
        countedByMethod: [{ method: "especes", amountXaf: -2000 }],
      }),
    ).rejects.toThrow(/justification est obligatoire/)
  })

  it("accepte un écart justifié et le conserve", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await openedSession(t)
    const resultat = await ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: -2000 }],
      varianceReason: "Erreur de rendu de monnaie constatée en fin de service",
    })
    expect(resultat.varianceXaf).toBe(-2000)

    const sessions = await t.run(async (c) =>
      c.db.query("cashSessions").collect(),
    )
    expect(sessions[0]?.status).toBe("cloturee")
    expect(sessions[0]?.varianceReason).toContain("rendu de monnaie")
  })

  it("rejette une justification vide", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await openedSession(t)
    await expect(
      ctx.mutation(api.functions.cash.closeSession, {
        countedByMethod: [{ method: "especes", amountXaf: 500 }],
        varianceReason: "   ",
      }),
    ).rejects.toThrow(/justification est obligatoire/)
  })

  it("refuse de clôturer sans session ouverte", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "vendeur_guichet", pos)
    await expect(
      ctx.mutation(api.functions.cash.closeSession, { countedByMethod: [] }),
    ).rejects.toThrow(/Aucune session de caisse ouverte/)
  })

  it("journalise la clôture avec le détail de l'écart", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await openedSession(t)
    await ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: 300 }],
      varianceReason: "Appoint non rendu",
    })
    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    const cloture = logs.find((l) => l.action === "caisse.cloturer")
    expect(cloture?.after).toContain("300")
  })
})

describe("Clôture de la journée comptable", () => {
  async function dayWithSession(t: ReturnType<typeof convexTest>) {
    const pos = await seedPointOfSale(t)
    const vendeur = await asUser(t, "vendeur_guichet", pos)
    await vendeur.ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 0,
    })
    const jour = await t.run(async (c) =>
      c.db.query("accountingDays").first(),
    )
    const controleur = await asUser(t, "controleur_recettes", pos)
    return { vendeur, controleur, dayId: jour!._id as Id<"accountingDays"> }
  }

  it("refuse de clôturer tant qu'une caisse est ouverte", async () => {
    const t = convexTest(schema, modules)
    const { controleur, dayId } = await dayWithSession(t)
    await expect(
      controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/encore ouverte/)
  })

  it("clôture une fois toutes les caisses fermées", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, controleur, dayId } = await dayWithSession(t)
    await vendeur.ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: 0 }],
    })
    const resultat = await controleur.ctx.mutation(
      api.functions.cash.closeAccountingDay,
      { accountingDayId: dayId },
    )
    expect(resultat.sessions).toBe(1)

    const jour = await t.run(async (c) => c.db.get(dayId))
    expect(jour?.status).toBe("cloturee")
    // La journée passe en attente de déversement comptable.
    expect(jour?.exportStatus).toBe("en_attente")
  })

  it("refuse de clôturer deux fois", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, controleur, dayId } = await dayWithSession(t)
    await vendeur.ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: 0 }],
    })
    await controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
      accountingDayId: dayId,
    })
    await expect(
      controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/déjà clôturée/)
  })

  it("réserve la clôture au contrôleur de recettes et au comptable", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, dayId } = await dayWithSession(t)
    await vendeur.ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: 0 }],
    })
    await expect(
      vendeur.ctx.mutation(api.functions.cash.closeAccountingDay, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("expose les états de contrôle de la journée", async () => {
    const t = convexTest(schema, modules)
    const { controleur, dayId } = await dayWithSession(t)
    const etats = await controleur.ctx.query(
      api.functions.cash.controlStates,
      { accountingDayId: dayId },
    )
    expect(etats.sessions).toHaveLength(1)
    expect(etats.openSessions).toBe(1)
    expect(etats.unjustifiedVariances).toBe(0)
    expect(etats.totals.sales).toBe(0)
  })

  it("signale les écarts non justifiés dans les états de contrôle", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, controleur, dayId } = await dayWithSession(t)
    await vendeur.ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: -500 }],
      varianceReason: "Écart constaté",
    })
    const etats = await controleur.ctx.query(
      api.functions.cash.controlStates,
      { accountingDayId: dayId },
    )
    expect(etats.openSessions).toBe(0)
    expect(etats.unjustifiedVariances).toBe(0)
    expect(etats.sessions[0]?.varianceXaf).toBe(-500)
  })

  it("ouvre la journée comptable de manière idempotente", async () => {
    const t = convexTest(schema, modules)
    const pos = await seedPointOfSale(t)
    const { ctx } = await asUser(t, "controleur_recettes", pos)
    const premier = await ctx.mutation(
      api.functions.cash.openAccountingDay,
      {},
    )
    const second = await ctx.mutation(api.functions.cash.openAccountingDay, {})
    expect(second).toBe(premier)
    const jours = await t.run(async (c) =>
      c.db.query("accountingDays").collect(),
    )
    expect(jours).toHaveLength(1)
  })
})
