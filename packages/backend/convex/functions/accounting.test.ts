import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"

/**
 * Journal comptable, déversement SAGE et ressaisie des ventes manuelles.
 *
 * Deux garanties sont vérifiées ici : un journal déséquilibré n'est jamais
 * transmis, et un billet papier ne peut pas être ressaisi deux fois.
 */

async function seedSellable(t: ReturnType<typeof convexTest>) {
  const net = await t.run(async (ctx) => {
    const pos = await ctx.db.insert("pointsOfSale", {
      code: "OWE-PV",
      name: "Owendo",
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
    },
  )
  await adminCtx.mutation(api.functions.booklets.submit, { bookletId })
  await adminCtx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId,
    serviceDate,
  })
  return { ...net, tripId: rapport.tripId as Id<"trips"> }
}

async function asUser(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  posId: Id<"pointsOfSale">,
  openCash = false,
) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    }),
  )
  const ctx = t.withIdentity({ subject: authId })
  if (openCash) {
    await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })
  }
  return { ctx, userId }
}

/** Vend un billet puis clôture caisse et journée. */
async function sellAndClose(t: ReturnType<typeof convexTest>) {
  const fx = await seedSellable(t)
  const vendeur = await asUser(t, "vendeur_guichet", fx.pos, true)
  const vente = await vendeur.ctx.mutation(
    api.functions.sales.createCounterSale,
    {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "MBADINGA", firstName: "Paul", gender: "M" }],
      method: "especes",
    },
  )
  await vendeur.ctx.mutation(api.functions.cash.closeSession, {
    countedByMethod: [{ method: "especes", amountXaf: vente.amounts.ttc }],
  })
  const controleur = await asUser(t, "controleur_recettes", fx.pos)
  const day = await t.run(async (c) => c.db.query("accountingDays").first())
  await controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
    accountingDayId: day!._id,
  })
  // Le comptable produit le journal : le contrôleur de recettes clôture,
  // il ne déverse pas. Séparation des tâches du circuit de recettes.
  const comptable = await asUser(t, "comptable", fx.pos)
  return { fx, vendeur, controleur, comptable, dayId: day!._id, ttc: vente.amounts.ttc }
}

/* ═══════════════════════ Journal comptable ═══════════════════════════════ */

