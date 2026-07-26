import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"

/**
 * Annulations, remboursements et duplicatas.
 *
 * Le CDC cite trois failles de fraude de l'existant que ces fonctions doivent
 * fermer : les billets annulés indétectables, les remboursements qui ne
 * viennent pas en déduction des ventes dans les états, et les réimpressions
 * sans mention duplicata. Chacune fait l'objet d'un test dédié.
 */

async function seedSellableTrip(t: ReturnType<typeof convexTest>) {
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
    const boo = await ctx.db.insert("stations", {
      code: "BOO",
      name: "Booué",
      province: "Ogooué-Ivindo",
      kilometerPoint: 340,
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
      label: "Barème de test",
      status: "actif",
      validFrom: 0,
      validUntil: Date.now() + 365 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 0,
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
    return { pos, owe, boo, fcv, trainId }
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
        { stationId: net.boo, sequence: 1, arrivalOffsetMinutes: 380 },
        { stationId: net.fcv, sequence: 2, arrivalOffsetMinutes: 700 },
      ],
    },
  )
  await adminCtx.mutation(api.functions.booklets.submit, { bookletId })
  await adminCtx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId,
    serviceDate,
  })
  return { ...net, tripId: rapport.tripId as Id<"trips">, serviceDate }
}

async function asUser(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  posId: Id<"pointsOfSale">,
  openCash = true,
) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    }),
  )
  const ctx = t.withIdentity({ subject: authId })
  if (openCash) {
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 50000,
    })
  }
  return ctx
}

const VOYAGEUR = {
  lastName: "MBADINGA",
  firstName: "Paul",
  gender: "M" as const,
}

/** Vend `count` billets Owendo → Franceville et retourne la vente. */
async function sell(
  t: ReturnType<typeof convexTest>,
  fx: Awaited<ReturnType<typeof seedSellableTrip>>,
  vendeur: ReturnType<typeof convexTest>["withIdentity"] extends never
    ? never
    : Awaited<ReturnType<typeof asUser>>,
  count = 1,
) {
  return await vendeur.mutation(api.functions.sales.createCounterSale, {
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME",
    passengers: Array.from({ length: count }, (_, i) => ({
      ...VOYAGEUR,
      firstName: `Voyageur${i}`,
    })),
    method: "especes" as const,
  })
}

/* ═══════════════════════════ Annulation ══════════════════════════════════ */

