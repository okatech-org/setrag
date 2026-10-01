import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"
import {
  completerParametres,
  etatCaisse,
  PARAMETRES_PAR_DEFAUT,
  periodeProgrammee,
  typeCdc,
  verifierParametres,
  versCsv,
} from "./pilotage"

/**
 * Pilotage et finances : visa des caisses, déversement SAGE simulé,
 * production des états, paramétrage daté et supervision des services.
 */

type T = ReturnType<typeof convexTest>

async function reseau(t: T) {
  const net = await t.run(async (ctx) => {
    const pos = await ctx.db.insert("pointsOfSale", {
      code: "OWE",
      name: "Gare d'Owendo",
      type: "gare",
      counters: { passengers: 4, baggage: 2, parcels: 2 },
      isActive: true,
    })
    const owe = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const fcv = await ctx.db.insert("stations", {
      code: "FCV",
      name: "Franceville",
      province: "Haut-Ogooué",
      kilometerPoint: 648,
      isEquipped: true,
      isActive: true,
    })
    const trainId = await ctx.db.insert("trains", {
      number: "TR-201",
      name: "Express",
      type: "EXPRESS",
      isActive: true,
    })
    const coachId = await ctx.db.insert("coaches", {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 2,
      columnCount: 2,
      seatCount: 4,
      standingCapacity: 0,
      position: 1,
    })
    for (const [label, row, column] of [
      ["1A", 1, 1],
      ["1B", 1, 2],
      ["2A", 2, 1],
      ["2B", 2, 2],
    ] as const) {
      await ctx.db.insert("seats", {
        coachId,
        trainId,
        label,
        row,
        column,
        isActive: true,
      })
    }
    const admin = await ctx.db.insert("users", {
      authId: "seed-admin",
      role: "admin_fonctionnel",
      identitySource: "annuaire",
      isActive: true,
    })
    const scheduleId = await ctx.db.insert("fareSchedules", {
      label: "Barème",
      status: "actif",
      validFrom: 0,
      validUntil: Date.now() + 365 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 18,
      cssPct: 0,
      createdBy: admin,
    })
    await ctx.db.insert("fareBases", {
      scheduleId,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 47.51,
      longDistanceRate: 43.42,
    })
    return { pos, owe, fcv, trainId, admin }
  })

  const serviceDate = addDays(toServiceDate(Date.now()), 3)
  const adminCtx = t.withIdentity({ subject: "seed-admin" })
  const bookletId = await adminCtx.mutation(api.functions.booklets.create, {
    label: "Livret",
    validFrom: Date.parse(`${serviceDate}T00:00:00Z`),
    validUntil: Date.parse(`${serviceDate}T23:00:00Z`),
  })
  const scheduleId = await adminCtx.mutation(
    api.functions.booklets.addSchedule,
    {
      bookletId,
      trainId: net.trainId,
      departureTime: "08:00",
      daysOfWeek: [],
      stops: [
        { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
        { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
      ],
    }
  )
  await adminCtx.mutation(api.functions.booklets.submit, { bookletId })
  await adminCtx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId,
    serviceDate,
  })
  return { ...net, serviceDate, tripId: rapport.tripId as Id<"trips"> }
}

async function agent(t: T, role: AppRole, posId?: Id<"pointsOfSale">) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      matricule: role.slice(0, 3).toUpperCase(),
      role,
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return { ctx: t.withIdentity({ subject: authId }), userId }
}

/**
 * Une vente au guichet, caisse clôturée avec un écart de `ecart` XAF
 * (justifié), journée clôturée par le contrôle des recettes.
 */
async function journeeAvecEcart(t: T, ecart = -500) {
  const fx = await reseau(t)
  const vendeur = await agent(t, "vendeur_guichet", fx.pos)
  await vendeur.ctx.mutation(api.functions.cash.openSession, {
    openingFloatXaf: 0,
  })
  const vente = await vendeur.ctx.mutation(
    api.functions.sales.createCounterSale,
    {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [
        {
          lastName: "Mbadinga",
          firstName: "Paul",
          gender: "M",
          nationality: "Gabonaise",
        },
      ],
      method: "especes",
    }
  )
  await vendeur.ctx.mutation(api.functions.cash.closeSession, {
    countedByMethod: [
      { method: "especes", amountXaf: vente.amounts.ttc + ecart },
    ],
    varianceReason:
      ecart === 0 ? undefined : "Pièce rendue en trop à 11:58, constaté au recomptage.",
  })
  const controleur = await agent(t, "controleur_recettes", fx.pos)
  const comptable = await agent(t, "comptable", fx.pos)
  const [day, session] = await t.run(async (c) => [
    await c.db.query("accountingDays").first(),
    await c.db.query("cashSessions").first(),
  ])
  return {
    fx,
    vendeur,
    controleur,
    comptable,
    ttc: vente.amounts.ttc,
    dayId: day!._id as Id<"accountingDays">,
    sessionId: session!._id as Id<"cashSessions">,
  }
}

