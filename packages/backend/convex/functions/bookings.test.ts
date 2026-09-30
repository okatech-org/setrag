import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import { addDays, toServiceDate } from "../model/calendar"

/**
 * Vente en ligne — réservation, règlement, expiration.
 *
 * La garantie centrale : une réservation bloque réellement la place, et
 * l'expiration la rend au stock. Le guichet et la ligne partagent le même
 * inventaire, donc ils ne peuvent pas vendre deux fois le même siège.
 */

async function seedSellable(t: ReturnType<typeof convexTest>, seats = 4) {
  const net = await t.run(async (ctx) => {
    const pos = await ctx.db.insert("pointsOfSale", {
      code: "OWE-PV",
      name: "Owendo",
      type: "gare",
      counters: { passengers: 4, baggage: 0, parcels: 0 },
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
      rowCount: seats / 2,
      columnCount: 2,
      seatCount: seats,
      standingCapacity: 0,
      position: 1,
    })
    for (let i = 0; i < seats; i += 1) {
      await ctx.db.insert("seats", {
        coachId,
        trainId,
        label: `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "A" : "B"}`,
        row: Math.floor(i / 2) + 1,
        column: (i % 2) + 1,
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

const VOYAGEUR = {
  lastName: "MBADINGA",
  firstName: "Paul",
  gender: "M" as const,
}

const CONTACT = "+241 66 11 22 33"

async function reserve(
  t: ReturnType<typeof convexTest>,
  fx: Awaited<ReturnType<typeof seedSellable>>,
  count = 1,
  to?: Id<"stations">,
) {
  return await t.mutation(api.functions.bookings.create, {
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: to ?? fx.fcv,
    serviceClass: "DEUXIEME",
    passengers: Array.from({ length: count }, (_, i) => ({
      ...VOYAGEUR,
      firstName: `V${i}`,
    })),
    contactPhone: CONTACT,
  })
}

/* ═════════════════════════════ Devis ═════════════════════════════════════ */

describe("Devis public", () => {
  it("calcule le prix sans authentification ni réservation", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const q = await t.query(api.functions.bookings.quote, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengerCount: 2,
    })
    expect(q.distanceKm).toBe(648)
    expect(q.totalTtc).toBe(28100 * 2)
    expect(q.lines).toHaveLength(2)
    expect(q.hasAvailability).toBe(true)

    // Rien n'a été réservé.
    const ventes = await t.run(async (c) => c.db.query("sales").collect())
    expect(ventes).toHaveLength(0)
  })

  it("signale l'indisponibilité pour un groupe trop nombreux", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const q = await t.query(api.functions.bookings.quote, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengerCount: 50,
    })
    expect(q.hasAvailability).toBe(false)
  })

  it("refuse un trajet à contresens", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await expect(
      t.query(api.functions.bookings.quote, {
        tripId: fx.tripId,
        originStationId: fx.fcv,
        destinationStationId: fx.owe,
        serviceClass: "DEUXIEME",
        passengerCount: 1,
      }),
    ).rejects.toThrow(/incompatible/)
  })
})

/* ══════════════════════════ Réservation ══════════════════════════════════ */

describe("Réservation en ligne", () => {
  it("bloque la place sans la vendre", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)

    expect(r.reference).toMatch(/^V-LIGNE-\d{8}-000001$/)
    expect(r.amounts.ttc).toBe(28100)
    expect(r.amounts.received).toBe(0)

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    // Bloqué, pas vendu — et la disponibilité chute quand même.
    expect(counters.every((x) => x.sold === 0)).toBe(true)
    expect(counters.every((x) => x.held === 1)).toBe(true)
    expect(counters.every((x) => x.available === 3)).toBe(true)

    const occupancy = await t.run(async (c) =>
      c.db.query("seatOccupancy").collect(),
    )
    const occupee = occupancy.find((o) => o.heldMask !== 0)
    expect(occupee?.soldMask).toBe(0)
  })

  it("fonctionne sans compte, avec le seul téléphone", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    const vue = await t.query(api.functions.bookings.getByReference, {
      reference: r.reference,
      contactPhone: CONTACT,
    })
    expect(vue?.sale.status).toBe("en_attente_paiement")
    expect(vue?.tickets[0]?.status).toBe("en_attente")
  })

  it("protège la réservation par le contact téléphonique", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await expect(
      t.query(api.functions.bookings.getByReference, {
        reference: r.reference,
        contactPhone: "+241 00 00 00 00",
      }),
    ).resolves.toBeNull()
  })

  it("répond de même à une référence inconnue et à un mauvais téléphone", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    const inconnue = await t.query(api.functions.bookings.getByReference, {
      reference: "V-INEXISTANTE",
      contactPhone: CONTACT,
    })
    const mauvaisTelephone = await t.query(
      api.functions.bookings.getByReference,
      { reference: r.reference, contactPhone: "+241 77 99 99 99" },
    )
    const sansTelephone = await t.query(api.functions.bookings.getByReference, {
      reference: r.reference,
    })
    // Rien ne distingue une référence qui existe d'une qui n'existe pas.
    expect(inconnue).toBeNull()
    expect(mauvaisTelephone).toBeNull()
    expect(sansTelephone).toBeNull()
    // Pareil pour la variante interne de l'assistant.
    await expect(
      t.query(internal.functions.bookings.getByReferenceForActor, {
        reference: r.reference,
        contactPhone: "+241 77 99 99 99",
      }),
    ).resolves.toBeNull()
  })

  it("refuse un téléphone de contact trop court pour ouvrir la réservation", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    for (const contactPhone of ["0771234", "+241 07 12 34 56"]) {
      await expect(
        t.mutation(api.functions.bookings.create, {
          tripId: fx.tripId,
          originStationId: fx.owe,
          destinationStationId: fx.fcv,
          serviceClass: "DEUXIEME",
          passengers: [VOYAGEUR],
          contactPhone,
        }),
      ).rejects.toThrow(/Téléphone de contact incomplet.*au moins 8 chiffres/)
    }
  })

  it("n'entre pas en comptabilité tant qu'elle n'est pas réglée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    const vente = await t.run(async (c) =>
      c.db.get(r.saleId as Id<"sales">),
    )
    expect(vente?.accountingDayId).toBeUndefined()
    expect(vente?.priceLockedUntil).toBeGreaterThan(Date.now())
  })

  it("exige un contact téléphonique", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await expect(
      t.mutation(api.functions.bookings.create, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [VOYAGEUR],
        contactPhone: "  ",
      }),
    ).rejects.toThrow(/contact téléphonique est obligatoire/)
  })

  it("respecte la capacité : le stock est partagé avec le guichet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await reserve(t, fx, 4)
    await expect(reserve(t, fx, 1)).rejects.toThrow(/Places insuffisantes/)
  })

  it("libère la place pour un trajet disjoint", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await reserve(t, fx, 4, fx.boo)
    // Owendo→Booué est saturé, mais Booué→Franceville reste vendable.
    const suite = await t.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.boo,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      contactPhone: CONTACT,
    })
    expect(suite.tickets).toHaveLength(1)
  })
})

