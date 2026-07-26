import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { toServiceDate, addDays } from "../model/calendar"

/**
 * Vente au guichet — tests d'intégration.
 *
 * Le point critique est l'inventaire : une vente doit poser le billet sur une
 * place, décrémenter les compteurs de chaque segment emprunté, et refuser
 * toute vente qui dépasserait la capacité. Ces effets sont indissociables.
 */

/* ────────────────────────────── Fixtures ───────────────────────────────── */

/** Réseau, train, livret, desserte et grille tarifaire, prêts à vendre. */
async function seedSellableTrip(t: ReturnType<typeof convexTest>) {
  const net = await t.run(async (ctx) => {
    const pos = await ctx.db.insert("pointsOfSale", {
      code: "OWE-PV",
      name: "Owendo — point de vente",
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
    const ndj = await ctx.db.insert("stations", {
      code: "NDJ",
      name: "Ndjolé",
      province: "Moyen-Ogooué",
      kilometerPoint: 175,
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
    // Une voiture 2e de 4 places, sans place debout : capacité maîtrisée.
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

    // Grille tarifaire de l'annexe 2, sans taxe pour lire les prix bruts.
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
    await ctx.db.insert("discounts", {
      scheduleId,
      code: "ENFANT",
      label: "Enfant 4-11 ans",
      ratePct: 50,
      minAge: 4,
      maxAge: 11,
      requiresProof: true,
      isActive: true,
    })
    return { pos, owe, ndj, boo, fcv, trainId, admin }
  })

  // Livret et desserte, à une date dans la fenêtre de vente.
  const serviceDate = addDays(toServiceDate(Date.now()), 3)
  const adminCtx = t.withIdentity({ subject: "seed-admin" })
  const bookletId = await adminCtx.mutation(api.functions.booklets.create, {
    label: "Livret de vente",
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
        { stationId: net.ndj, sequence: 1, arrivalOffsetMinutes: 200 },
        { stationId: net.boo, sequence: 2, arrivalOffsetMinutes: 380 },
        { stationId: net.fcv, sequence: 3, arrivalOffsetMinutes: 700 },
      ],
    },
  )
  await adminCtx.mutation(api.functions.booklets.submit, { bookletId })
  await adminCtx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId,
    serviceDate,
  })

  return { ...net, serviceDate, tripId: rapport.tripId as Id<"trips"> }
}

/** Vendeur rattaché au point de vente, avec sa caisse ouverte. */
async function asSeller(
  t: ReturnType<typeof convexTest>,
  posId: Id<"pointsOfSale">,
  options: { role?: AppRole; openCash?: boolean } = {},
) {
  const authId = `vendeur-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Aly",
      lastName: "MBOUMBA",
      role: options.role ?? "vendeur_guichet",
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    }),
  )
  const ctx = t.withIdentity({ subject: authId })
  if (options.openCash !== false) {
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 50000,
    })
  }
  return { ctx, userId }
}

const VOYAGEUR = {
  lastName: "MBADINGA",
  firstName: "Paul",
  gender: "M" as const,
  phone: "+241 06 00 00 00",
  emergencyPhone: "+241 06 11 11 11",
}

/* ═══════════════════════ Vente nominale ══════════════════════════════════ */

describe("Vente au guichet — cas nominal", () => {
  it("émet un billet, l'attache à une place et calcule le prix du barème", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const resultat = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
      tendered: 30000,
    })

    expect(resultat.tickets).toHaveLength(1)
    // 648 km × 43,42 = 28 136,16 → arrondi au 100 F
    expect(resultat.amounts.ttc).toBe(28100)
    expect(resultat.tickets[0]?.seatLabel).toBe("1A")
    expect(resultat.changeDue).toBe(1900)
    expect(resultat.number).toMatch(/^V-OWE-PV-\d{8}-000001$/)
  })

  it("décrémente les compteurs de chaque segment emprunté", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.boo,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
    })

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    const parSegment = counters.sort((a, b) => a.segmentIndex - b.segmentIndex)
    // Owendo → Booué emprunte les segments 0 et 1, pas le 2.
    expect(parSegment[0]?.sold).toBe(1)
    expect(parSegment[0]?.available).toBe(3)
    expect(parSegment[1]?.sold).toBe(1)
    expect(parSegment[2]?.sold).toBe(0)
    expect(parSegment[2]?.available).toBe(4)
  })

  it("pose le masque d'occupation sur les seuls segments du trajet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.ndj,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
    })

    const occupancy = await t.run(async (c) =>
      c.db.query("seatOccupancy").collect(),
    )
    const occupee = occupancy.find((o) => o.soldMask !== 0)
    // Segment 0 seulement.
    expect(occupee?.soldMask).toBe(0b001)
  })

  it("enregistre la ventilation fiscale et la trace tarifaire", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const resultat = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
    })

    const detail = await ctx.query(api.functions.sales.get, {
      saleId: resultat.saleId as Id<"sales">,
    })
    expect(detail.sale.amounts.ht + detail.sale.amounts.vat).toBeCloseTo(
      detail.sale.amounts.ttc,
      2,
    )
    const billet = detail.tickets[0]!
    expect(billet.fare.distanceKm).toBe(648)
    expect(billet.fare.ratePerKm).toBe(43.42)
    expect(billet.fare.roundingStep).toBe(100)
    expect(billet.fromStopIndex).toBe(0)
    expect(billet.toStopIndex).toBe(3)
    expect(billet.status).toBe("valide")
  })

  it("vend un groupe et attribue une place par voyageur", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const resultat = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [
        VOYAGEUR,
        { ...VOYAGEUR, firstName: "Marie", gender: "F" as const },
        { ...VOYAGEUR, firstName: "Jean" },
      ],
      method: "especes",
    })

    expect(resultat.tickets).toHaveLength(3)
    const places = resultat.tickets.map((b) => b.seatLabel)
    expect(new Set(places).size).toBe(3)
    expect(resultat.amounts.ttc).toBe(28100 * 3)
  })

  it("applique une réduction déclarée sur un voyageur du groupe", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const resultat = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [
        VOYAGEUR,
        { ...VOYAGEUR, firstName: "Enfant", discountCode: "ENFANT" },
      ],
      method: "especes",
    })

    const prix = resultat.tickets.map((b) => b.unitPriceTtc).sort((a, b) => a - b)
    expect(prix[0]).toBe(14100) // 28 136,16 / 2 → arrondi
    expect(prix[1]).toBe(28100)
  })

  it("numérote les ventes et les billets de façon continue", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const premiere = await ctx.mutation(
      api.functions.sales.createCounterSale,
      {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.ndj,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      },
    )
    const seconde = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.ndj,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
    })

    expect(premiere.number).toMatch(/-000001$/)
    expect(seconde.number).toMatch(/-000002$/)
    expect(premiere.tickets[0]?.number).toMatch(/^B-OWE-PV-\d{8}-000001$/)
    expect(seconde.tickets[0]?.number).toMatch(/-000002$/)
  })

  it("rattache la vente à la caisse et à la journée comptable", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
    })

    const etat = await ctx.query(api.functions.cash.mySession, {})
    expect(etat?.salesCount).toBe(1)
    expect(etat?.totalTtc).toBe(28100)

    const jours = await t.run(async (c) =>
      c.db.query("accountingDays").collect(),
    )
    expect(jours[0]?.totalTtc).toBe(28100)
  })

  it("journalise la vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx, userId } = await asSeller(t, fx.pos)

    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      method: "especes",
      deviceId: "GUICHET-3",
    })

    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    const vente = logs.find((l) => l.action === "vente.guichet")
    expect(vente?.actorId).toBe(userId)
    expect(vente?.deviceId).toBe("GUICHET-3")
  })
})

/* ═══════════════ La garantie centrale : pas de survente ══════════════════ */

describe("Garantie anti-survente", () => {
  it("refuse la vente qui dépasserait la capacité d'un segment", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    // 4 places pour toute la ligne : la voiture est pleine.
    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: Array.from({ length: 4 }, (_, i) => ({
        ...VOYAGEUR,
        firstName: `Voyageur${i}`,
      })),
      method: "especes",
    })

    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/Places insuffisantes/)
  })

  it("revend une place libérée en cours de route — la propriété du CDC §7.5", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    // Les 4 places partent d'Owendo à Booué.
    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.boo,
      serviceClass: "DEUXIEME",
      passengers: Array.from({ length: 4 }, (_, i) => ({
        ...VOYAGEUR,
        firstName: `Voyageur${i}`,
      })),
      method: "especes",
    })

    // Le train est complet jusqu'à Booué…
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.ndj,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/Places insuffisantes/)

    // …mais les mêmes places se revendent au-delà de Booué.
    const suite = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.boo,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: Array.from({ length: 4 }, (_, i) => ({
        ...VOYAGEUR,
        firstName: `Second${i}`,
      })),
      method: "especes",
    })
    expect(suite.tickets).toHaveLength(4)
  })

  it("n'écrit aucun billet quand la vente est refusée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: Array.from({ length: 5 }, (_, i) => ({
          ...VOYAGEUR,
          firstName: `Trop${i}`,
        })),
        method: "especes",
      }),
    ).rejects.toThrow()

    const ventes = await t.run(async (c) => c.db.query("sales").collect())
    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    expect(ventes).toHaveLength(0)
    expect(billets).toHaveLength(0)
    expect(counters.every((c) => c.sold === 0)).toBe(true)
  })

  it("les compteurs ne descendent jamais sous zéro", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    for (let i = 0; i < 4; i += 1) {
      await ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [{ ...VOYAGEUR, firstName: `V${i}` }],
        method: "especes",
      })
    }

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    for (const c of counters) {
      expect(c.available).toBeGreaterThanOrEqual(0)
      expect(c.sold).toBeLessThanOrEqual(c.capacity)
    }
  })

  it("refuse une place déjà occupée sur le trajet demandé", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const premiere = await ctx.mutation(
      api.functions.sales.createCounterSale,
      {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      },
    )
    const detail = await ctx.query(api.functions.sales.get, {
      saleId: premiere.saleId as Id<"sales">,
    })
    const placePrise = detail.tickets[0]!.seatId!

    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [{ ...VOYAGEUR, seatId: placePrise }],
        method: "especes",
      }),
    ).rejects.toThrow(/Place indisponible/)
  })

  it("attribue une place demandée si elle est libre sur le trajet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)

    const places = await t.query(api.functions.trips.availableSeats, {
      tripId: fx.tripId,
      fromIndex: 0,
      toIndex: 3,
    })
    const souhaitee = places.find((p) => p.label === "2B")!

    const resultat = await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ ...VOYAGEUR, seatId: souhaitee.seatId }],
      method: "especes",
    })
    expect(resultat.tickets[0]?.seatLabel).toBe("2B")
  })
})

/* ═══════════════════════ Refus et contrôles ══════════════════════════════ */

describe("Contrôles avant vente", () => {
  it("refuse un rôle non habilité", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos, {
      role: "responsable_kpi",
      openCash: false,
    })
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("refuse la vente sans session de caisse ouverte", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos, { openCash: false })
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/Aucune session de caisse ouverte/)
  })

  it("refuse une desserte fermée à la vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await t.run(async (c) =>
      c.db.patch(fx.tripId, { isOpenForSale: false }),
    )
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/fermée à la vente/)
  })

  it("refuse une desserte annulée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await t.run(async (c) => c.db.patch(fx.tripId, { status: "annule" }))
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/vente impossible/)
  })

  it("refuse un trajet à contresens", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.fcv,
        destinationStationId: fx.owe,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/Sens de circulation incompatible/)
  })

  it("refuse une classe non commercialisée sur la desserte", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "VIP",
        passengers: [VOYAGEUR],
        method: "especes",
      }),
    ).rejects.toThrow(/non commercialisée/)
  })

  it("refuse une réduction inconnue", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [{ ...VOYAGEUR, discountCode: "INEXISTANTE" }],
        method: "especes",
      }),
    ).rejects.toThrow(/inconnue ou désactivée/)
  })

  it("refuse une vente sans voyageur", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [],
        method: "especes",
      }),
    ).rejects.toThrow(/Aucun voyageur/)
  })

  it("refuse un règlement en espèces insuffisant", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const { ctx } = await asSeller(t, fx.pos)
    await expect(
      ctx.mutation(api.functions.sales.createCounterSale, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        method: "especes",
        tendered: 1000,
      }),
    ).rejects.toThrow(/Règlement insuffisant/)
  })

  it("refuse un agent non rattaché à un point de vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellableTrip(t)
    const authId = "vendeur-orphelin"
    await t.run(async (c) =>
      c.db.insert("users", {
        authId,
        role: "vendeur_guichet",
        identitySource: "annuaire",
        isActive: true,
      }),
    )
    await expect(
      t
        .withIdentity({ subject: authId })
        .mutation(api.functions.sales.createCounterSale, {
          tripId: fx.tripId,
          originStationId: fx.owe,
          destinationStationId: fx.fcv,
          serviceClass: "DEUXIEME",
          passengers: [VOYAGEUR],
          method: "especes",
        }),
    ).rejects.toThrow(/non rattaché à un point de vente/)
  })
})