afterEach(() => vi.useRealTimers())

/* ═══════════════════════════ Logique pure ════════════════════════════════ */

describe("Règles pures du pilotage", () => {
  it("dérive l'état d'une caisse sans jamais le laisser à la couleur", () => {
    expect(etatCaisse({ status: "ouverte" })).toBe("ouverte")
    expect(etatCaisse({ status: "cloturee", varianceXaf: 0 })).toBe("juste")
    expect(etatCaisse({ status: "cloturee", varianceXaf: -500 })).toBe(
      "a_justifier"
    )
    expect(
      etatCaisse({
        status: "cloturee",
        varianceXaf: -500,
        varianceReason: "Pièce rendue",
      })
    ).toBe("a_viser")
    expect(
      etatCaisse({
        status: "cloturee",
        varianceXaf: -500,
        varianceReason: "Pièce rendue",
        recountRequestedAt: 1,
      })
    ).toBe("recomptage")
    expect(etatCaisse({ status: "validee", varianceXaf: -500 })).toBe("visee")
  })

  it("écrit un CSV lisible par Excel en français", () => {
    expect(
      versCsv(["Pièce", "TTC"], [
        ["VEN-1", 32500],
        ["Motif ; long", 12.5],
      ])
    ).toBe('Pièce;TTC\r\nVEN-1;32500\r\n"Motif ; long";12,5')
  })

  it("rattache les programmations historiques aux six états", () => {
    expect(typeCdc("ventes_canaux")).toBe("ventes")
    expect(typeCdc("annulations")).toBe("remboursements")
    expect(typeCdc("recettes")).toBe("etat_caisse")
    expect(typeCdc("extraction_voyageurs")).toBe("extraction_voyageurs")
    const now = Date.parse("2026-10-01T08:00:00Z")
    expect(periodeProgrammee("quotidien", now)).toEqual({
      from: "2026-09-30",
      to: "2026-09-30",
    })
    expect(periodeProgrammee("hebdomadaire", now)).toEqual({
      from: "2026-09-24",
      to: "2026-09-30",
    })
  })

  it("valide le paramétrage champ par champ", () => {
    expect(verifierParametres(PARAMETRES_PAR_DEFAUT)).toEqual([])
    const erreurs = verifierParametres({
      ...PARAMETRES_PAR_DEFAUT,
      vatPct: 120,
      refundPenaltyEarlyPct: 30,
      refundPenaltyLatePct: 10,
      refundReasons: [],
      ssoEnabled: false,
      otpFallbackEnabled: false,
    })
    expect(erreurs.join(" ")).toMatch(/TVA/)
    expect(erreurs.join(" ")).toMatch(/pénalité tardive/)
    expect(erreurs.join(" ")).toMatch(/Motifs de remboursement/)
    expect(erreurs.join(" ")).toMatch(/code à usage unique/)
    expect(completerParametres(null).saleOpeningDays).toBe(90)
  })
})

/* ═════════════════════════ Contrôle des recettes ═════════════════════════ */