/* ═══════════════════════════ Règlement ═══════════════════════════════════ */

describe("Règlement d'une réservation", () => {
  it("transforme le blocage en vente ferme", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)

    const conf = await t.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      contactPhone: CONTACT,
      method: "airtel_money",
    })
    expect(conf.status).toBe("confirmee")
    expect(conf.amountTtc).toBe(28100)

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    expect(counters.every((x) => x.sold === 1 && x.held === 0)).toBe(true)

    const occupancy = await t.run(async (c) =>
      c.db.query("seatOccupancy").collect(),
    )
    const vendue = occupancy.find((o) => o.soldMask !== 0)
    expect(vendue?.heldMask).toBe(0)

    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    expect(billets[0]?.status).toBe("valide")
  })

  it("enregistre le règlement et entre en comptabilité", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await t.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      contactPhone: CONTACT,
      method: "moov_money",
    })

    const paiements = await t.run(async (c) => c.db.query("payments").collect())
    expect(paiements[0]?.status).toBe("confirme")
    expect(paiements[0]?.method).toBe("moov_money")

    const jour = await t.run(async (c) => c.db.query("accountingDays").first())
    expect(jour?.totalTtc).toBe(28100)
    expect(jour?.totalReceived).toBe(28100)
  })

  it("refuse un second règlement", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await t.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      contactPhone: CONTACT,
      method: "airtel_money",
    })
    await expect(
      t.mutation(api.functions.bookings.confirm, {
        reference: r.reference,
        contactPhone: CONTACT,
        method: "airtel_money",
      }),
    ).rejects.toThrow(/déjà réglée/)
  })

  it("refuse de régler après expiration du délai", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await t.run(async (c) =>
      c.db.patch(r.saleId as Id<"sales">, {
        priceLockedUntil: Date.now() - 1000,
      }),
    )
    await expect(
      t.mutation(api.functions.bookings.confirm, {
        reference: r.reference,
        contactPhone: CONTACT,
        method: "airtel_money",
      }),
    ).rejects.toThrow(/délai de règlement est dépassé/)
  })

  it("signale une référence inconnue comme un mauvais téléphone", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.functions.bookings.confirm, {
        reference: "V-INEXISTANTE",
        contactPhone: CONTACT,
        method: "airtel_money",
      }),
    ).rejects.toThrow(/Référence ou téléphone incorrect/)
  })

  it("n'accepte le règlement que du titulaire ou de qui connaît le téléphone", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await t.run((c) =>
      c.db.insert("users", {
        authId: "voyageur-tiers",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      }),
    )
    const tiers = t.withIdentity({ subject: "voyageur-tiers" })

    // La référence seule, même depuis un compte connecté, ne suffit pas.
    for (const caller of [t, tiers]) {
      for (const contactPhone of [undefined, "+241 77 99 99 99"]) {
        await expect(
          caller.mutation(api.functions.bookings.confirm, {
            reference: r.reference,
            contactPhone,
            method: "airtel_money",
          }),
        ).rejects.toThrow(/Référence ou téléphone incorrect/)
      }
    }
    const vente = await t.run((c) => c.db.get(r.saleId as Id<"sales">))
    expect(vente?.status).toBe("en_attente_paiement")

    // Le téléphone de contact, sous une autre écriture, ouvre le règlement.
    await expect(
      t.mutation(api.functions.bookings.confirm, {
        reference: r.reference,
        contactPhone: "066 11 22 33",
        method: "airtel_money",
      }),
    ).resolves.toMatchObject({ status: "confirmee" })
  })

  it("laisse le titulaire connecté régler sans téléphone, y compris via l'assistant", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const [titulaire, autre] = await t.run(async (c) => [
      await c.db.insert("users", {
        authId: "voyageur-titulaire",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      }),
      await c.db.insert("users", {
        authId: "voyageur-autre",
        role: "voyageur",
        identitySource: "local",
        isActive: true,
      }),
    ])
    const creer = () =>
      t.withIdentity({ subject: "voyageur-titulaire" }).mutation(
        api.functions.bookings.create,
        {
          tripId: fx.tripId,
          originStationId: fx.owe,
          destinationStationId: fx.fcv,
          serviceClass: "DEUXIEME",
          passengers: [VOYAGEUR],
          contactPhone: CONTACT,
        },
      )

    const web = await creer()
    await expect(
      t
        .withIdentity({ subject: "voyageur-titulaire" })
        .mutation(api.functions.bookings.confirm, {
          reference: web.reference,
          method: "visa",
        }),
    ).resolves.toMatchObject({ status: "confirmee" })

    // `confirmForActor` : l'acteur de l'assistant tient lieu de session.
    const assistant = await creer()
    await expect(
      t.mutation(internal.functions.bookings.confirmForActor, {
        userId: autre,
        reference: assistant.reference,
        method: "airtel_money",
      }),
    ).rejects.toThrow(/Référence ou téléphone incorrect/)
    await expect(
      t.mutation(internal.functions.bookings.confirmForActor, {
        userId: titulaire,
        reference: assistant.reference,
        method: "airtel_money",
      }),
    ).resolves.toMatchObject({ status: "confirmee" })

    // Un compte désactivé ne règle plus rien, même comme acteur.
    const troisieme = await creer()
    await t.run((c) => c.db.patch(titulaire, { isActive: false }))
    await expect(
      t.mutation(internal.functions.bookings.confirmForActor, {
        userId: titulaire,
        reference: troisieme.reference,
        method: "airtel_money",
      }),
    ).rejects.toThrow(/Compte désactivé/)
  })
})

