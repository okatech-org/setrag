import { convexTest, type TestConvex } from "convex-test"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import { addDays, toServiceDate } from "../model/calendar"
import { segmentMask } from "../model/inventory"
import {
  CONTEXTE_AUDIT,
  CONTEXTE_MANIFESTE,
  PREFIXE,
  PREFIXE_AUTH,
  billetage,
  datesFenetre,
  planifierDesserte,
  tirage,
  type DessertePlan,
} from "./demoActivitePlan"

/**
 * Activité de démonstration du portail agent.
 *
 * Le seed est exécuté sur une base de test amorcée par les seeds existants
 * (référentiel, livret de démonstration), sur une fenêtre réduite et à
 * volume réduit pour garder le test rapide. Les contrôles portent sur ce qui
 * ferait mentir une démonstration : doublons au rejeu, caisse fausse,
 * journal déséquilibré, place vendue deux fois, indicateurs décalés.
 */

/** Mercredi 30 septembre 2026, 15 h 30 à Libreville. */
const MAINTENANT = new Date("2026-09-30T14:30:00.000Z")
const PARAMETRES = { jours: 10, joursAvance: 4, joursOffre: 6, echelle: 0.2 }

type Etat = Awaited<ReturnType<typeof lireEtat>>

async function lireEtat(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    return {
      sales: await ctx.db.query("sales").collect(),
      tickets: await ctx.db.query("tickets").collect(),
      payments: await ctx.db.query("payments").collect(),
      scans: await ctx.db.query("ticketScans").collect(),
      pvs: await ctx.db.query("procesVerbaux").collect(),
      incidents: await ctx.db.query("incidents").collect(),
      sessions: await ctx.db.query("cashSessions").collect(),
      days: await ctx.db.query("accountingDays").collect(),
      entries: await ctx.db.query("journalEntries").collect(),
      outbox: await ctx.db.query("outboxEvents").collect(),
      sage: await ctx.db.query("sageTransmissions").collect(),
      blocks: await ctx.db.query("seatBlocks").collect(),
      quotas: await ctx.db.query("agencyQuotas").collect(),
      rules: await ctx.db.query("pricingRules").collect(),
      booklets: await ctx.db.query("timetableBooklets").collect(),
      fareSchedules: await ctx.db.query("fareSchedules").collect(),
      runs: await ctx.db.query("reportRuns").collect(),
      trips: await ctx.db.query("trips").collect(),
      occupancy: await ctx.db.query("seatOccupancy").collect(),
      counters: await ctx.db.query("segmentCounters").collect(),
      dailyMetrics: await ctx.db.query("dailyMetrics").collect(),
      tripMetrics: await ctx.db.query("tripMetrics").collect(),
      audit: await ctx.db.query("auditLogs").collect(),
      seals: await ctx.db.query("auditSeals").collect(),
      users: await ctx.db.query("users").collect(),
      pointsOfSale: await ctx.db.query("pointsOfSale").collect(),
      baggages: await ctx.db.query("baggages").collect(),
      parcels: await ctx.db.query("parcels").collect(),
    }
  })
}

function volumes(e: Etat) {
  return {
    sales: e.sales.length,
    tickets: e.tickets.length,
    payments: e.payments.length,
    scans: e.scans.length,
    pvs: e.pvs.length,
    incidents: e.incidents.length,
    sessions: e.sessions.length,
    days: e.days.length,
    entries: e.entries.length,
    outbox: e.outbox.length,
    sage: e.sage.length,
    blocks: e.blocks.length,
    quotas: e.quotas.length,
    rules: e.rules.length,
    booklets: e.booklets.length,
    fareSchedules: e.fareSchedules.length,
    runs: e.runs.length,
    trips: e.trips.length,
    users: e.users.length,
    audit: e.audit.filter((l) => l.action !== "seed.activite").length,
  }
}

const arrondi = (x: number) => Math.round(x * 100) / 100