describe("Contrôle des recettes", () => {
  it("liste les caisses de la journée avec attendu, constaté et écart", async () => {
    const t = convexTest(schema, modules)
    const { controleur, dayId, ttc } = await journeeAvecEcart(t)
    const vue = await controleur.ctx.query(api.functions.pilotage.caissesJournee, {
      accountingDayId: dayId,
    })
    expect(vue.caisses).toHaveLength(1)
    expect(vue.caisses[0]).toMatchObject({
      expectedXaf: ttc,
      countedXaf: ttc - 500,
      varianceXaf: -500,
      etat: "a_viser",
      pointOfSale: { code: "OWE" },
    })
    expect(vue.totals.ventes).toBe(1)
  })

  it("vise l'écart, trace l'action et débloque le déversement", async () => {
    const t = convexTest(schema, modules)
    const { controleur, comptable, sessionId, dayId } = await journeeAvecEcart(t)
    await controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
      accountingDayId: dayId,
    })

    // Écart non visé : le comptable ne peut pas encore déverser.
    await expect(
      comptable.ctx.mutation(api.functions.accounting.generateJournal, {
        accountingDayId: dayId,
      })
    ).rejects.toThrow(/non visé/)

    await controleur.ctx.mutation(api.functions.pilotage.viserCaisse, {
      sessionId,
      commentaire: "Justification vérifiée avec le chef de gare.",
    })
    const detail = await controleur.ctx.query(api.functions.pilotage.caisse, {
      sessionId,
    })
    expect(detail?.session).toMatchObject({
      status: "validee",
      etat: "visee",
      visaComment: "Justification vérifiée avec le chef de gare.",
    })
    expect(detail?.journal.map((e) => e.action)).toContain("Écart visé")
    await expect(
      controleur.ctx.mutation(api.functions.pilotage.viserCaisse, { sessionId })
    ).rejects.toThrow(/déjà visée/)

    const r = await comptable.ctx.mutation(
      api.functions.accounting.generateJournal,
      { accountingDayId: dayId }
    )
    expect(r.entries).toBe(1)
  })

  it("refuse le visa à un vendeur et à qui n'a pas le droit de valider", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, sessionId, fx } = await journeeAvecEcart(t)
    await expect(
      vendeur.ctx.mutation(api.functions.pilotage.viserCaisse, { sessionId })
    ).rejects.toThrow(/Accès refusé/)
    const chef = await agent(t, "chef_gare", fx.pos)
    await expect(
      chef.ctx.mutation(api.functions.pilotage.viserCaisse, { sessionId })
    ).rejects.toThrow(/Accès refusé/)
  })

  it("demande un recomptage, notifie le vendeur et le trace", async () => {
    const t = convexTest(schema, modules)
    const { controleur, sessionId } = await journeeAvecEcart(t)
    await expect(
      controleur.ctx.mutation(api.functions.pilotage.demanderRecomptage, {
        sessionId,
        motif: "?",
      })
    ).rejects.toThrow(/motif/)
    await controleur.ctx.mutation(api.functions.pilotage.demanderRecomptage, {
      sessionId,
      motif: "Écart supérieur au seuil, recompter le fond.",
    })
    const [session, event, log] = await t.run(async (ctx) => [
      await ctx.db.get(sessionId),
      await ctx.db.query("outboxEvents").first(),
      await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "caisse.recomptage"))
        .first(),
    ])
    expect(etatCaisse(session!)).toBe("recomptage")
    expect(JSON.parse(event!.payload)).toMatchObject({
      kind: "cash_recount_request",
    })
    expect(log?.reason).toMatch(/recompter/)
  })

  it("résume les journées et signale ce qui attend une décision", async () => {
    const t = convexTest(schema, modules)
    const { controleur, dayId } = await journeeAvecEcart(t)
    const journees = await controleur.ctx.query(
      api.functions.pilotage.journeesRecettes,
      {}
    )
    expect(journees[0]).toMatchObject({
      _id: dayId,
      caisses: 1,
      aViser: 1,
      ecartNet: -500,
    })
    const decisions = await controleur.ctx.query(api.functions.pilotage.aDecider, {})
    expect(decisions.map((d) => d.genre)).toContain("ecart")
  })
})

/* ═══════════════════════ Déversement SAGE X3 (simulé) ════════════════════ */