/* ═════════════════════ Yield propre à un canal ═══════════════════════════ */

describe("Yield propre à un canal", () => {
  async function regleCanal(
    t: ReturnType<typeof convexTest>,
    code: "ligne" | "guichet",
    modifierPct: number,
  ) {
    await t.run(async (c) => {
      const admin = (await c.db.query("users").collect()).find(
        (user) => user.authId === "seed-admin",
      )
      await c.db.insert("pricingRules", {
        scope: "reseau",
        type: "canal",
        code,
        modifierPct,
        priority: 10,
        isActive: true,
        createdBy: admin!._id,
      })
    })
  }

  async function vendeur(
    t: ReturnType<typeof convexTest>,
    pointOfSaleId: Id<"pointsOfSale">,
  ) {
    await t.run((c) =>
      c.db.insert("users", {
        authId: "vendeur-canal",
        role: "vendeur_guichet",
        pointOfSaleId,
        identitySource: "annuaire",
        isActive: true,
      }),
    )
    const ctx = t.withIdentity({ subject: "vendeur-canal" })
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 50_000,
    })
    return ctx
  }

  const trajet = (fx: Awaited<ReturnType<typeof seedSellable>>) => ({
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME" as const,
  })

  it("fige en ligne le prix annoncé par bookings.quote sous une règle « ligne »", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await regleCanal(t, "ligne", -10)

    const devis = await t.query(api.functions.bookings.quote, {
      ...trajet(fx),
      passengerCount: 1,
    })
    const r = await reserve(t, fx)
    expect(devis.totalTtc).toBeLessThan(28100)
    expect(r.amounts.ttc).toBe(devis.totalTtc)
    expect(r.tickets[0]?.unitPriceTtc).toBe(devis.lines[0]?.unitPriceTtc)

    // Le guichet, lui, n'est pas concerné par la règle en ligne.
    const guichet = await vendeur(t, fx.pos)
    const vente = await guichet.mutation(api.functions.sales.createCounterSale, {
      ...trajet(fx),
      passengers: [VOYAGEUR],
      method: "especes",
    })
    expect(vente.amounts.ttc).toBe(28100)
  })

  it("n'applique pas en ligne une règle propre au guichet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await regleCanal(t, "guichet", 20)

    const devis = await t.query(api.functions.bookings.quote, {
      ...trajet(fx),
      passengerCount: 1,
    })
    const r = await reserve(t, fx)
    expect(devis.totalTtc).toBe(28100)
    expect(r.amounts.ttc).toBe(28100)

    const guichet = await vendeur(t, fx.pos)
    const devisGuichet = await guichet.query(
      api.functions.sales.quoteCounterSale,
      { ...trajet(fx), passengerCount: 1 },
    )
    const vente = await guichet.mutation(api.functions.sales.createCounterSale, {
      ...trajet(fx),
      passengers: [VOYAGEUR],
      method: "especes",
    })
    expect(devisGuichet.totalTtc).toBeGreaterThan(28100)
    expect(vente.amounts.ttc).toBe(devisGuichet.totalTtc)
  })
})

