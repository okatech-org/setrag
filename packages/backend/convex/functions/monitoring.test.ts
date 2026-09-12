import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"

/**
 * Supervision d'exploitation.
 *
 * Ces tests vérifient surtout qu'on ne signale RIEN à tort : un tableau de
 * bord qui crie en permanence n'est plus regardé, et c'est ainsi qu'on rate
 * la vraie anomalie.
 */

const HEURE = 3_600_000

async function asAgent(t: ReturnType<typeof convexTest>, role: AppRole) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return t.withIdentity({ subject: authId })
}

describe("Bilan de santé", () => {
  it("ne signale qu'un déploiement de démonstration sur une base vierge", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asAgent(t, "responsable_kpi")

    const bilan = await ctx.query(api.functions.monitoring.health, {})
    // La clé de démonstration est le seul constat attendu : les tests
    // tournent sans variable d'environnement posée.
    expect(bilan.findings.map((f) => f.code)).toEqual(["cle_de_demonstration"])
    expect(bilan.severity).toBe("avertissement")
    expect(bilan.checkedAt).toBeGreaterThan(0)
  })

  it("reste consultable par la Direction générale", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asAgent(t, "direction_generale")

    const bilan = await ctx.query(api.functions.monitoring.health, {})

    expect(bilan.checkedAt).toBeGreaterThan(0)
    expect(bilan.findings.map((finding) => finding.code)).toEqual([
      "cle_de_demonstration",
    ])
  })

  it("remonte un déversement comptable enlisé", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (c) =>
      c.db.insert("outboxEvents", {
        type: "sage_export",
        entityId: "peu-importe",
        payload: "{}",
        status: "en_attente",
        attempts: 0,
        createdAt: Date.now() - 40 * HEURE,
      })
    )
    const ctx = await asAgent(t, "responsable_kpi")

    const bilan = await ctx.query(api.functions.monitoring.health, {})
    expect(bilan.severity).toBe("critique")
    expect(bilan.findings[0]!.code).toBe("outbox_bloque")
    // Le constat le plus grave passe devant l'avertissement sur la clé.
    expect(bilan.findings.map((f) => f.code)).toContain("cle_de_demonstration")
  })

  it("remonte une caisse restée ouverte", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (c) => {
      const pos = await c.db.insert("pointsOfSale", {
        code: "OWE-PV",
        name: "Owendo",
        type: "gare",
        counters: { passengers: 4, baggage: 0, parcels: 0 },
        isActive: true,
      })
      const seller = await c.db.insert("users", {
        authId: "vendeur-test",
        role: "vendeur_guichet",
        identitySource: "annuaire",
        isActive: true,
      })
      const day = await c.db.insert("accountingDays", {
        date: "2026-07-20",
        status: "cloturee",
        openedAt: Date.now() - 40 * HEURE,
        totalTtc: 0,
        totalReceived: 0,
      })
      await c.db.insert("cashSessions", {
        sellerId: seller,
        pointOfSaleId: pos,
        accountingDayId: day,
        openedAt: Date.now() - 30 * HEURE,
        openingFloatXaf: 0,
        expectedByMethod: [],
        status: "ouverte",
      })
    })
    const ctx = await asAgent(t, "responsable_kpi")

    const bilan = await ctx.query(api.functions.monitoring.health, {})
    expect(bilan.findings.map((f) => f.code)).toContain("caisse_non_fermee")
  })

  it("compte les barèmes provisoires sans en faire une alerte", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (c) => {
      const admin = await c.db.insert("users", {
        authId: "admin-test",
        role: "admin_fonctionnel",
        identitySource: "annuaire",
        isActive: true,
      })
      const scheduleId = await c.db.insert("fareSchedules", {
        label: "Barème",
        status: "actif",
        validFrom: 0,
        validUntil: Date.now() + 365 * 86_400_000,
        roundingBasis: "TTC",
        vatPct: 0,
        cssPct: 0,
        createdBy: admin,
      })
      for (let i = 0; i < 3; i += 1) {
        await c.db.insert("ancillaryFares", {
          scheduleId,
          product: "colis",
          zone: i + 1,
          weightTier: 1,
          amountHt: 1000,
          label: `[PROVISOIRE] zone ${i + 1}`,
          isProvisional: true,
        })
      }
    })
    const ctx = await asAgent(t, "responsable_kpi")

    const bilan = await ctx.query(api.functions.monitoring.health, {})
    const constat = bilan.findings.find((f) => f.code === "bareme_provisoire")
    expect(constat?.count).toBe(3)
    expect(constat?.severity).toBe("info")
    // Un barème provisoire ne doit pas faire virer le bilan au rouge.
    expect(bilan.severity).toBe("avertissement")
  })

  it("est refusé à un rôle sans droit sur les rapports", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asAgent(t, "voyageur")
    await expect(
      ctx.query(api.functions.monitoring.health, {})
    ).rejects.toThrow(/Accès refusé/)
  })
})

describe("Contrôle planifié", () => {
  it("ne trace rien quand rien n'est critique", async () => {
    const t = convexTest(schema, modules)
    const r = await t.mutation(internal.functions.monitoring.runHealthCheck, {})
    expect(r.critical).toBe(0)

    const journal = await t.run(async (c) => c.db.query("auditLogs").collect())
    expect(journal).toHaveLength(0)
  })

  it("trace un constat daté quand une anomalie critique apparaît", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (c) =>
      c.db.insert("outboxEvents", {
        type: "sage_export",
        entityId: "peu-importe",
        payload: "{}",
        status: "echec",
        attempts: 5,
        lastError: "SAGE injoignable",
        createdAt: Date.now() - 2 * HEURE,
      })
    )

    const r = await t.mutation(internal.functions.monitoring.runHealthCheck, {})
    expect(r.severity).toBe("critique")
    expect(r.critical).toBe(1)

    const journal = await t.run(async (c) => c.db.query("auditLogs").collect())
    expect(journal).toHaveLength(1)
    expect(journal[0]!.action).toBe("supervision.anomalie")
  })
})

describe("Détail d'une file bloquée", () => {
  it("rend les plus anciens d'abord, avec leur ancienneté", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (c) => {
      for (const heures of [2, 40, 12]) {
        await c.db.insert("outboxEvents", {
          type: "sage_export",
          entityId: `jour-${heures}`,
          payload: "{}",
          status: "en_attente",
          attempts: 0,
          createdAt: Date.now() - heures * HEURE,
        })
      }
    })
    const ctx = await asAgent(t, "comptable")

    const bloqués = await ctx.query(
      api.functions.monitoring.stuckOutboxEvents,
      {}
    )
    expect(bloqués.map((e) => e.entityId)).toEqual([
      "jour-40",
      "jour-12",
      "jour-2",
    ])
    expect(bloqués[0]!.waitingForMs).toBeGreaterThan(39 * HEURE)
  })

  it("ignore les événements déjà partis", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (c) =>
      c.db.insert("outboxEvents", {
        type: "sage_export",
        entityId: "parti",
        payload: "{}",
        status: "envoye",
        attempts: 1,
        createdAt: Date.now() - 100 * HEURE,
        sentAt: Date.now(),
      })
    )
    const ctx = await asAgent(t, "comptable")
    expect(
      await ctx.query(api.functions.monitoring.stuckOutboxEvents, {})
    ).toEqual([])
  })
})