describe("Déversement SAGE X3", () => {
  async function journalPret(t: T, suspendre = false) {
    const j = await journeeAvecEcart(t, 0)
    await j.controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
      accountingDayId: j.dayId,
    })
    await j.comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: j.dayId,
    })
    if (suspendre) {
      await t.run(async (ctx) => {
        await ctx.db.patch(j.fx.pos, { isActive: false })
        await ctx.db.insert("pointsOfSale", {
          code: "LBV",
          name: "Agence Libreville",
          type: "agence_accreditee",
          counters: { passengers: 1, baggage: 0, parcels: 0 },
          isActive: true,
        })
      })
    }
    return j
  }

  it("intègre un journal conforme et en garde l'accusé", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId } = await journalPret(t)
    const r = await comptable.ctx.mutation(api.functions.pilotage.transmettreSage, {
      accountingDayId: dayId,
    })
    expect(r).toMatchObject({ result: "integre", pieces: 1, rejected: 0 })
    const detail = await comptable.ctx.query(api.functions.pilotage.detailJournee, {
      accountingDayId: dayId,
    })
    expect(detail?.day.exportStatus).toBe("integre")
    expect(detail?.equilibre.ecart).toBe(0)
    expect(detail?.transmissions[0]).toMatchObject({
      result: "integre",
      simulated: true,
    })
    await expect(
      comptable.ctx.mutation(api.functions.pilotage.transmettreSage, {
        accountingDayId: dayId,
      })
    ).rejects.toThrow(/déjà intégré/)
  })

  it("rejette les pièces d'un point de vente suspendu, puis les corrige et rejoue", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId } = await journalPret(t, true)
    const rejet = await comptable.ctx.mutation(
      api.functions.pilotage.transmettreSage,
      { accountingDayId: dayId }
    )
    expect(rejet).toMatchObject({ result: "rejete", rejected: 1 })
    const avant = await comptable.ctx.query(api.functions.pilotage.detailJournee, {
      accountingDayId: dayId,
    })
    expect(avant?.day.exportStatus).toBe("echec")
    const piece = avant!.transmissions[0]!.rejectedPieces[0]!
    expect(piece.reason).toMatch(/suspendu/)
    expect(avant?.centresDeCout.map((c) => c.code)).toEqual(["CC-LBV"])

    const lignes = await comptable.ctx.query(
      api.functions.pilotage.journeesComptables,
      {}
    )
    expect(lignes[0]?.derniereTransmission).toMatchObject({ result: "rejete" })

    const r = await comptable.ctx.mutation(
      api.functions.pilotage.corrigerEtRejouer,
      {
        accountingDayId: dayId,
        pieceNumbers: [piece.pieceNumber],
        costCenter: "CC-LBV",
        motif: "Agence suspendue : rattachement au centre Estuaire.",
      }
    )
    expect(r).toMatchObject({ result: "integre", attempt: 2 })
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "comptabilite.corriger"))
        .first()
    )
    expect(JSON.parse(log!.before!)).toEqual([
      { pieceNumber: piece.pieceNumber, costCenter: null },
    ])
  })

  it("rejoue un envoi en échec depuis la supervision, réservé à l'administration IT", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId } = await journalPret(t, true)
    await comptable.ctx.mutation(api.functions.pilotage.transmettreSage, {
      accountingDayId: dayId,
    })
    const event = await t.run(async (ctx) => ctx.db.query("outboxEvents").first())
    await expect(
      comptable.ctx.mutation(api.functions.pilotage.rejouerEvenement, {
        eventId: event!._id,
        motif: "Référentiel corrigé",
      })
    ).rejects.toThrow(/Accès refusé/)
    const it = await agent(t, "admin_it")
    await it.ctx.mutation(api.functions.pilotage.rejouerEvenement, {
      eventId: event!._id,
      motif: "Référentiel corrigé côté SAGE",
    })
    const day = await t.run(async (ctx) => ctx.db.get(dayId))
    expect(day?.exportStatus).toBe("en_attente")
  })
})

/* ═══════════════════════════════ Rapports ════════════════════════════════ */

