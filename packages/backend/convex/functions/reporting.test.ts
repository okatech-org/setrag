import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"

/**
 * Cumuls et restitution des indicateurs.
 *
 * L'enjeu est la JUSTESSE des agrégats : un tableau de bord faux est pire
 * qu'un tableau de bord absent, parce qu'on le croit. Ces tests partent donc
 * de ventes réelles en base et vérifient le chiffre au franc près.
 */

async function asUser(t: ReturnType<typeof convexTest>, role: AppRole) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
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

/** Journée close portant les ventes décrites. */
async function seedDay(
  t: ReturnType<typeof convexTest>,
  date: string,
  ventes: ReadonlyArray<{
    kind: "vente" | "annulation" | "remboursement"
    channel: "guichet" | "ligne" | "agence" | "bord" | "manuel"
    product?: "billet" | "bagage"
    ttc: number
    tickets?: number
    status?: "confirmee" | "en_attente_paiement" | "expiree"
  }>,
) {
  return await t.run(async (ctx) => {
    // Un titre référence une desserte et des gares réelles : les identifiants
    // sont validés à l'écriture. On crée donc la chaîne minimale plutôt que
    // de bricoler des identifiants factices.
    const owe = await ctx.db.insert("stations", {
      code: `O-${date}`,
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const fcv = await ctx.db.insert("stations", {
      code: `F-${date}`,
      name: "Franceville",
      province: "Haut-Ogooué",
      kilometerPoint: 669,
      isEquipped: true,
      isActive: true,
    })
    const admin = await ctx.db.insert("users", {
      authId: `seed-${date}`,
      role: "admin_fonctionnel",
      identitySource: "annuaire",
      isActive: true,
    })
    const trainId = await ctx.db.insert("trains", {
      number: `TR-${date}`,
      name: "Express",
      type: "EXPRESS",
      isActive: true,
    })
    const bookletId = await ctx.db.insert("timetableBooklets", {
      label: `Livret ${date}`,
      validFrom: Date.parse(`${date}T00:00:00Z`),
      validUntil: Date.parse(`${date}T23:00:00Z`),
      status: "actif",
      createdBy: admin,
    })
    const tripId = await ctx.db.insert("trips", {
      bookletId,
      trainId,
      trainNumber: `TR-${date}`,
      trainType: "EXPRESS",
      serviceDate: date,
      departureAt: Date.parse(`${date}T07:00:00Z`),
      arrivalAt: Date.parse(`${date}T17:00:00Z`),
      originStationId: owe,
      destinationStationId: fcv,
      status: "planifie",
      delayMinutes: 0,
      segmentCount: 1,
      isOpenForSale: true,
    })

    const pos = await ctx.db.insert("pointsOfSale", {
      code: `PV-${date}`,
      name: `Point ${date}`,
      type: "gare",
      counters: { passengers: 1, baggage: 0, parcels: 0 },
      isActive: true,
    })
    const dayId = await ctx.db.insert("accountingDays", {
      date,
      status: "cloturee",
      openedAt: Date.parse(`${date}T06:00:00Z`),
      closedAt: Date.parse(`${date}T22:00:00Z`),
      totalTtc: 0,
      totalReceived: 0,
    })

    let n = 0
    for (const v of ventes) {
      n += 1
      const signe = v.kind === "vente" ? 1 : -1
      const saleId = await ctx.db.insert("sales", {
        number: `${date}-${n}`,
        kind: v.kind,
        product: v.product ?? "billet",
        channel: v.channel,
        status: v.status ?? (v.kind === "vente" ? "confirmee" : "annulee"),
        pointOfSaleId: pos,
        amounts: {
          ht: signe * v.ttc,
          vat: 0,
          css: 0,
          ttc: signe * v.ttc,
          received: signe * v.ttc,
        },
        accountingDayId: dayId,
        soldAt: Date.parse(`${date}T10:00:00Z`),
      })

      for (let i = 0; i < (v.tickets ?? 0); i += 1) {
        await ctx.db.insert("tickets", {
          saleId,
          number: `${date}-${n}-${i}`,
          tripId,
          passenger: { lastName: "TEST", firstName: "T", gender: "M" },
          originStationId: owe,
          destinationStationId: fcv,
          fromStopIndex: 0,
          toStopIndex: 1,
          serviceClass: "DEUXIEME",
          isStanding: false,
          fare: {
            distanceKm: 100,
            chargeableKm: 100,
            ratePerKm: 40,
            discountPct: 0,
            appliedRules: [],
            roundingStep: 100,
          },
          unitPriceTtc: v.ttc / (v.tickets ?? 1),
          status: "valide",
          duplicateCount: 0,
        })
      }
    }
    return { dayId, pos, tripId }
  })
}

describe("Cumuls journaliers", () => {
  it("sépare le brut des sorties et compte les titres", async () => {
    const t = convexTest(schema, modules)
    const { dayId } = await seedDay(t, "2026-06-01", [
      { kind: "vente", channel: "guichet", ttc: 10_000, tickets: 2 },
      { kind: "vente", channel: "ligne", ttc: 5_000, tickets: 1 },
      { kind: "annulation", channel: "guichet", ttc: 3_000 },
    ])

    const r = await t.mutation(internal.functions.rollup.rollupAccountingDay, {
      accountingDayId: dayId,
    })
    expect(r.salesExamined).toBe(3)
    // Guichet et ligne forment deux cumuls distincts.
    expect(r.buckets).toBe(2)

    const lignes = await t.run(async (c) =>
      c.db.query("dailyMetrics").collect(),
    )
    const guichet = lignes.find((l) => l.channel === "guichet")!
    expect(guichet.salesCount).toBe(1)
    expect(guichet.ticketCount).toBe(2)
    expect(guichet.grossTtc).toBe(10_000)
    // L'annulation est cumulée en valeur absolue, pas en négatif.
    expect(guichet.refundedTtc).toBe(3_000)
    expect(guichet.cancelledCount).toBe(1)
  })

  it("écarte les réservations non réglées et expirées", async () => {
    const t = convexTest(schema, modules)
    const { dayId } = await seedDay(t, "2026-06-02", [
      { kind: "vente", channel: "ligne", ttc: 8_000, status: "confirmee" },
      {
        kind: "vente",
        channel: "ligne",
        ttc: 99_000,
        status: "en_attente_paiement",
      },
      { kind: "vente", channel: "ligne", ttc: 77_000, status: "expiree" },
    ])

    await t.mutation(internal.functions.rollup.rollupAccountingDay, {
      accountingDayId: dayId,
    })
    const lignes = await t.run(async (c) =>
      c.db.query("dailyMetrics").collect(),
    )
    // Une réservation non réglée n'a rien produit : elle ne doit pas gonfler
    // le chiffre d'affaires.
    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.grossTtc).toBe(8_000)
  })

  it("est idempotent : recalculer ne dédouble pas", async () => {
    const t = convexTest(schema, modules)
    const { dayId } = await seedDay(t, "2026-06-03", [
      { kind: "vente", channel: "guichet", ttc: 4_000, tickets: 1 },
    ])

    await t.mutation(internal.functions.rollup.rollupAccountingDay, {
      accountingDayId: dayId,
    })
    const second = await t.mutation(
      internal.functions.rollup.rollupAccountingDay,
      { accountingDayId: dayId },
    )
    expect(second.replaced).toBe(1)

    const lignes = await t.run(async (c) =>
      c.db.query("dailyMetrics").collect(),
    )
    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.grossTtc).toBe(4_000)
  })

  it("reprend un historique de journées déjà closes", async () => {
    const t = convexTest(schema, modules)
    await seedDay(t, "2026-06-04", [
      { kind: "vente", channel: "guichet", ttc: 1_000 },
    ])
    await seedDay(t, "2026-06-05", [
      { kind: "vente", channel: "guichet", ttc: 2_000 },
    ])

    const r = await t.mutation(
      internal.functions.rollup.backfillDailyMetrics,
      {},
    )
    expect(r.processed).toBe(2)
    expect(r.dates.sort()).toEqual(["2026-06-04", "2026-06-05"])
  })
})

