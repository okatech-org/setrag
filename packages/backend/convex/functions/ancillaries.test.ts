import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"

/**
 * Bagages, colis express, transport auto accompagné et transport funéraire.
 *
 * Ces quatre produits partagent l'enveloppe de vente du billet — caisse,
 * journée comptable, numérotation — et n'en diffèrent que par leur
 * identifiant physique et leur barème. Les tests vérifient les deux aspects.
 */

async function seedContext(t: ReturnType<typeof convexTest>) {
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
    // Barème colis partiel : zone 7 uniquement (600-699 km).
    for (const [tier, amount] of [
      [1, 4000],
      [2, 6500],
      [3, 8800],
    ] as const) {
      await ctx.db.insert("ancillaryFares", {
        scheduleId,
        product: "colis",
        zone: 7,
        weightTier: tier,
        amountHt: amount,
        label: `Zone 7 — palier ${tier}`,
      })
    }
    await ctx.db.insert("ancillaryFares", {
      scheduleId,
      product: "taa",
      zone: 7,
      amountHt: 120000,
      label: "TAA zone 7",
    })
    await ctx.db.insert("ancillaryFares", {
      scheduleId,
      product: "funeraire",
      zone: 7,
      amountHt: 95000,
      label: "Funéraire zone 7",
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
  return { ...net, tripId: rapport.tripId as Id<"trips"> }
}

async function asSeller(
  t: ReturnType<typeof convexTest>,
  posId: Id<"pointsOfSale">,
  role: AppRole = "vendeur_guichet",
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
  await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })
  return ctx
}

/** Vend un billet Owendo → Franceville et retourne son identifiant. */
async function sellTicket(
  t: ReturnType<typeof convexTest>,
  fx: Awaited<ReturnType<typeof seedContext>>,
  seller: Awaited<ReturnType<typeof asSeller>>,
) {
  const vente = await seller.mutation(api.functions.sales.createCounterSale, {
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME",
    passengers: [{ lastName: "MBADINGA", firstName: "Paul", gender: "M" }],
    method: "especes",
  })
  const detail = await seller.query(api.functions.sales.get, {
    saleId: vente.saleId as Id<"sales">,
  })
  return detail.tickets[0]!._id
}

/* ═════════════════════════════ Bagages ═══════════════════════════════════ */

describe("Vente de bagage", () => {
  it("hérite du trajet du billet et facture les frais d'enregistrement", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)

    const r = await seller.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId,
      weightKg: 12,
      senderName: "MBADINGA Paul",
    })

    expect(r.distanceKm).toBe(648)
    // Au-delà de 190 km : 700 F HT, sans taxe dans ce barème de test.
    expect(r.breakdown.registrationHt).toBe(700)
    expect(r.amounts.ttc).toBe(700)
    expect(r.tagNumber).toMatch(/^G-OWE-PV-\d{8}-000001$/)
  })

  it("facture l'excédent au-delà de la franchise", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)

    const r = await seller.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId,
      weightKg: 25,
      senderName: "MBADINGA Paul",
      franchiseKg: 10,
      excessRatePerKgHt: 150,
    })
    expect(r.breakdown.excessKg).toBe(15)
    expect(r.amounts.ttc).toBe(700 + 2250)
  })

  it("refuse un bagage au-delà de 30 kg", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)

    await expect(
      seller.mutation(api.functions.ancillaries.sellBaggage, {
        ticketId,
        weightKg: 35,
        senderName: "MBADINGA Paul",
      }),
    ).rejects.toThrow(/régime colis express/)
  })

  it("refuse le rattachement à un billet annulé", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)
    await t.run(async (c) => c.db.patch(ticketId, { status: "annule" }))

    await expect(
      seller.mutation(api.functions.ancillaries.sellBaggage, {
        ticketId,
        weightKg: 10,
        senderName: "X",
      }),
    ).rejects.toThrow(/enregistrement de bagage impossible/)
  })

  it("rattache la vente à la caisse et à la journée comptable", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)
    await seller.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId,
      weightKg: 10,
      senderName: "X",
    })

    const etat = await seller.query(api.functions.cash.mySession, {})
    // Le billet (28 100) plus le bagage (700).
    expect(etat?.salesCount).toBe(2)
    expect(etat?.totalTtc).toBe(28800)
  })

  it("apparaît au manifeste fret de la desserte", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)
    await seller.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId,
      weightKg: 10,
      senderName: "X",
    })

    const fret = await seller.query(api.functions.ancillaries.listByTrip, {
      tripId: fx.tripId,
    })
    expect(fret.baggages).toHaveLength(1)
    expect(fret.baggages[0]?.weightKg).toBe(10)
  })
})