describe("activité de démonstration du portail agent", () => {
  let t: TestConvex<typeof schema>
  let apres1: Etat
  let apres2: Etat
  let aujourdhui: string

  beforeAll(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(MAINTENANT)
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    aujourdhui = toServiceDate(Date.now())
    t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    await t.mutation(internal.seeds.demo.run, { days: 8, withActivity: false })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    await t.action(internal.seeds.demoActivite.run, PARAMETRES)
    apres1 = await lireEtat(t)
    await t.action(internal.seeds.demoActivite.run, PARAMETRES)
    apres2 = await lireEtat(t)
  }, 600_000)

  afterEach(() => undefined)

  it("produit une activité sur tous les canaux et tous les produits", () => {
    const ventes = apres1.sales.filter((s) => s.kind === "vente")
    expect(new Set(ventes.map((s) => s.channel))).toEqual(new Set(["guichet", "agence", "ligne", "bord"]))
    const produits = new Set(ventes.map((s) => s.product))
    for (const p of ["billet", "bagage", "colis"]) expect(produits.has(p as Doc<"sales">["product"])).toBe(true)
    expect(apres1.sales.some((s) => s.kind === "annulation")).toBe(true)
    expect(apres1.sales.some((s) => s.kind === "remboursement" && (s.penaltyPct ?? 0) > 0)).toBe(true)
    expect(new Set(apres1.payments.map((p) => p.method)).size).toBeGreaterThanOrEqual(5)
    expect(apres1.tickets.some((x) => x.fare.discountCode === "ENFANT")).toBe(true)
    expect(apres1.tickets.every((x) => x.barcodePayload && x.seatLabel)).toBe(true)
    // Toutes les pièces sont numérotées, sans doublon.
    expect(new Set(apres1.sales.map((s) => s.number)).size).toBe(apres1.sales.length)
    expect(new Set(apres1.tickets.map((x) => x.number)).size).toBe(apres1.tickets.length)
  })

  it("ne double rien au rejeu", () => {
    expect(volumes(apres2)).toEqual(volumes(apres1))
    expect(apres2.seals.length).toBe(apres1.seals.length)
  })

  it("tient des caisses justes : attendu = somme des ventes, billetage = fonds + espèces", () => {
    const closes = apres2.sessions.filter((s) => s.countedByMethod !== undefined)
    expect(closes.length).toBeGreaterThan(10)
    for (const session of closes) {
      const ventes = apres2.sales.filter((s) => s.cashSessionId === session._id && s.accountingDayId !== undefined)
      const parMoyen = new Map<string, number>()
      for (const s of ventes) {
        const m = s.paymentMethod ?? "especes"
        parMoyen.set(m, arrondi((parMoyen.get(m) ?? 0) + s.amounts.received))
      }
      for (const ligne of session.expectedByMethod) {
        expect(ligne.amountXaf).toBe(parMoyen.get(ligne.method) ?? 0)
      }
      const somme = (lignes: ReadonlyArray<{ amountXaf: number }>) => lignes.reduce((s, l) => s + l.amountXaf, 0)
      const attendu = somme(session.expectedByMethod)
      const compte = somme(session.countedByMethod!)
      expect(arrondi(compte - attendu)).toBe(session.varianceXaf ?? 0)
      if ((session.varianceXaf ?? 0) !== 0 && session.status === "validee") {
        expect(session.varianceReason).toBeTruthy()
      }
      const especes = session.countedByMethod!.find((l: { method: string }) => l.method === "especes")?.amountXaf ?? 0
      const coupures = (lignes: ReadonlyArray<{ denomination: number; count: number }> = []) =>
        lignes.reduce((s, l) => s + l.denomination * l.count, 0)
      const billete = coupures(session.closingBreakdown)
      expect(billete).toBe(session.openingFloatXaf + especes)
      const fonds = coupures(session.openingBreakdown)
      expect(fonds).toBe(session.openingFloatXaf)
    }
    // Quelques écarts, jamais au-delà de 3 000 XAF.
    const ecarts = closes.filter((s) => (s.varianceXaf ?? 0) !== 0)
    expect(ecarts.length).toBeGreaterThan(0)
    expect(ecarts.every((s) => Math.abs(s.varianceXaf!) <= 3_000)).toBe(true)
  })

  it("clôture les journées sauf la veille et le jour même, avec un journal équilibré", () => {
    const veille = addDays(aujourdhui, -1)
    for (const day of apres2.days) {
      const ouverte = day.date === aujourdhui || day.date === veille
      expect(day.status).toBe(ouverte ? "ouverte" : "cloturee")
      const ventes = apres2.sales.filter((s) => s.accountingDayId === day._id)
      expect(day.totalTtc).toBe(arrondi(ventes.reduce((s, x) => s + x.amounts.ttc, 0)))
      if (ouverte) continue
      const lignes = apres2.entries.filter((e) => e.accountingDayId === day._id)
      expect(lignes.length).toBe(ventes.length)
      expect(day.journalEntryCount).toBe(lignes.length)
      // Débit (encaissement TTC) = crédit (produit HT + TVA + CSS), pièce par pièce.
      for (const e of lignes) expect(arrondi(e.ht + e.vat + e.css)).toBe(arrondi(e.ttc))
      const debit = arrondi(lignes.reduce((s, e) => s + e.ttc, 0))
      const credit = arrondi(lignes.reduce((s, e) => s + e.ht + e.vat + e.css, 0))
      expect(debit).toBe(credit)
      expect(debit).toBe(day.totalTtc)
    }
    // Déversements : intégrés, un rejeté (compte analytique), un en attente.
    const statuts = apres2.days.map((d) => d.exportStatus)
    expect(statuts).toContain("integre")
    expect(statuts).toContain("echec")
    expect(statuts).toContain("en_attente")
    const rejet = apres2.sage.find((s) => s.result === "rejete")
    expect(rejet?.rejectedPieces[0]?.reason).toMatch(/compte analytique/i)
    // La veille : au moins une caisse avec un écart, pas encore visée.
    const jourVeille = apres2.days.find((d) => d.date === veille)!
    const sessionsVeille = apres2.sessions.filter((s) => s.accountingDayId === jourVeille._id)
    expect(sessionsVeille.some((s) => s.status === "cloturee" && (s.varianceXaf ?? 0) !== 0)).toBe(true)
    // Le jour même : des caisses ouvertes.
    const jour = apres2.days.find((d) => d.date === aujourdhui)!
    expect(apres2.sessions.some((s) => s.accountingDayId === jour._id && s.status === "ouverte")).toBe(true)
    // Une caisse ouverte n'a pas d'heure de clôture.
    expect(apres2.sessions.filter((s) => s.status === "ouverte").every((s) => s.closedAt === undefined)).toBe(true)
  })

  it("ne vend jamais deux fois la même place, et l'inventaire suit les titres", () => {
    const actifs = apres2.tickets.filter((x) => x.status === "valide" || x.status === "utilise")
    const trips = new Map(apres2.trips.map((x) => [x._id, x]))
    const parPlace = new Map<string, number>()
    for (const ticket of actifs) {
      const trip = trips.get(ticket.tripId)!
      const masque = segmentMask({ fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex }, trip.segmentCount)
      const cle = `${ticket.tripId}|${ticket.seatId}`
      const deja = parPlace.get(cle) ?? 0
      expect(deja & masque).toBe(0)
      parPlace.set(cle, deja | masque)
    }
    for (const o of apres2.occupancy) {
      expect(o.soldMask).toBe(parPlace.get(`${o.tripId}|${o.seatId}`) ?? 0)
    }
    for (const c of apres2.counters) {
      const vendus = actifs.filter(
        (x) =>
          x.tripId === c.tripId &&
          x.serviceClass === c.serviceClass &&
          x.fromStopIndex <= c.segmentIndex &&
          x.toStopIndex > c.segmentIndex
      ).length
      expect(c.sold).toBe(vendus)
      expect(c.available).toBe(c.capacity - c.sold - c.held - c.reserved)
    }
  })

  it("recalcule les agrégats sur les ventes", () => {
    for (const day of apres2.days) {
      const lignes = apres2.dailyMetrics.filter((m) => m.date === day.date)
      const net = arrondi(lignes.reduce((s, m) => s + m.grossTtc - m.refundedTtc, 0))
      expect(net).toBe(day.totalTtc)
      const ventes = apres2.sales.filter((s) => s.accountingDayId === day._id && s.kind === "vente").length
      expect(lignes.reduce((s, m) => s + m.salesCount, 0)).toBe(ventes)
    }
    for (const trip of apres2.trips) {
      const titres = apres2.tickets.filter((x) => x.tripId === trip._id && (x.status === "valide" || x.status === "utilise"))
      if (titres.length === 0) continue
      const metriques = apres2.tripMetrics.filter((m) => m.tripId === trip._id)
      expect(metriques.reduce((s, m) => s + m.ticketCount, 0)).toBe(titres.length)
    }
  })

  it("présente l'exploitation et le terrain dans tous leurs états", () => {
    expect(new Set(apres2.booklets.map((b) => b.status))).toEqual(new Set(["actif", "a_valider", "brouillon", "expire"]))
    expect(apres2.fareSchedules.some((g) => g.status === "a_valider" && g.submittedAt)).toBe(true)
    expect(apres2.rules.some((r) => r.scope === "desserte" && r.tripId)).toBe(true)
    expect(apres2.rules.some((r) => r.validFrom !== undefined && r.validFrom > Date.now())).toBe(true)
    expect(apres2.blocks.filter((b) => b.isActive).length).toBeGreaterThanOrEqual(3)
    expect(apres2.blocks.some((b) => !b.isActive && b.releasedAt)).toBe(true)
    expect(new Set(apres2.blocks.map((b) => b.reason)).size).toBe(4)
    expect(apres2.quotas.length).toBeGreaterThan(0)
    const duJour = apres2.trips.filter((x) => x.serviceDate === aujourdhui)
    expect(duJour.map((x) => x.status).sort()).toEqual(["annule", "retarde"])
    expect(new Set(apres2.incidents.map((i) => i.status))).toEqual(new Set(["ouvert", "en_cours", "resolu"]))
    expect(apres2.incidents.filter((i) => i.status === "resolu").every((i) => i.closureCause)).toBe(true)
    const statutsPv = new Set(apres2.pvs.map((p) => p.status))
    expect(statutsPv.has("paye") && statutsPv.has("emis")).toBe(true)
    expect(apres2.scans.some((s) => s.conflict)).toBe(true)
    expect(apres2.tickets.some((x) => x.status === "utilise")).toBe(true)
    expect(apres2.runs.length).toBeGreaterThan(0)
    expect(apres2.seals.length).toBeGreaterThan(0)
  })

  it("se retire sans laisser de trace et rend l'inventaire", async () => {
    await t.action(internal.seeds.demoActivite.reset, {})
    const apres = await lireEtat(t)
    expect(apres.sales.filter((s) => s.clientSaleId?.startsWith(PREFIXE))).toHaveLength(0)
    expect(apres.sales).toHaveLength(0)
    expect(apres.tickets).toHaveLength(0)
    expect(apres.payments).toHaveLength(0)
    expect(apres.scans).toHaveLength(0)
    expect(apres.pvs).toHaveLength(0)
    expect(apres.incidents).toHaveLength(0)
    expect(apres.sessions).toHaveLength(0)
    expect(apres.days).toHaveLength(0)
    expect(apres.entries).toHaveLength(0)
    expect(apres.outbox).toHaveLength(0)
    expect(apres.blocks).toHaveLength(0)
    expect(apres.quotas).toHaveLength(0)
    expect(apres.runs).toHaveLength(0)
    expect(apres.users.filter((u) => u.authId.startsWith(PREFIXE_AUTH))).toHaveLength(0)
    expect(apres.pointsOfSale.filter((p) => p.code.startsWith("AG"))).toHaveLength(0)
    expect(apres.booklets.map((b) => b.status)).toEqual(["actif"])
    expect(apres.fareSchedules.map((g) => g.status)).toEqual(["actif"])
    expect(apres.audit.filter((l) => l.context === CONTEXTE_AUDIT || l.context === CONTEXTE_MANIFESTE)).toHaveLength(0)
    expect(apres.counters.every((c) => c.sold === 0 && c.reserved === 0 && c.available === c.capacity)).toBe(true)
    expect(apres.occupancy.every((o) => o.soldMask === 0 && o.blockedMask === 0)).toBe(true)
    // Les dessertes de la démonstration retrouvent leur état d'origine.
    expect(apres.trips.every((x) => x.status === "planifie" && x.delayMinutes === 0)).toBe(true)
    expect(apres.dailyMetrics).toHaveLength(0)
  }, 600_000)
})