describe("Tableau de bord", () => {
  it("compare la période à la précédente de même longueur", async () => {
    const t = convexTest(schema, modules)
    // Période de référence : 1 000. Période courante : 1 500, soit +50 %.
    await seedDay(t, "2026-06-08", [
      { kind: "vente", channel: "guichet", ttc: 1_000 },
    ])
    await seedDay(t, "2026-06-09", [
      { kind: "vente", channel: "guichet", ttc: 1_500 },
    ])
    await t.mutation(internal.functions.rollup.backfillDailyMetrics, {})

    const ctx = await asUser(t, "responsable_kpi")
    const b = await ctx.query(api.functions.reporting.dashboard, {
      from: "2026-06-09",
      to: "2026-06-09",
    })
    expect(b.revenue.netTtc).toBe(1_500)
    expect(b.comparedTo).toEqual({ from: "2026-06-08", to: "2026-06-08" })
    expect(b.revenue.variation.pct).toBe(50)
    expect(b.hasData).toBe(true)
  })

  it("dit qu'il n'a pas de données plutôt que d'afficher des zéros", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asUser(t, "responsable_kpi")
    const b = await ctx.query(api.functions.reporting.dashboard, {
      from: "2026-01-01",
      to: "2026-01-31",
    })
    expect(b.hasData).toBe(false)
    expect(b.period.days).toBe(31)
    // Sans référence, la variation ne doit pas inventer un pourcentage.
    expect(b.revenue.variation.pct).toBeNull()
  })

  it("est refusé à un rôle sans droit sur les rapports", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asUser(t, "vendeur_guichet")
    await expect(
      ctx.query(api.functions.reporting.dashboard, {
        from: "2026-06-01",
        to: "2026-06-30",
      }),
    ).rejects.toThrow(/Accès refusé/)
  })
})