describe("Génération du journal V65", () => {
  it("engendre une écriture par vente et la met en file d'envoi", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)

    const r = await comptable.ctx.mutation(
      api.functions.accounting.generateJournal,
      { accountingDayId: dayId },
    )
    expect(r.entries).toBe(1)
    expect(r.totalTtc).toBe(ttc)
    expect(r.byAccount[0]?.analyticAccount).toBe("706100")

    const outbox = await t.run(async (c) =>
      c.db.query("outboxEvents").collect(),
    )
    const sage = outbox.find((e) => e.type === "sage_export")
    expect(sage?.status).toBe("en_attente")
    expect(sage?.payload).toContain("JOURNAL;PIECE;DATE")
  })

  it("refuse de déverser une journée non clôturée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos, true)
    await vendeur.ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "X", firstName: "Y", gender: "M" }],
      method: "especes",
    })
    const comptable = await asUser(t, "comptable", fx.pos)
    const day = await t.run(async (c) => c.db.query("accountingDays").first())

    await expect(
      comptable.ctx.mutation(api.functions.accounting.generateJournal, {
        accountingDayId: day!._id,
      }),
    ).rejects.toThrow(/non clôturée/)
  })

  it("refuse de régénérer un journal déjà produit", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)
    await comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: dayId,
    })
    await expect(
      comptable.ctx.mutation(api.functions.accounting.generateJournal, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/déjà engendré/)
  })

  it("refuse de transmettre un journal déséquilibré", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)

    // Fausse le total de la journée : le journal ne correspondra plus.
    await t.run(async (c) => c.db.patch(dayId, { totalTtc: 99999 }))

    await expect(
      comptable.ctx.mutation(api.functions.accounting.generateJournal, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/déséquilibré/)

    // Rien n'a été écrit : ni écriture, ni file d'envoi.
    const entries = await t.run(async (c) =>
      c.db.query("journalEntries").collect(),
    )
    expect(entries).toHaveLength(0)
  })

  it("compense annulations et remboursements dans le journal", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos, true)
    const chef = await asUser(t, "chef_gare", fx.pos)

    const a = await vendeur.ctx.mutation(
      api.functions.sales.createCounterSale,
      {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [{ lastName: "A", firstName: "A", gender: "M" }],
        method: "especes",
      },
    )
    await vendeur.ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "B", firstName: "B", gender: "M" }],
      method: "especes",
    })
    await chef.ctx.mutation(api.functions.sales.cancel, {
      saleId: a.saleId as Id<"sales">,
      reason: "Erreur",
    })

    // Une vente encaissée, l'autre annulée : la caisse ne contient que la
    // seconde, l'annulation étant venue en déduction.
    const encaisse = await vendeur.ctx
      .query(api.functions.cash.mySession, {})
      .then((s) => s!.totalReceived)
    await vendeur.ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: encaisse }],
    })
    const controleur = await asUser(t, "controleur_recettes", fx.pos)
    const day = await t.run(async (c) => c.db.query("accountingDays").first())
    await controleur.ctx.mutation(api.functions.cash.closeAccountingDay, {
      accountingDayId: day!._id,
    })

    const comptable = await asUser(t, "comptable", fx.pos)
    const r = await comptable.ctx.mutation(
      api.functions.accounting.generateJournal,
      { accountingDayId: day!._id },
    )
    // Deux ventes plus une annulation négative : trois écritures, un billet
    // net. Le total du journal égale exactement le montant resté en caisse.
    expect(r.entries).toBe(3)
    expect(r.totalTtc).toBe(encaisse)
  })

  it("expose le fichier tel qu'il sera transmis", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)
    await comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: dayId,
    })
    const csv = await comptable.ctx.query(
      api.functions.accounting.previewExport,
      { accountingDayId: dayId },
    )
    expect(csv).toContain("VT;V-OWE-PV-")
    expect(csv).toContain("706100")
    expect(csv?.split("\n")).toHaveLength(2)
  })

  it("réserve le déversement aux rôles comptables", async () => {
    const t = convexTest(schema, modules)
    const { fx, dayId } = await sellAndClose(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    await expect(
      vendeur.ctx.mutation(api.functions.accounting.generateJournal, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/Accès refusé/)
  })
})

describe("Suivi du déversement", () => {
  it("marque la journée intégrée à réception de l'accusé", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)
    await comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: dayId,
    })

    await comptable.ctx.mutation(api.functions.accounting.acknowledgeExport, {
      accountingDayId: dayId,
      integrated: true,
    })

    const day = await t.run(async (c) => c.db.get(dayId))
    expect(day?.exportStatus).toBe("integre")
    const outbox = await t.run(async (c) =>
      c.db.query("outboxEvents").collect(),
    )
    expect(outbox[0]?.status).toBe("envoye")
    expect(outbox[0]?.sentAt).toBeDefined()
  })

  it("enregistre un échec avec son motif et permet le rejeu", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)
    await comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: dayId,
    })

    await comptable.ctx.mutation(api.functions.accounting.acknowledgeExport, {
      accountingDayId: dayId,
      integrated: false,
      error: "Compte analytique inconnu (ligne 214)",
    })
    let day = await t.run(async (c) => c.db.get(dayId))
    expect(day?.exportStatus).toBe("echec")
    expect(day?.exportError).toContain("ligne 214")

    const r = await comptable.ctx.mutation(
      api.functions.accounting.retryExport,
      { accountingDayId: dayId },
    )
    expect(r.attempts).toBe(1)
    day = await t.run(async (c) => c.db.get(dayId))
    expect(day?.exportStatus).toBe("en_attente")
    expect(day?.exportError).toBeUndefined()
  })

  it("refuse de rejouer un déversement déjà intégré", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)
    await comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: dayId,
    })
    await comptable.ctx.mutation(api.functions.accounting.acknowledgeExport, {
      accountingDayId: dayId,
      integrated: true,
    })
    await expect(
      comptable.ctx.mutation(api.functions.accounting.retryExport, {
        accountingDayId: dayId,
      }),
    ).rejects.toThrow(/déjà intégré/)
  })

  it("liste les déversements pour l'écran d'intégration", async () => {
    const t = convexTest(schema, modules)
    const { comptable, dayId, ttc } = await sellAndClose(t)
    await comptable.ctx.mutation(api.functions.accounting.generateJournal, {
      accountingDayId: dayId,
    })
    const liste = await comptable.ctx.query(
      api.functions.accounting.listExports,
      {},
    )
    expect(liste).toHaveLength(1)
    expect(liste[0]?.event.status).toBe("en_attente")
  })
})