/* ══════════════════════════ Expiration ═══════════════════════════════════ */

describe("Expiration des réservations", () => {
  it("libère les places d'une réservation abandonnée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx, 2)

    await t.run(async (c) =>
      c.db.patch(r.saleId as Id<"sales">, {
        priceLockedUntil: Date.now() - 1000,
      }),
    )
    const bilan = await t.mutation(
      internal.functions.bookings.expireStaleHolds,
      {},
    )
    expect(bilan.released).toBe(1)
    expect(bilan.tickets).toBe(2)

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    expect(counters.every((x) => x.held === 0 && x.available === 4)).toBe(true)

    const vente = await t.run(async (c) => c.db.get(r.saleId as Id<"sales">))
    expect(vente?.status).toBe("expiree")
    const billets = await t.run(async (c) => c.db.query("tickets").collect())
    expect(billets.every((b) => b.status === "expire")).toBe(true)
  })

  it("épargne les réservations encore dans le délai", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await reserve(t, fx)
    const bilan = await t.mutation(
      internal.functions.bookings.expireStaleHolds,
      {},
    )
    expect(bilan.released).toBe(0)
  })

  it("épargne les réservations déjà réglées", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await t.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      contactPhone: CONTACT,
      method: "airtel_money",
    })
    await t.run(async (c) =>
      c.db.patch(r.saleId as Id<"sales">, {
        priceLockedUntil: Date.now() - 1000,
      }),
    )
    const bilan = await t.mutation(
      internal.functions.bookings.expireStaleHolds,
      {},
    )
    expect(bilan.released).toBe(0)
  })

  it("la place expirée redevient immédiatement réservable", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx, 4)
    await expect(reserve(t, fx, 1)).rejects.toThrow(/Places insuffisantes/)

    await t.run(async (c) =>
      c.db.patch(r.saleId as Id<"sales">, {
        priceLockedUntil: Date.now() - 1000,
      }),
    )
    await t.mutation(internal.functions.bookings.expireStaleHolds, {})

    const suite = await reserve(t, fx, 1)
    expect(suite.tickets).toHaveLength(1)
  })
})

