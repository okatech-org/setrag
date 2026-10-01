import { convexTest, type TestConvex } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import { addDays, fromServiceDate, toServiceDate } from "../model/calendar"
import { segmentMask } from "../model/inventory"
import { CONTEXTE_AUDIT, CONTEXTE_MANIFESTE, PREFIXE } from "./demoActivitePlan"

/**
 * Le seed face à un déploiement de développement réel.
 *
 * Reproduit ce que contient le Convex de dev : des dessertes qui ne
 * desservent que 9 ou 6 gares, rattachées par `seeds/demo` à un horaire de
 * 23 gares ; une caisse abandonnée des semaines plus tôt ; une caisse ouverte
 * la veille par la démonstration en cours, avec des ventes « ligne » et
 * « bord » du jour au point de vente d'Owendo ; un historique ancien (« H- »)
 * qu'on ne purge pas ; un premier passage interrompu.
 */

const MAINTENANT = new Date("2026-10-01T14:00:00.000Z")
const PARAMETRES = { jours: 6, joursAvance: 4, joursOffre: 6, echelle: 0.15 }

/** Gares d'une desserte courte, comme les anciens horaires du dev. */
const NEUF_GARES = ["FCV", "MOA", "LTV", "MOU", "BOO", "LOP", "NDJ", "NTM", "OWE"]
const SIX_GARES = ["OWE", "NDJ", "BOO", "LTV", "MOA", "FCV"]