/* ═══════════════════ Ressaisie des ventes manuelles ══════════════════════ */

describe("Ressaisie d'une vente manuelle", () => {
  async function context(t: ReturnType<typeof convexTest>) {
    const fx = await seedSellable(t)
    const taxateur = await asUser(t, "taxateur", fx.pos)
    const vendeurOrigine = await asUser(t, "vendeur_guichet", fx.pos)
    return { fx, taxateur, vendeurOrigine }
  }

  const base = (fx: Awaited<ReturnType<typeof seedSellable>>) => ({
    soldAt: Date.now() - 3_600_000,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME" as const,
    passengerName: "OBAME Jean",
    amountReceivedXaf: 28100,
  })

  it("conserve les deux numérotations", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)

    const r = await taxateur.ctx.mutation(
      api.functions.manualSales.recordManualSale,
      {
        ...base(fx),
        preprintedNumber: "PP-0042817",
        originalSellerId: vendeurOrigine.userId,
      },
    )
    expect(r.preprintedNumber).toBe("PP-0042817")
    expect(r.systemNumber).toMatch(/^V-OWE-PV-\d{8}-000001$/)
  })

  it("n'émet aucun titre électronique", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    await taxateur.ctx.mutation(api.functions.manualSales.recordManualSale, {
      ...base(fx),
      preprintedNumber: "PP-0042817",
      originalSellerId: vendeurOrigine.userId,
    })
    // Le CDC est explicite : « sans autre émission de titre de transport ».
    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    expect(billets).toHaveLength(0)
  })

  it("conserve la date réelle de vente, distincte de la ressaisie", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    const veille = Date.now() - 26 * 3_600_000
    await taxateur.ctx.mutation(api.functions.manualSales.recordManualSale, {
      ...base(fx),
      soldAt: veille,
      preprintedNumber: "PP-0042817",
      originalSellerId: vendeurOrigine.userId,
    })

    const liste = await taxateur.ctx.query(api.functions.manualSales.list, {})
    expect(liste[0]?.manual.soldAt).toBe(veille)
    expect(liste[0]?.manual.recordedAt).toBeGreaterThan(veille)
    expect(liste[0]?.delayHours).toBe(26)
  })

  it("attribue la vente au vendeur d'origine, pas au taxateur", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    const r = await taxateur.ctx.mutation(
      api.functions.manualSales.recordManualSale,
      {
        ...base(fx),
        preprintedNumber: "PP-0042817",
        originalSellerId: vendeurOrigine.userId,
      },
    )
    const vente = await t.run(async (c) => c.db.get(r.saleId as Id<"sales">))
    expect(vente?.sellerId).toBe(vendeurOrigine.userId)
    expect(vente?.channel).toBe("manuel")

    const manuel = await t.run(async (c) =>
      c.db.query("manualTickets").first(),
    )
    expect(manuel?.recordedBy).toBe(taxateur.userId)
  })

  it("refuse une double ressaisie du même billet papier", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    const args = {
      ...base(fx),
      preprintedNumber: "PP-0042817",
      originalSellerId: vendeurOrigine.userId,
    }
    await taxateur.ctx.mutation(
      api.functions.manualSales.recordManualSale,
      args,
    )
    await expect(
      taxateur.ctx.mutation(api.functions.manualSales.recordManualSale, args),
    ).rejects.toThrow(/déjà été ressaisi/)
  })

  it("refuse un numéro pré-imprimé illisible", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    await expect(
      taxateur.ctx.mutation(api.functions.manualSales.recordManualSale, {
        ...base(fx),
        preprintedNumber: "carnet bleu",
        originalSellerId: vendeurOrigine.userId,
      }),
    ).rejects.toThrow(/illisible/)
  })

  it("refuse une date de vente dans le futur", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    await expect(
      taxateur.ctx.mutation(api.functions.manualSales.recordManualSale, {
        ...base(fx),
        soldAt: Date.now() + 86_400_000,
        preprintedNumber: "PP-0042818",
        originalSellerId: vendeurOrigine.userId,
      }),
    ).rejects.toThrow(/dans le futur/)
  })

  it("réserve la ressaisie aux rôles habilités", async () => {
    const t = convexTest(schema, modules)
    const { fx, vendeurOrigine } = await context(t)
    const kpi = await asUser(t, "responsable_kpi", fx.pos)
    await expect(
      kpi.ctx.mutation(api.functions.manualSales.recordManualSale, {
        ...base(fx),
        preprintedNumber: "PP-0042819",
        originalSellerId: vendeurOrigine.userId,
      }),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("entre dans les totaux de la journée comptable", async () => {
    const t = convexTest(schema, modules)
    const { fx, taxateur, vendeurOrigine } = await context(t)
    await taxateur.ctx.mutation(api.functions.manualSales.recordManualSale, {
      ...base(fx),
      preprintedNumber: "PP-0042817",
      originalSellerId: vendeurOrigine.userId,
    })
    const day = await t.run(async (c) => c.db.query("accountingDays").first())
    expect(day?.totalTtc).toBe(28100)
  })
})

describe("Contrôle de continuité des carnets", () => {
  it("ne signale aucun trou sur une séquence complète", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const taxateur = await asUser(t, "taxateur", fx.pos)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)

    for (const n of ["PP-0042810", "PP-0042811", "PP-0042812"]) {
      await taxateur.ctx.mutation(
        api.functions.manualSales.recordManualSale,
        {
          soldAt: Date.now() - 3_600_000,
          originStationId: fx.owe,
          destinationStationId: fx.fcv,
          serviceClass: "DEUXIEME",
          passengerName: "X",
          amountReceivedXaf: 28100,
          preprintedNumber: n,
          originalSellerId: vendeur.userId,
        },
      )
    }

    const r = await taxateur.ctx.query(
      api.functions.accounting.checkManualSequence,
      {},
    )
    expect(r.totalMissing).toBe(0)
    expect(r.carnets[0]?.recorded).toBe(3)
  })

  it("détecte les billets émis mais jamais ressaisis", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const taxateur = await asUser(t, "taxateur", fx.pos)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)

    for (const n of ["PP-0042810", "PP-0042813"]) {
      await taxateur.ctx.mutation(
        api.functions.manualSales.recordManualSale,
        {
          soldAt: Date.now() - 3_600_000,
          originStationId: fx.owe,
          destinationStationId: fx.fcv,
          serviceClass: "DEUXIEME",
          passengerName: "X",
          amountReceivedXaf: 28100,
          preprintedNumber: n,
          originalSellerId: vendeur.userId,
        },
      )
    }

    const r = await taxateur.ctx.query(
      api.functions.accounting.checkManualSequence,
      {},
    )
    expect(r.totalMissing).toBe(2)
    expect(r.carnets[0]?.missing).toEqual([42811, 42812])
  })

  it("contrôle chaque carnet séparément", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const taxateur = await asUser(t, "taxateur", fx.pos)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)

    for (const n of ["PP-001", "PP-003", "QQ-010", "QQ-011"]) {
      await taxateur.ctx.mutation(
        api.functions.manualSales.recordManualSale,
        {
          soldAt: Date.now() - 3_600_000,
          originStationId: fx.owe,
          destinationStationId: fx.fcv,
          serviceClass: "DEUXIEME",
          passengerName: "X",
          amountReceivedXaf: 1000,
          preprintedNumber: n,
          originalSellerId: vendeur.userId,
        },
      )
    }

    const r = await taxateur.ctx.query(
      api.functions.accounting.checkManualSequence,
      {},
    )
    expect(r.carnets).toHaveLength(2)
    expect(r.totalMissing).toBe(1)
    const pp = r.carnets.find((c) => c.prefix === "PP")
    expect(pp?.missing).toEqual([2])
  })

  it("retourne un état vide sans vente manuelle", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const taxateur = await asUser(t, "taxateur", fx.pos)
    const r = await taxateur.ctx.query(
      api.functions.accounting.checkManualSequence,
      {},
    )
    expect(r.carnets).toEqual([])
    expect(r.totalMissing).toBe(0)
  })
})