/* ═════════════════════ Annulation par le voyageur ════════════════════════ */

describe("Annulation d'une réservation non réglée", () => {
  it("libère les places immédiatement", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx, 2)

    await t.mutation(api.functions.bookings.cancelHold, {
      reference: r.reference,
      contactPhone: CONTACT,
    })

    const counters = await t.run(async (c) =>
      c.db.query("segmentCounters").collect(),
    )
    expect(counters.every((x) => x.held === 0 && x.available === 4)).toBe(true)
    const vente = await t.run(async (c) => c.db.get(r.saleId as Id<"sales">))
    expect(vente?.status).toBe("annulee")
  })

  it("refuse d'annuler une réservation déjà réglée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await t.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      contactPhone: CONTACT,
      method: "airtel_money",
    })
    await expect(
      t.mutation(api.functions.bookings.cancelHold, {
        reference: r.reference,
        contactPhone: CONTACT,
      }),
    ).rejects.toThrow(/annulation au guichet/)
  })

  it("exige le bon contact téléphonique", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const r = await reserve(t, fx)
    await expect(
      t.mutation(api.functions.bookings.cancelHold, {
        reference: r.reference,
        contactPhone: "+241 99 99 99 99",
      }),
    ).rejects.toThrow(/Référence ou téléphone incorrect/)
    // Une référence inconnue reçoit exactement la même réponse.
    await expect(
      t.mutation(api.functions.bookings.cancelHold, {
        reference: "V-INEXISTANTE",
        contactPhone: CONTACT,
      }),
    ).rejects.toThrow(/Référence ou téléphone incorrect/)
  })
})

/* ═══════════════════════ Espace client ═══════════════════════════════════ */