describe("Ventilations", () => {
  async function fixture(t: ReturnType<typeof convexTest>) {
    await seedDay(t, "2026-06-10", [
      { kind: "vente", channel: "guichet", ttc: 10_000, tickets: 2 },
      { kind: "vente", channel: "ligne", ttc: 30_000, tickets: 3 },
      { kind: "vente", channel: "bord", ttc: 2_000, tickets: 1 },
      { kind: "vente", channel: "guichet", product: "bagage", ttc: 1_300 },
    ])
    await t.mutation(internal.functions.rollup.backfillDailyMetrics, {})
    return await asUser(t, "responsable_kpi")
  }

  const période = { from: "2026-06-10", to: "2026-06-10" }

  it("classe les canaux par chiffre d'affaires", async () => {
    const t = convexTest(schema, modules)
    const ctx = await fixture(t)
    const parts = await ctx.query(api.functions.reporting.byChannel, période)
    expect(parts.map((p) => p.key)).toEqual(["ligne", "guichet", "bord"])
    expect(parts[0]!.netTtc).toBe(30_000)
    expect(parts[0]!.label).toBe("En ligne")
    // Le guichet cumule billet et bagage : 10 000 + 1 300.
    expect(parts[1]!.netTtc).toBe(11_300)
  })

  it("ventile par produit", async () => {
    const t = convexTest(schema, modules)
    const ctx = await fixture(t)
    const parts = await ctx.query(api.functions.reporting.byProduct, période)
    expect(parts.map((p) => p.key)).toEqual(["billet", "bagage"])
    expect(parts[1]!.netTtc).toBe(1_300)
  })

  it("nomme les points de vente au lieu d'afficher leur identifiant", async () => {
    const t = convexTest(schema, modules)
    const ctx = await fixture(t)
    const parts = await ctx.query(api.functions.reporting.byPointOfSale, période)
    expect(parts[0]!.label).toContain("PV-2026-06-10")
  })

  it("rend les jours creux à zéro plutôt que de les omettre", async () => {
    const t = convexTest(schema, modules)
    const ctx = await fixture(t)
    const série = await ctx.query(api.functions.reporting.dailySeries, {
      from: "2026-06-09",
      to: "2026-06-11",
    })
    // Une courbe qui saute les jours creux laisse croire à une activité
    // continue : les trois jours doivent être présents.
    expect(série.map((p) => p.date)).toEqual([
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
    ])
    expect(série[0]!.netTtc).toBe(0)
    expect(série[1]!.netTtc).toBe(43_300)
    expect(série[2]!.netTtc).toBe(0)
  })
})

describe("Export CSV", () => {
  it("produit un fichier lisible par un Excel français", async () => {
    const t = convexTest(schema, modules)
    await seedDay(t, "2026-06-12", [
      { kind: "vente", channel: "guichet", ttc: 42_200, tickets: 1 },
    ])
    await t.mutation(internal.functions.rollup.backfillDailyMetrics, {})
    const ctx = await asUser(t, "responsable_kpi")

    const csv = await ctx.query(api.functions.reporting.exportDailyCsv, {
      from: "2026-06-12",
      to: "2026-06-12",
    })
    expect(csv.filename).toBe("setrag-ventes-2026-06-12-2026-06-12.csv")
    expect(csv.rowCount).toBe(1)
    const [entête, ligne] = csv.content.split("\n")
    expect(entête).toContain("Date;Point de vente;Canal")
    expect(ligne).toContain("2026-06-12")
    expect(ligne).toContain("42200")
  })

  it("exige le droit de créer un rapport, pas seulement de le lire", async () => {
    const t = convexTest(schema, modules)
    // Le chef de gare consulte les rapports mais n'en produit pas.
    const ctx = await asUser(t, "chef_gare")
    await expect(
      ctx.query(api.functions.reporting.exportDailyCsv, {
        from: "2026-06-12",
        to: "2026-06-12",
      }),
    ).rejects.toThrow(/Accès refusé/)
  })
})