describe("activité de démonstration sur un référentiel de dev", () => {
  let t: TestConvex<typeof schema>
  let aujourdhui: string
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(MAINTENANT)
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_PERSONAS_PASSWORD", "secret")
    vi.stubEnv("DEMO_PERSONAS_EMAIL_DOMAIN", "")
    vi.stubEnv("DEMO_AGENT_EMAIL", "")
    aujourdhui = toServiceDate(Date.now())
    t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    await t.mutation(internal.seeds.demo.run, { days: 8, withActivity: false })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    // Ancien livret à horaires courts, dont les dessertes ont été rattachées
    // au livret de démonstration sans que leurs arrêts changent.
    await t.run(async (ctx) => {
      const stations = new Map((await ctx.db.query("stations").collect()).map((s) => [s.code, s]))
      const trains = await ctx.db.query("trains").collect()
      const actif = (await ctx.db.query("timetableBooklets").collect()).find((b) => b.status === "actif")!
      const horairesDemo = await ctx.db.query("bookletSchedules").withIndex("by_booklet", (q) => q.eq("bookletId", actif._id)).collect()
      const ancien = await ctx.db.insert("timetableBooklets", {
        label: "Livret de démonstration — 2026-07-26",
        validFrom: fromServiceDate("2026-07-26"),
        validUntil: fromServiceDate("2026-12-31"),
        status: "actif",
        createdBy: actif.createdBy,
      })
      const horaire = async (numero: string, gares: string[]) =>
        await ctx.db.insert("bookletSchedules", {
          bookletId: ancien,
          trainId: trains.find((x) => x.number === numero)!._id,
          trainNumber: numero,
          trainType: numero === "TR-201" ? "EXPRESS" : "OMNIBUS",
          departureTime: numero === "TR-201" ? "08:00" : "17:30",
          daysOfWeek: [],
          stops: gares.map((code, i) => ({
            stationId: stations.get(code)!._id,
            sequence: i,
            arrivalOffsetMinutes: i === 0 ? undefined : i * 90,
            departureOffsetMinutes: i === gares.length - 1 ? undefined : i * 90,
          })),
        })
      ids.court202 = await horaire("TR-202", NEUF_GARES)
      ids.court201 = await horaire("TR-201", SIX_GARES)
      ids.ancien = ancien
      ids.actif = actif._id
      ids.demo201 = horairesDemo.find((h) => h.trainNumber === "TR-201")!._id
      ids.demo202 = horairesDemo.find((h) => h.trainNumber === "TR-202")!._id

      // La desserte TR-201 de J+2 du livret de démonstration cède la place
      // à la desserte courte.
      const j2 = (await ctx.db.query("trips").withIndex("by_service_date", (q) => q.eq("serviceDate", addDays(aujourdhui, 2))).collect()).find(
        (x) => x.trainNumber === "TR-201"
      )!
      for (const table of ["tripStops", "seatOccupancy", "segmentCounters", "fareClassQuotas"] as const) {
        for (const ligne of await ctx.db.query(table).collect()) {
          if (ligne.tripId === j2._id) await ctx.db.delete(ligne._id)
        }
      }
      await ctx.db.delete(j2._id)
    })
    const courte202 = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId: ids.court202 as Id<"bookletSchedules">,
      serviceDate: addDays(aujourdhui, -3),
    })
    const courte201 = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId: ids.court201 as Id<"bookletSchedules">,
      serviceDate: addDays(aujourdhui, 2),
    })
    ids.courte202 = courte202.tripId
    ids.courte201 = courte201.tripId
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.ancien as Id<"timetableBooklets">, { status: "expire" })
      await ctx.db.patch(ids.courte202 as Id<"trips">, {
        bookletId: ids.actif as Id<"timetableBooklets">,
        scheduleId: ids.demo202 as Id<"bookletSchedules">,
      })
      await ctx.db.patch(ids.courte201 as Id<"trips">, {
        bookletId: ids.actif as Id<"timetableBooklets">,
        scheduleId: ids.demo201 as Id<"bookletSchedules">,
      })

      // Le guichetier de démonstration : une caisse abandonnée il y a trois
      // semaines, une caisse ouverte hier soir, et des ventes du jour.
      const owendo = (await ctx.db.query("pointsOfSale").withIndex("by_code", (q) => q.eq("code", "OWE-PV")).unique())!
      const agent = await ctx.db.insert("users", {
        authId: "auth-agent",
        email: "agent@demo.setrag.ga",
        firstName: "Démo",
        lastName: "Vente",
        role: "vendeur_guichet",
        pointOfSaleId: owendo._id,
        identitySource: "local",
        isActive: true,
      })
      const jourAncien = addDays(aujourdhui, -21)
      const ancienJour = await ctx.db.insert("accountingDays", {
        date: jourAncien,
        status: "ouverte",
        openedAt: fromServiceDate(jourAncien, "07:00"),
        totalTtc: 0,
        totalReceived: 0,
      })
      ids.abandonnee = await ctx.db.insert("cashSessions", {
        sellerId: agent,
        pointOfSaleId: owendo._id,
        accountingDayId: ancienJour,
        openedAt: fromServiceDate(jourAncien, "07:10"),
        openingFloatXaf: 50_000,
        expectedByMethod: [],
        status: "ouverte",
      })
      const veille = addDays(aujourdhui, -1)
      const jourVeille = await ctx.db.insert("accountingDays", {
        date: veille,
        status: "ouverte",
        openedAt: fromServiceDate(veille, "06:00"),
        totalTtc: 0,
        totalReceived: 0,
      })
      const jourDuJour = await ctx.db.insert("accountingDays", {
        date: aujourdhui,
        status: "ouverte",
        openedAt: fromServiceDate(aujourdhui, "06:00"),
        totalTtc: 21_200,
        totalReceived: 21_200,
      })
      ids.enCours = await ctx.db.insert("cashSessions", {
        sellerId: agent,
        pointOfSaleId: owendo._id,
        accountingDayId: jourVeille,
        openedAt: fromServiceDate(veille, "17:52"),
        openingFloatXaf: 50_000,
        expectedByMethod: [],
        status: "ouverte",
      })
      const montants = { ht: 8_983.05, vat: 1_616.95, css: 0, ttc: 10_600, received: 10_600 }
      for (const [canal, numero] of [
        ["ligne", "V-OWE-PV-20261001-000001"],
        ["bord", "V-OWE-PV-20261001-000002"],
      ] as const) {
        await ctx.db.insert("sales", {
          number: numero,
          kind: "vente",
          product: "billet",
          channel: canal,
          status: "confirmee",
          pointOfSaleId: owendo._id,
          sellerId: agent,
          amounts: montants,
          paymentMethod: "especes",
          accountingDayId: jourDuJour,
          cashSessionId: ids.enCours as Id<"cashSessions">,
          soldAt: fromServiceDate(aujourdhui, "09:00"),
        })
      }
      await ctx.db.insert("sequences", { key: `OWE-PV:${aujourdhui}:vente`, value: 2 })

      // Historique ancien, hors fenêtre.
      const jourHistorique = await ctx.db.insert("accountingDays", {
        date: "2026-06-15",
        status: "cloturee",
        openedAt: fromServiceDate("2026-06-15", "06:00"),
        totalTtc: 34_300,
        totalReceived: 34_300,
      })
      await ctx.db.insert("sales", {
        number: "H-2026-06-15-1",
        kind: "vente",
        product: "billet",
        channel: "guichet",
        status: "confirmee",
        pointOfSaleId: owendo._id,
        amounts: { ht: 34_300, vat: 0, css: 0, ttc: 34_300, received: 34_300 },
        accountingDayId: jourHistorique,
        soldAt: fromServiceDate("2026-06-15", "09:00"),
      })
    })
  }, 600_000)

  it("se reprend après un premier passage interrompu, que le reset retire", async () => {
    // Premier passage arrêté après la préparation et l'offre.
    const contexte = await t.mutation(internal.seeds.demoActivite.preparer, {
      maintenant: Date.now(),
      jours: PARAMETRES.jours,
      joursOffre: PARAMETRES.joursOffre,
    })
    for (const date of contexte.dates) {
      await t.mutation(internal.seeds.demoActivite.assurerDessertes, { date, maintenant: Date.now() })
    }
    await t.action(internal.seeds.demoActivite.reset, {})
    const etat = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).filter((u) => u.authId.startsWith("demo-activite-")).length,
      booklets: (await ctx.db.query("timetableBooklets").collect()).map((b) => b.status).sort(),
      trips: (await ctx.db.query("trips").collect()).filter((x) => x.serviceDate < aujourdhui).map((x) => x._id),
      audit: (await ctx.db.query("auditLogs").collect()).filter((l) => l.context === CONTEXTE_AUDIT || l.context === CONTEXTE_MANIFESTE).length,
    }))
    expect(etat.users).toBe(0)
    expect(etat.booklets).toEqual(["actif", "expire"])
    // Seule la desserte courte, antérieure au seed, subsiste dans le passé.
    expect(etat.trips).toEqual([ids.courte202])
    expect(etat.audit).toBe(0)
  }, 600_000)

  it("vend sur les arrêts réels de chaque desserte, sans toucher aux données d'autrui", async () => {
    await t.action(internal.seeds.demoActivite.run, PARAMETRES)
    const avant = await t.run(async (ctx) => (await ctx.db.query("sales").collect()).length)
    await t.action(internal.seeds.demoActivite.run, PARAMETRES)

    const e = await t.run(async (ctx) => ({
      sales: await ctx.db.query("sales").collect(),
      tickets: await ctx.db.query("tickets").collect(),
      trips: await ctx.db.query("trips").collect(),
      occupancy: await ctx.db.query("seatOccupancy").collect(),
      counters: await ctx.db.query("segmentCounters").collect(),
      sessions: await ctx.db.query("cashSessions").collect(),
      days: await ctx.db.query("accountingDays").collect(),
      entries: await ctx.db.query("journalEntries").collect(),
    }))
    expect(e.sales.length).toBe(avant)

    // Les dessertes courtes portent des ventes, toutes dans leurs bornes.
    for (const id of [ids.courte202, ids.courte201]) {
      const trip = e.trips.find((x) => x._id === id)!
      const titres = e.tickets.filter((x) => x.tripId === id)
      expect(titres.length).toBeGreaterThan(0)
      expect(titres.every((x) => x.toStopIndex <= trip.segmentCount && x.fromStopIndex < x.toStopIndex)).toBe(true)
    }

    // Aucune place vendue deux fois, compteurs = titres.
    const trips = new Map(e.trips.map((x) => [x._id, x]))
    const actifs = e.tickets.filter((x) => x.status === "valide" || x.status === "utilise")
    const parPlace = new Map<string, number>()
    for (const ticket of actifs) {
      const masque = segmentMask({ fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex }, trips.get(ticket.tripId)!.segmentCount)
      const cle = `${ticket.tripId}|${ticket.seatId}`
      expect((parPlace.get(cle) ?? 0) & masque).toBe(0)
      parPlace.set(cle, (parPlace.get(cle) ?? 0) | masque)
    }
    for (const o of e.occupancy) expect(o.soldMask).toBe(parPlace.get(`${o.tripId}|${o.seatId}`) ?? 0)
    for (const c of e.counters) {
      const vendus = actifs.filter(
        (x) => x.tripId === c.tripId && x.serviceClass === c.serviceClass && x.fromStopIndex <= c.segmentIndex && x.toStopIndex > c.segmentIndex
      ).length
      expect(c.sold).toBe(vendus)
    }

    // Les données d'autrui sont intactes ; la caisse abandonnée est arrêtée,
    // la caisse de la démonstration en cours reste ouverte et sert encore.
    const etrangeres = e.sales.filter((s) => !s.clientSaleId?.startsWith(PREFIXE))
    expect(etrangeres.map((s) => s.number).sort()).toEqual(["H-2026-06-15-1", "V-OWE-PV-20261001-000001", "V-OWE-PV-20261001-000002"])
    const abandonnee = e.sessions.find((s) => s._id === ids.abandonnee)!
    expect(abandonnee.status).toBe("cloturee")
    const enCours = e.sessions.find((s) => s._id === ids.enCours)!
    expect(enCours.status).toBe("ouverte")
    const agent = enCours.sellerId
    expect(e.sessions.filter((s) => s.sellerId === agent && s.status === "ouverte")).toHaveLength(1)
    expect(e.sales.some((s) => s.cashSessionId === enCours._id && s.clientSaleId?.startsWith(PREFIXE))).toBe(true)
    // La numérotation continue après les ventes existantes.
    const duJour = e.sales.filter((s) => s.number.startsWith(`V-OWE-PV-${aujourdhui.replaceAll("-", "")}-`)).map((s) => s.number).sort()
    expect(new Set(duJour).size).toBe(duJour.length)
    expect(duJour[2]).toBe(`V-OWE-PV-${aujourdhui.replaceAll("-", "")}-000003`)

    // Totaux et journaux : ventes d'autrui comprises, débit = crédit.
    for (const day of e.days.filter((d) => d.date >= addDays(aujourdhui, -PARAMETRES.jours))) {
      const ventes = e.sales.filter((s) => s.accountingDayId === day._id)
      expect(day.totalTtc).toBe(Math.round(ventes.reduce((s, x) => s + x.amounts.ttc, 0) * 100) / 100)
      if (day.status !== "cloturee") continue
      const lignes = e.entries.filter((x) => x.accountingDayId === day._id)
      expect(lignes.length).toBe(ventes.length)
      for (const l of lignes) expect(Math.round((l.ht + l.vat + l.css) * 100)).toBe(Math.round(l.ttc * 100))
    }
    const historique = e.days.find((d) => d.date === "2026-06-15")!
    expect(historique.totalTtc).toBe(34_300)
    expect(historique.exportStatus).toBeUndefined()
  }, 600_000)

  it("se retire en rendant les données d'autrui dans leur état d'origine", async () => {
    await t.action(internal.seeds.demoActivite.reset, {})
    const e = await t.run(async (ctx) => ({
      sales: await ctx.db.query("sales").collect(),
      sessions: await ctx.db.query("cashSessions").collect(),
      days: await ctx.db.query("accountingDays").collect(),
      counters: await ctx.db.query("segmentCounters").collect(),
      audit: (await ctx.db.query("auditLogs").collect()).filter((l) => l.context === CONTEXTE_AUDIT || l.context === CONTEXTE_MANIFESTE),
    }))
    expect(e.sales.map((s) => s.number).sort()).toEqual(["H-2026-06-15-1", "V-OWE-PV-20261001-000001", "V-OWE-PV-20261001-000002"])
    expect(e.sessions.map((s) => [s._id, s.status]).sort()).toEqual(
      [
        [ids.abandonnee, "ouverte"],
        [ids.enCours, "ouverte"],
      ].sort()
    )
    expect(e.days.find((d) => d.date === aujourdhui)?.totalTtc).toBe(21_200)
    expect(e.days.find((d) => d.date === "2026-06-15")?.totalTtc).toBe(34_300)
    expect(e.counters.every((c) => c.sold === 0 && c.available === c.capacity)).toBe(true)
    expect(e.audit).toHaveLength(0)
  }, 600_000)
})