describe("Espace client", () => {
  async function asTraveller(t: ReturnType<typeof convexTest>) {
    const authId = "voyageur-1"
    const ctx = t.withIdentity({ subject: authId })
    await ctx.mutation(api.functions.customers.ensureProfile, {
      firstName: "Paul",
      lastName: "MBADINGA",
      phone: CONTACT,
    })
    return ctx
  }

  it("crée le profil au premier accès, avec le rôle voyageur", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    const profil = await ctx.query(api.functions.customers.me, {})
    expect(profil?.user.role).toBe("voyageur")
    expect(profil?.user.firstName).toBe("Paul")
  })

  it("est idempotent : deux appels ne créent qu'un compte", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    await ctx.mutation(api.functions.customers.ensureProfile, {})
    const users = await t.run(async (c) => c.db.query("users").collect())
    expect(users.filter((u) => u.role === "voyageur")).toHaveLength(1)
  })

  it("rattache les réservations au compte connecté", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const ctx = await asTraveller(t)

    const r = await ctx.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      contactPhone: CONTACT,
    })
    await ctx.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      method: "airtel_money",
    })

    const mes = await ctx.query(api.functions.bookings.listMine, {})
    expect(mes).toHaveLength(1)
    expect(mes[0]?.sale.status).toBe("confirmee")

    const billets = await ctx.query(api.functions.bookings.myTickets, {})
    expect(billets).toHaveLength(1)
    expect(billets[0]?.origin?.code).toBe("OWE")
  })

  it("complète la civilité du titulaire qui voyage, sans jamais la remplacer", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const ctx = await asTraveller(t)
    const reserver = (passager: { firstName: string; lastName: string; gender: "M" | "F" }) =>
      ctx.mutation(api.functions.bookings.create, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [passager],
        contactPhone: CONTACT,
      })

    // Le titulaire ne voyage pas : son profil reste tel quel.
    const pourUnAutre = await reserver({ firstName: "Alice", lastName: "Mba", gender: "F" })
    expect(pourUnAutre.civiliteEnregistree).toBeNull()
    expect((await ctx.query(api.functions.customers.me, {}))?.user.gender).toBeUndefined()

    // Il voyage, écrit autrement (casse) : sa civilité complète le profil.
    const pourLui = await reserver({ firstName: "paul", lastName: "Mbadinga", gender: "M" })
    expect(pourLui.civiliteEnregistree).toBe("M")
    expect((await ctx.query(api.functions.customers.me, {}))?.user.gender).toBe("M")

    // Une fois connue, une réservation ne la remplace plus.
    const ensuite = await reserver({ ...VOYAGEUR, gender: "F" })
    expect(ensuite.civiliteEnregistree).toBeNull()
    expect((await ctx.query(api.functions.customers.me, {}))?.user.gender).toBe("M")

    const journal = await t.run((c) => c.db.query("auditLogs").collect())
    expect(journal.filter((l) => l.action === "profil.completer_civilite")).toHaveLength(1)
  })

  it("ne complète aucun profil pour une réservation sans compte", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    await asTraveller(t)
    // Même nom que le titulaire, mais sans session : aucun compte à compléter.
    const r = await t.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      contactPhone: CONTACT,
    })
    expect(r.civiliteEnregistree).toBeNull()
    const users = await t.run((c) => c.db.query("users").collect())
    expect(users.every((u) => u.gender === undefined)).toBe(true)
  })

  it("enregistre la civilité donnée au profil, et l'exporte", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    await ctx.mutation(api.functions.customers.updateProfile, { gender: "F" })
    const profil = await ctx.query(api.functions.customers.me, {})
    // Les autres champs restent en place.
    expect(profil?.user).toMatchObject({ gender: "F", firstName: "Paul", lastName: "MBADINGA" })
    const exporte = await ctx.query(api.functions.customers.exportMyData, {})
    expect(exporte.profile.gender).toBe("F")
  })

  it("enregistre et révoque les consentements", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)

    await ctx.mutation(api.functions.customers.grantConsent, {
      type: "cgv",
      channel: "web",
    })
    await ctx.mutation(api.functions.customers.grantConsent, {
      type: "marketing",
      channel: "web",
    })
    let actifs = await ctx.query(api.functions.customers.me, {})
    expect(actifs?.consents).toHaveLength(2)

    await ctx.mutation(api.functions.customers.revokeConsent, {
      type: "marketing",
    })
    actifs = await ctx.query(api.functions.customers.me, {})
    expect(actifs?.consents).toHaveLength(1)
    expect(actifs?.consents[0]?.type).toBe("cgv")
  })

  it("ne duplique pas un consentement de même version", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    const a = await ctx.mutation(api.functions.customers.grantConsent, {
      type: "cgv",
      channel: "web",
    })
    const b = await ctx.mutation(api.functions.customers.grantConsent, {
      type: "cgv",
      channel: "mobile",
    })
    expect(b).toBe(a)
  })

  it("refuse de révoquer les conditions générales", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    await ctx.mutation(api.functions.customers.grantConsent, {
      type: "cgv",
      channel: "web",
    })
    await expect(
      ctx.mutation(api.functions.customers.revokeConsent, { type: "cgv" }),
    ).rejects.toThrow(/ne peuvent pas être révoquées/)
  })

  it("exporte les données personnelles du voyageur", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const ctx = await asTraveller(t)
    const r = await ctx.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      contactPhone: CONTACT,
    })
    await ctx.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      method: "airtel_money",
    })

    const exportData = await ctx.query(api.functions.customers.exportMyData, {})
    expect(exportData.profile.firstName).toBe("Paul")
    expect(exportData.sales).toHaveLength(1)
    expect(exportData.tickets).toHaveLength(1)
  })

  it("anonymise le compte sans détruire la comptabilité", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const ctx = await asTraveller(t)
    const r = await ctx.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      contactPhone: CONTACT,
    })
    await ctx.mutation(api.functions.bookings.confirm, {
      reference: r.reference,
      method: "airtel_money",
    })

    const bilan = await ctx.mutation(
      api.functions.customers.deleteMyAccount,
      { confirmation: "SUPPRIMER" },
    )
    expect(bilan.anonymized).toBe(true)

    // La vente survit : obligation de conservation comptable.
    const ventes = await t.run(async (c) => c.db.query("sales").collect())
    expect(ventes).toHaveLength(1)
    const users = await t.run(async (c) => c.db.query("users").collect())
    const anonyme = users.find((u) => u.lastName === "supprimé")
    expect(anonyme?.phone).toBeUndefined()
    expect(anonyme?.isActive).toBe(false)
  })

  it("détache l'identité supprimée : pas de profil qui renaît, identité effacée", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    await ctx.mutation(api.functions.customers.deleteMyAccount, {
      confirmation: "SUPPRIMER",
    })

    // Le jeton encore valide ne retrouve plus le profil…
    await expect(ctx.query(api.functions.customers.me, {})).resolves.toBeNull()
    // …et ne peut pas en recréer un pour l'identité effacée.
    await expect(
      ctx.mutation(api.functions.customers.ensureProfile, {})
    ).rejects.toThrow(/Session expirée/)

    const etat = await t.run(async (c) => ({
      users: await c.db.query("users").collect(),
      identites: await c.db.query("identitesSupprimees").collect(),
      planifiees: await c.db.system.query("_scheduled_functions").collect(),
    }))
    expect(etat.users.every((u) => u.authId.startsWith("supprime:"))).toBe(true)
    expect(etat.identites).toHaveLength(1)
    expect(etat.planifiees.map((f) => f.name)).toContain(
      "betterAuth/effacement:effacerIdentite"
    )
  })

  it("refuse la suppression avec une réservation en cours", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedSellable(t)
    const ctx = await asTraveller(t)
    await ctx.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [VOYAGEUR],
      contactPhone: CONTACT,
    })
    await expect(
      ctx.mutation(api.functions.customers.deleteMyAccount, {
        confirmation: "SUPPRIMER",
      }),
    ).rejects.toThrow(/réservation\(s\) en cours/)
  })

  it("exige la confirmation littérale pour supprimer", async () => {
    const t = convexTest(schema, modules)
    const ctx = await asTraveller(t)
    await expect(
      ctx.mutation(api.functions.customers.deleteMyAccount, {
        confirmation: "oui",
      }),
    ).rejects.toThrow(/Confirmation invalide/)
  })
})