/* ═══════════════════════════ Colis express ═══════════════════════════════ */

describe("Vente de colis express", () => {
  it("crée une expédition autonome avec une vignette par article", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)

    const r = await seller.mutation(api.functions.ancillaries.sellParcel, {
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      senderName: "NZENG Marie",
      senderPhone: "+241 06 00 00 00",
      recipientName: "OBAME Jean",
      recipientPhone: "+241 06 11 11 11",
      items: [
        { description: "Carton scellé", weightKg: 18 },
        { description: "Sac", weightKg: 7 },
      ],
    })

    expect(r.shipmentNumber).toMatch(/^C-OWE-PV-\d{8}-000001$/)
    expect(r.stickers).toHaveLength(2)
    expect(r.stickers[0]).toMatch(/^E-OWE-PV-/)
    expect(r.zone).toBe(7)
    // Palier 2 (6 500) + palier 1 (4 000).
    expect(r.amounts.ttc).toBe(10500)
  })

  it("ne se rattache à aucun billet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const r = await seller.mutation(api.functions.ancillaries.sellParcel, {
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      senderName: "A",
      senderPhone: "+241 1",
      recipientName: "B",
      recipientPhone: "+241 2",
      items: [{ description: "Colis", weightKg: 5 }],
    })
    const suivi = await t.query(api.functions.ancillaries.trackParcel, {
      shipmentNumber: r.shipmentNumber,
    })
    expect(suivi?.parcel.status).toBe("enregistre")
    expect(suivi?.items).toHaveLength(1)
  })

  it("exige les contacts téléphoniques des deux parties", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    await expect(
      seller.mutation(api.functions.ancillaries.sellParcel, {
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        senderName: "A",
        senderPhone: "  ",
        recipientName: "B",
        recipientPhone: "+241 2",
        items: [{ description: "Colis", weightKg: 5 }],
      }),
    ).rejects.toThrow(/contacts téléphoniques/)
  })

  it("refuse une expédition sans article", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    await expect(
      seller.mutation(api.functions.ancillaries.sellParcel, {
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        senderName: "A",
        senderPhone: "+241 1",
        recipientName: "B",
        recipientPhone: "+241 2",
        items: [],
      }),
    ).rejects.toThrow(/sans article/)
  })

  it("signale clairement un barème absent plutôt que d'inventer un prix", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    // Owendo → Booué tombe en zone 4, absente du barème de test.
    await expect(
      seller.mutation(api.functions.ancillaries.sellParcel, {
        originStationId: fx.owe,
        destinationStationId: fx.boo,
        senderName: "A",
        senderPhone: "+241 1",
        recipientName: "B",
        recipientPhone: "+241 2",
        items: [{ description: "Colis", weightKg: 5 }],
      }),
    ).rejects.toThrow(/Barème colis absent pour la zone 4/)
  })

  it("refuse un article au-delà du plafond du régime express", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    await expect(
      seller.mutation(api.functions.ancillaries.sellParcel, {
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        senderName: "A",
        senderPhone: "+241 1",
        recipientName: "B",
        recipientPhone: "+241 2",
        items: [{ description: "Trop lourd", weightKg: 150 }],
      }),
    ).rejects.toThrow(/limité à 100 kg/)
  })

  it("émet un événement de suivi à chaque changement de statut", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const r = await seller.mutation(api.functions.ancillaries.sellParcel, {
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      senderName: "A",
      senderPhone: "+241 1",
      recipientName: "B",
      recipientPhone: "+241 2",
      items: [{ description: "Colis", weightKg: 5 }],
    })

    await seller.mutation(api.functions.ancillaries.setParcelStatus, {
      parcelId: r.parcelId as Id<"parcels">,
      status: "en_transport",
    })

    const outbox = await t.run(async (c) =>
      c.db.query("outboxEvents").collect(),
    )
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.type).toBe("colirail_status")
    expect(outbox[0]?.status).toBe("en_attente")
    expect(outbox[0]?.payload).toContain("en_transport")
  })

  it("numérote les vignettes sans doublon sur plusieurs expéditions", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const commun = {
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      senderName: "A",
      senderPhone: "+241 1",
      recipientName: "B",
      recipientPhone: "+241 2",
    }
    const a = await seller.mutation(api.functions.ancillaries.sellParcel, {
      ...commun,
      items: [
        { description: "1", weightKg: 5 },
        { description: "2", weightKg: 5 },
      ],
    })
    const b = await seller.mutation(api.functions.ancillaries.sellParcel, {
      ...commun,
      items: [{ description: "3", weightKg: 5 }],
    })
    const toutes = [...a.stickers, ...b.stickers]
    expect(new Set(toutes).size).toBe(3)
  })
})