describe("planification de l'activité", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const desserte: DessertePlan = {
    cle: "2026-09-25|TR-201",
    serviceDate: "2026-09-25",
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    departureAt: Date.parse("2026-09-25T07:00:00Z"),
    arrivalAt: Date.parse("2026-09-25T21:00:00Z"),
    arrets: ["OWE", "NTM", "NDJ", "BOO", "LTV", "MOA", "FCV"].map((code, i) => ({
      code,
      km: [0, 35, 182, 338, 484, 619, 669][i]!,
      departAt: i < 6 ? Date.parse("2026-09-25T07:00:00Z") + i * 2 * 3_600_000 : undefined,
      arriveeAt: i > 0 ? Date.parse("2026-09-25T07:00:00Z") + i * 2 * 3_600_000 : undefined,
    })),
    capacites: { VIP: 32, PREMIERE: 96, DEUXIEME: 240 },
  }
  const cadre = { debut: "2026-09-01", echelle: 1, agences: { OWE: ["AG-LBV-MBT"] }, venteEnCompte: true }

  it("est déterministe", () => {
    expect(planifierDesserte(desserte, cadre)).toEqual(planifierDesserte(desserte, cadre))
  })

  it("ne dépasse jamais la capacité d'un tronçon", () => {
    const ventes = planifierDesserte(desserte, cadre)
    for (const classe of ["VIP", "PREMIERE", "DEUXIEME"] as const) {
      const charge = new Array<number>(6).fill(0)
      for (const v of ventes.filter((x) => x.classe === classe)) {
        for (let s = v.de; s < v.a; s += 1) charge[s]! += v.voyageurs.length
      }
      expect(Math.max(...charge)).toBeLessThanOrEqual(desserte.capacites[classe]!)
    }
    // Un Express de vendredi se remplit : quelques centaines de voyageurs.
    const voyageurs = ventes.reduce((s, v) => s + v.voyageurs.length, 0)
    expect(voyageurs).toBeGreaterThan(200)
    expect(voyageurs).toBeLessThan(600)
  })

  it("vend avant le passage du train, jamais avant l'ouverture de la fenêtre", () => {
    for (const v of planifierDesserte(desserte, cadre)) {
      expect(v.jour >= cadre.debut).toBe(true)
      if (v.canal !== "bord") expect(v.venteA).toBeLessThan(desserte.arrets[v.de]!.departAt!)
      if (v.remboursement) expect(v.remboursement.a).toBeGreaterThan(v.venteA)
    }
  })

  it("décompose un montant en coupures BEAC", () => {
    const rng = tirage("test")
    for (const montant of [50_000, 30_000, 123_455, 5]) {
      const lignes = billetage(montant, rng)
      expect(lignes.reduce((s, l) => s + l.denomination * l.count, 0)).toBe(montant)
    }
  })

  it("couvre trente jours et le jour même", () => {
    const dates = datesFenetre("2026-10-01", 30)
    expect(dates).toHaveLength(31)
    expect(dates[0]).toBe("2026-09-01")
    expect(dates[30]).toBe("2026-10-01")
  })
})