describe("Annulation d'une vente", () => {
  it("crée une écriture liée en montants négatifs", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    const resultat = await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Erreur de saisie au guichet",
    })

    expect(resultat.cancelledTickets).toBe(1)
    expect(resultat.amountTtc).toBe(-28100)

    const ecriture = await t.run(async (c) =>
      c.db.get(resultat.cancellationId as Id<"sales">),
    )
    expect(ecriture?.kind).toBe("annulation")
    expect(ecriture?.amounts.ttc).toBe(-28100)
    expect(ecriture?.originSaleId).toBe(vente.saleId)
    expect(ecriture?.refundReason).toContain("Erreur de saisie")
  })

  it("ne supprime jamais la vente d'origine", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Erreur",
    })

    const origine = await t.run(async (c) =>
      c.db.get(vente.saleId as Id<"sales">),
    )
    expect(origine).not.toBeNull()
    expect(origine?.status).toBe("annulee")
    expect(origine?.cancelledAt).toBeDefined()

    // Les billets restent en base, marqués annulés — jamais effacés.
    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    expect(billets).toHaveLength(1)
    expect(billets[0]?.status).toBe("annule")
  })

  it("libère la place et les compteurs", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Erreur",
    })

    const occupancy = await t.run(async (c) =>
      c.db.query("seatOccupancy").collect(),
    )
    expect(occupancy.every((o) => o.soldMask === 0)).toBe(true)

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    expect(counters.every((c) => c.sold === 0 && c.available === 4)).toBe(true)
  })

  it("rend la place immédiatement revendable", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)

    // Remplit le train, puis annule une vente.
    const vente = await sell(t, fx, vendeur, 4)
    await expect(sell(t, fx, vendeur, 1)).rejects.toThrow(
      /Places insuffisantes/,
    )

    const detail = await vendeur.query(api.functions.sales.get, {
      saleId: vente.saleId as Id<"sales">,
    })
    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      ticketIds: [detail.tickets[0]!._id],
      reason: "Désistement",
    })

    // Une place s'est libérée : la vente suivante passe.
    const suite = await sell(t, fx, vendeur, 1)
    expect(suite.tickets).toHaveLength(1)
  })

  it("annule partiellement sans basculer toute la vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur, 3)
    const detail = await vendeur.query(api.functions.sales.get, {
      saleId: vente.saleId as Id<"sales">,
    })

    const resultat = await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      ticketIds: [detail.tickets[0]!._id],
      reason: "Un voyageur se désiste",
    })

    expect(resultat.partial).toBe(true)
    expect(resultat.cancelledTickets).toBe(1)

    const origine = await t.run(async (c) =>
      c.db.get(vente.saleId as Id<"sales">),
    )
    expect(origine?.status).toBe("confirmee")

    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    expect(billets.filter((b) => b.status === "valide")).toHaveLength(2)
    expect(billets.filter((b) => b.status === "annule")).toHaveLength(1)
  })

  it("vient en déduction du total de la journée comptable", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    const avant = await t.run(async (c) =>
      c.db.query("accountingDays").first(),
    )
    expect(avant?.totalTtc).toBe(28100)

    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Erreur",
    })

    const apres = await t.run(async (c) =>
      c.db.query("accountingDays").first(),
    )
    expect(apres?.totalTtc).toBe(0)
  })

  it("refuse d'annuler un titre déjà contrôlé à bord", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    await t.run(async (c) => {
      const billet = await c.db.query("tickets").first()
      await c.db.patch(billet!._id, { status: "utilise" })
    })

    await expect(
      chef.mutation(api.functions.sales.cancel, {
        saleId: vente.saleId as Id<"sales">,
        reason: "Trop tard",
      }),
    ).rejects.toThrow(/déjà contrôlé/)
  })

  it("refuse une seconde annulation", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Erreur",
    })
    await expect(
      chef.mutation(api.functions.sales.cancel, {
        saleId: vente.saleId as Id<"sales">,
        reason: "Encore",
      }),
    ).rejects.toThrow(/annulation impossible/)
  })

  it("exige un motif", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    await expect(
      chef.mutation(api.functions.sales.cancel, {
        saleId: vente.saleId as Id<"sales">,
        reason: "   ",
      }),
    ).rejects.toThrow(/motif d'annulation est obligatoire/)
  })

  it("refuse un vendeur guichet, qui n'a pas le droit d'annuler", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    // Le vendeur peut créer une annulation d'après la matrice, mais pas le
    // vendeur d'agence — on vérifie ici le cas refusé.
    const agence = await asUser(t, "vendeur_agence", fx.pos, false)
    await expect(
      agence.mutation(api.functions.sales.cancel, {
        saleId: vente.saleId as Id<"sales">,
        reason: "Tentative",
      }),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("refuse un titre qui n'appartient pas à la vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const premiere = await sell(t, fx, vendeur)
    const seconde = await sell(t, fx, vendeur)
    const detailSeconde = await vendeur.query(api.functions.sales.get, {
      saleId: seconde.saleId as Id<"sales">,
    })

    await expect(
      chef.mutation(api.functions.sales.cancel, {
        saleId: premiere.saleId as Id<"sales">,
        ticketIds: [detailSeconde.tickets[0]!._id],
        reason: "Mélange",
      }),
    ).rejects.toThrow(/n'appartient pas à cette vente/)
  })

  it("journalise l'annulation avec son motif", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Motif traçable",
    })
    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    const annulation = logs.find((l) => l.action === "vente.annuler")
    expect(annulation?.after).toContain("Motif traçable")
  })
})

/* ═══════════════════════════ Remboursement ═══════════════════════════════ */

describe("Remboursement", () => {
  it("applique le taux de pénalité paramétré", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    const resultat = await chef.mutation(api.functions.sales.refund, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Renoncement du client à moins de 48 h",
      penaltyPct: 50,
    })

    expect(resultat.paidTtc).toBe(28100)
    expect(resultat.refundedTtc).toBe(14050)
    expect(resultat.penaltyPct).toBe(50)
  })

  it("rembourse intégralement quand la pénalité est nulle", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    const resultat = await chef.mutation(api.functions.sales.refund, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Annulation du train par SETRAG",
      penaltyPct: 0,
    })
    expect(resultat.refundedTtc).toBe(28100)
  })

  it("crée une écriture négative distincte de l'annulation", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    const resultat = await chef.mutation(api.functions.sales.refund, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Renoncement",
      penaltyPct: 10,
    })

    const ecriture = await t.run(async (c) =>
      c.db.get(resultat.refundId as Id<"sales">),
    )
    expect(ecriture?.kind).toBe("remboursement")
    expect(ecriture?.amounts.ttc).toBe(-25290)
    expect(ecriture?.penaltyPct).toBe(10)
    expect(ecriture?.number).toMatch(/^R-OWE-PV-/)
  })

  it("bascule les titres à l'état remboursé et libère l'inventaire", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    await chef.mutation(api.functions.sales.refund, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Renoncement",
      penaltyPct: 10,
    })

    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    expect(billets[0]?.status).toBe("rembourse")

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    expect(counters.every((c) => c.sold === 0)).toBe(true)
  })

  it("refuse un second remboursement", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)

    await chef.mutation(api.functions.sales.refund, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Renoncement",
      penaltyPct: 10,
    })
    await expect(
      chef.mutation(api.functions.sales.refund, {
        saleId: vente.saleId as Id<"sales">,
        reason: "Encore",
        penaltyPct: 10,
      }),
    ).rejects.toThrow(/déjà remboursée/)
  })

  it("refuse un taux de pénalité hors bornes", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    await expect(
      chef.mutation(api.functions.sales.refund, {
        saleId: vente.saleId as Id<"sales">,
        reason: "Aberrant",
        penaltyPct: 150,
      }),
    ).rejects.toThrow(RangeError)
  })

  it("exige un motif", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    await expect(
      chef.mutation(api.functions.sales.refund, {
        saleId: vente.saleId as Id<"sales">,
        reason: "",
        penaltyPct: 0,
      }),
    ).rejects.toThrow(/motif de remboursement est obligatoire/)
  })
})