/* ══════════════ Transport auto accompagné et funéraire ═══════════════════ */

describe("Transport auto accompagné", () => {
  it("se rattache à un billet et facture au tonnage", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)

    const r = await seller.mutation(
      api.functions.ancillaries.sellVehicleTransport,
      {
        ticketId,
        tonnage: 1.4,
        senderName: "MBADINGA Paul",
        validUntil: Date.now() + 86_400_000,
      },
    )
    expect(r.shipmentNumber).toMatch(/^A-OWE-PV-/)
    expect(r.amounts.ttc).toBe(168000)
  })

  it("refuse un tonnage invalide", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)
    await expect(
      seller.mutation(api.functions.ancillaries.sellVehicleTransport, {
        ticketId,
        tonnage: 0,
        senderName: "X",
        validUntil: Date.now(),
      }),
    ).rejects.toThrow(RangeError)
  })
})

describe("Transport funéraire", () => {
  it("est une prestation autonome, sans billet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)

    const r = await seller.mutation(
      api.functions.ancillaries.sellFuneralTransport,
      {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        tonnage: 1,
        senderName: "Famille OBAME",
      },
    )
    expect(r.shipmentNumber).toMatch(/^F-OWE-PV-/)
    expect(r.amounts.ttc).toBe(95000)
  })

  it("refuse une desserte annulée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    await t.run(async (c) => c.db.patch(fx.tripId, { status: "annule" }))
    await expect(
      seller.mutation(api.functions.ancillaries.sellFuneralTransport, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        tonnage: 1,
        senderName: "X",
      }),
    ).rejects.toThrow(/transport impossible/)
  })
})

/* ═══════════════════ Enveloppe de vente commune ══════════════════════════ */

describe("Enveloppe de vente partagée par les cinq produits", () => {
  it("exige une caisse ouverte pour tous les produits", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const authId = "vendeur-sans-caisse"
    await t.run(async (c) =>
      c.db.insert("users", {
        authId,
        role: "vendeur_guichet",
        pointOfSaleId: fx.pos,
        identitySource: "annuaire",
        isActive: true,
      }),
    )
    const sansCaisse = t.withIdentity({ subject: authId })

    await expect(
      sansCaisse.mutation(api.functions.ancillaries.sellParcel, {
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        senderName: "A",
        senderPhone: "+241 1",
        recipientName: "B",
        recipientPhone: "+241 2",
        items: [{ description: "Colis", weightKg: 5 }],
      }),
    ).rejects.toThrow(/Aucune session de caisse ouverte/)
  })

  it("distingue les cinq produits dans les états de la journée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)

    await seller.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId,
      weightKg: 10,
      senderName: "X",
    })
    await seller.mutation(api.functions.ancillaries.sellParcel, {
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      senderName: "A",
      senderPhone: "+241 1",
      recipientName: "B",
      recipientPhone: "+241 2",
      items: [{ description: "Colis", weightKg: 5 }],
    })
    await seller.mutation(api.functions.ancillaries.sellVehicleTransport, {
      ticketId,
      tonnage: 1,
      senderName: "X",
      validUntil: Date.now() + 86_400_000,
    })
    await seller.mutation(api.functions.ancillaries.sellFuneralTransport, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      tonnage: 1,
      senderName: "X",
    })

    const ventes = await t.run(async (c) => c.db.query("sales").collect())
    const parProduit = ventes.reduce<Record<string, number>>((acc, v) => {
      acc[v.product] = (acc[v.product] ?? 0) + 1
      return acc
    }, {})
    expect(parProduit).toEqual({
      billet: 1,
      bagage: 1,
      colis: 1,
      taa: 1,
      funeraire: 1,
    })
  })

  it("numérote les ventes de façon continue tous produits confondus", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedContext(t)
    const seller = await asSeller(t, fx.pos)
    const ticketId = await sellTicket(t, fx, seller)
    await seller.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId,
      weightKg: 10,
      senderName: "X",
    })

    const ventes = await t.run(async (c) => c.db.query("sales").collect())
    const numeros = ventes.map((v) => v.number).sort()
    expect(numeros).toEqual([
      expect.stringMatching(/-000001$/),
      expect.stringMatching(/-000002$/),
    ])
  })
})