describe("États du cahier des charges", () => {
  it("produit l'état des ventes en CSV, avec aperçu et fichier téléchargeable", async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const { controleur, fx } = await journeeAvecEcart(t, 0)
    const today = toServiceDate(Date.now())
    const runId = await controleur.ctx.mutation(
      api.functions.pilotage.demanderRapport,
      { reportType: "ventes", from: today, to: today, pointOfSaleId: fx.pos }
    )
    vi.advanceTimersByTime(1000)
    await t.finishInProgressScheduledFunctions()
    const run = await controleur.ctx.query(api.functions.pilotage.executionRapport, {
      runId,
    })
    expect(run).toMatchObject({
      status: "produit",
      rowCount: 1,
      filename: `setrag-ventes-${today}-${today}.csv`,
      autorise: true,
    })
    expect(run?.preview?.entete[0]).toBe("N° opération")
    expect(run?.preview?.lignes[0]?.[6]).toBe("OWE")
    expect(run?.url).toBeTruthy()
    const contenu = await t.run(async (ctx) => {
      const doc = await ctx.db.get(runId)
      const blob = await ctx.storage.get(doc!.storageId!)
      return await blob!.text()
    })
    expect(contenu.split("\r\n")).toHaveLength(2)

    await controleur.ctx.mutation(api.functions.pilotage.tracerTelechargement, {
      runId,
    })
    const historique = await controleur.ctx.query(
      api.functions.pilotage.executionsRapport,
      {}
    )
    expect(historique[0]).toMatchObject({ _id: runId, trigger: "demande" })
  })

  it("réserve les états nominatifs à qui peut lire les données voyageurs", async () => {
    const t = convexTest(schema, modules)
    const fx = await reseau(t)
    const it = await agent(t, "admin_it", fx.pos)
    await expect(
      it.ctx.mutation(api.functions.pilotage.demanderRapport, {
        reportType: "extraction_voyageurs",
        from: fx.serviceDate,
        to: fx.serviceDate,
      })
    ).rejects.toThrow(/Accès refusé/)
    const kpi = await agent(t, "responsable_kpi", fx.pos)
    await expect(
      kpi.ctx.mutation(api.functions.pilotage.demanderRapport, {
        reportType: "ventes",
        from: "2026-01-01",
        to: "2026-12-31",
      })
    ).rejects.toThrow(/trop longue/)
  })

  it("extrait les voyageurs d'une desserte", async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const { controleur, fx } = await journeeAvecEcart(t, 0)
    const runId = await controleur.ctx.mutation(
      api.functions.pilotage.demanderRapport,
      {
        reportType: "extraction_voyageurs",
        from: fx.serviceDate,
        to: fx.serviceDate,
        trainNumber: "201",
      }
    )
    vi.advanceTimersByTime(1000)
    await t.finishInProgressScheduledFunctions()
    const run = await controleur.ctx.query(api.functions.pilotage.executionRapport, {
      runId,
    })
    expect(run?.rowCount).toBe(1)
    expect(run?.preview?.lignes[0]?.slice(0, 2)).toEqual(["MBADINGA", "Paul"])
  })
})

/* ═════════════════════════════ Paramétrage ═══════════════════════════════ */

describe("Paramétrage", () => {
  it("enregistre, refuse l'incohérent et programme une version datée", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"))
    const t = convexTest(schema, modules)
    const admin = await agent(t, "admin_fonctionnel")
    const base = {
      vatPct: 18,
      cssPct: 0,
      seatHoldMinutes: 15,
      mobilePaymentAttempts: 3,
      degradedSalesEnabled: true,
      cashVarianceNotificationsEnabled: true,
    }
    await expect(
      admin.ctx.mutation(api.functions.management.saveSettings, {
        ...base,
        refundPenaltyEarlyPct: 40,
        refundPenaltyLatePct: 20,
      })
    ).rejects.toThrow(/pénalité tardive/)

    await admin.ctx.mutation(api.functions.management.saveSettings, {
      ...base,
      seatHoldMinutes: 10,
      changeReason: "Réduction de la tenue en ligne",
    })
    const effet = Date.parse("2026-11-01T00:00:00Z")
    await admin.ctx.mutation(api.functions.management.saveSettings, {
      ...base,
      seatHoldMinutes: 15,
      refundPenaltyLatePct: 20,
      effectiveFrom: effet,
      changeReason: "Barème du 1er novembre",
    })
    const vue = await admin.ctx.query(api.functions.pilotage.parametres, {})
    expect(vue.courant.seatHoldMinutes).toBe(10)
    expect(vue.programme).toMatchObject({
      effectiveFrom: effet,
      motif: "Barème du 1er novembre",
    })
    expect(vue.programme?.valeurs.refundPenaltyLatePct).toBe(20)
    expect(vue.historique[0]).toMatchObject({ action: "parametrage.programmer" })
    expect(vue.historique[1]?.changes).toEqual([
      { champ: "seatHoldMinutes", avant: 15, apres: 10 },
    ])

    vi.setSystemTime(effet + 1000)
    await t.mutation(internal.functions.pilotage.appliquerParametresProgrammes, {})
    const apres = await admin.ctx.query(api.functions.management.getSettings, {})
    expect(apres).toMatchObject({ seatHoldMinutes: 15, refundPenaltyLatePct: 20 })
    const vide = await admin.ctx.query(api.functions.pilotage.parametres, {})
    expect(vide.programme).toBeNull()
  })

  it("annule une version programmée avec un motif", async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const admin = await agent(t, "admin_fonctionnel")
    await admin.ctx.mutation(api.functions.management.saveSettings, {
      vatPct: 18,
      cssPct: 1,
      seatHoldMinutes: 15,
      mobilePaymentAttempts: 3,
      degradedSalesEnabled: true,
      cashVarianceNotificationsEnabled: true,
      effectiveFrom: Date.now() + 7 * 86_400_000,
    })
    await admin.ctx.mutation(api.functions.pilotage.annulerParametresProgrammes, {
      motif: "Décision reportée par la direction",
    })
    const vue = await admin.ctx.query(api.functions.pilotage.parametres, {})
    expect(vue.programme).toBeNull()
    expect(vue.courant.cssPct).toBe(0)
  })
})