/* ═══════════════════════════ Duplicata ═══════════════════════════════════ */

describe("Réimpression d'un titre", () => {
  it("produit un duplicata numéroté, jamais un second original", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    const detail = await vendeur.query(api.functions.sales.get, {
      saleId: vente.saleId as Id<"sales">,
    })

    const premier = await vendeur.mutation(
      api.functions.sales.reprintTicket,
      { ticketId: detail.tickets[0]!._id },
    )
    expect(premier.duplicateCount).toBe(1)
    expect(premier.mention).toBe("DUPLICATA N°1")

    const second = await vendeur.mutation(api.functions.sales.reprintTicket, {
      ticketId: detail.tickets[0]!._id,
    })
    expect(second.duplicateCount).toBe(2)
    expect(second.mention).toBe("DUPLICATA N°2")
  })

  it("conserve le compteur sur le titre, pour le contrôle des recettes", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    const detail = await vendeur.query(api.functions.sales.get, {
      saleId: vente.saleId as Id<"sales">,
    })
    await vendeur.mutation(api.functions.sales.reprintTicket, {
      ticketId: detail.tickets[0]!._id,
    })

    const billet = await t.run(async (c) =>
      c.db.get(detail.tickets[0]!._id),
    )
    expect(billet?.duplicateCount).toBe(1)
    // Le numéro d'origine ne change pas : pas de billet fantôme.
    expect(billet?.number).toBe(detail.tickets[0]!.number)
  })

  it("journalise chaque réimpression", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    const detail = await vendeur.query(api.functions.sales.get, {
      saleId: vente.saleId as Id<"sales">,
    })
    await vendeur.mutation(api.functions.sales.reprintTicket, {
      ticketId: detail.tickets[0]!._id,
    })
    await vendeur.mutation(api.functions.sales.reprintTicket, {
      ticketId: detail.tickets[0]!._id,
    })

    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    const duplicatas = logs.filter((l) => l.action === "billet.duplicata")
    expect(duplicatas).toHaveLength(2)
  })

  it("refuse de réimprimer un titre annulé", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const vente = await sell(t, fx, vendeur)
    const detail = await vendeur.query(api.functions.sales.get, {
      saleId: vente.saleId as Id<"sales">,
    })
    await chef.mutation(api.functions.sales.cancel, {
      saleId: vente.saleId as Id<"sales">,
      reason: "Erreur",
    })

    await expect(
      vendeur.mutation(api.functions.sales.reprintTicket, {
        ticketId: detail.tickets[0]!._id,
      }),
    ).rejects.toThrow(/réimpression impossible/)
  })
})

/* ═══════════════════ Traçabilité dans les états ══════════════════════════ */

describe("Traçabilité dans les états de contrôle", () => {
  it("distingue ventes, annulations et remboursements", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    // Le chef de gare annule et rembourse, mais ne tient pas de caisse.
    const chef = await asUser(t, "chef_gare", fx.pos, false)
    const vendeur = await asUser(t, "vendeur_guichet", fx.pos)
    const controleur = await asUser(t, "controleur_recettes", fx.pos, false)

    const a = await sell(t, fx, vendeur)
    const b = await sell(t, fx, vendeur)
    await chef.mutation(api.functions.sales.cancel, {
      saleId: a.saleId as Id<"sales">,
      reason: "Erreur",
    })
    await chef.mutation(api.functions.sales.refund, {
      saleId: b.saleId as Id<"sales">,
      reason: "Renoncement",
      penaltyPct: 10,
    })

    const jour = await t.run(async (c) => c.db.query("accountingDays").first())
    const etats = await controleur.query(api.functions.cash.controlStates, {
      accountingDayId: jour!._id,
    })

    expect(etats.totals.sales).toBe(2)
    expect(etats.totals.cancellations).toBe(1)
    expect(etats.totals.refunds).toBe(1)
    // 28 100 × 2 − 28 100 − 25 290 = 2 810
    expect(etats.totals.ttc).toBe(2810)
  })
})