/* ═════════════════════════════ Intégrations ══════════════════════════════ */

describe("Intégrations", () => {
  it("rend l'état des huit services et trace un test de connexion simulé", async () => {
    const t = convexTest(schema, modules)
    const it = await agent(t, "admin_it")
    const etat = await it.ctx.query(api.functions.pilotage.etatIntegrations, {})
    expect(etat.services.map((s) => s.code)).toEqual([
      "SAGE_X3",
      "AIRTEL_MONEY",
      "MOOV_MONEY",
      "CLICKPAY",
      "ENTRA_ID",
      "SMS",
      "TERMINAUX",
      "SIEM",
    ])
    expect(etat.services.find((s) => s.code === "ENTRA_ID")?.etat).toBe(
      "non_raccorde"
    )
    const r = await it.ctx.mutation(api.functions.pilotage.testerConnexion, {
      code: "ENTRA_ID",
    })
    expect(r.result).toBe("non_raccorde")
    const detail = await it.ctx.query(api.functions.pilotage.detailIntegration, {
      code: "ENTRA_ID",
    })
    expect(detail?.tests[0]).toMatchObject({
      result: "non_raccorde",
      simulated: true,
    })
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "integrations.tester"))
        .first()
    )
    expect(log?.entityId).toBe("ENTRA_ID")
  })

  it("refuse la supervision à un vendeur", async () => {
    const t = convexTest(schema, modules)
    const vendeur = await agent(t, "vendeur_guichet")
    await expect(
      vendeur.ctx.query(api.functions.pilotage.etatIntegrations, {})
    ).rejects.toThrow(/Accès refusé/)
  })
})

/* ═════════════════════════ Amorçage de démonstration ═════════════════════ */

describe("Amorçage de démonstration", () => {
  it("clôt les caisses oubliées avec un écart justifié, puis déverse une journée rejetée", async () => {
    vi.useFakeTimers()
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)
    const fx = await reseau(t)
    const vendeur = await agent(t, "vendeur_guichet", fx.pos)
    await vendeur.ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })
    await vendeur.ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "Nzeng", firstName: "Ada", gender: "F" }],
      method: "especes",
    })
    vi.setSystemTime(Date.now() + 2 * 86_400_000)

    const r = await t.mutation(internal.functions.pilotage.amorcerDemo, {})
    expect(r).toMatchObject({ caissesCloses: 1, journeesCloturees: 1 })
    vi.advanceTimersByTime(1000)
    await t.finishInProgressScheduledFunctions()
    const [session, day] = await t.run(async (ctx) => [
      await ctx.db.query("cashSessions").first(),
      await ctx.db.query("accountingDays").first(),
    ])
    expect(session).toMatchObject({ status: "cloturee", varianceXaf: -500 })
    // L'écart attend son visa : pas de journal pour cette journée.
    expect(day?.journalEntryCount).toBeUndefined()

    const controleur = await agent(t, "controleur_recettes", fx.pos)
    await controleur.ctx.mutation(api.functions.pilotage.viserCaisse, {
      sessionId: session!._id as Id<"cashSessions">,
    })
    const demo = await t.mutation(internal.functions.pilotage.amorcerJourneeDemo, {
      accountingDayId: day!._id as Id<"accountingDays">,
      mode: "rejet",
    })
    expect(demo).toMatchObject({ done: true, result: "rejete", rejected: 1 })
    vi.unstubAllEnvs()
  })

  it("refuse de s'exécuter hors démonstration", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)
    await expect(t.mutation(internal.functions.pilotage.amorcerDemo, {})).rejects.toThrow(/DEMO_ACCOUNTS_ENABLED/)
    vi.unstubAllEnvs()
  })
})
