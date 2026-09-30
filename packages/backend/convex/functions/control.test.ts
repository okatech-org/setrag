import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"
import {
  BARCODE_PREFIX,
  decodeBase45,
  encodeBase45,
  parseBarcode,
  serializePayload,
} from "../model/barcode"
import { verifyBarcode } from "../lib/signature"

/**
 * Application contrôleur — manifeste, contrôles, vente à bord, PV, incidents.
 *
 * La garantie centrale de ce module est l'IDEMPOTENCE : le terminal travaille
 * hors ligne et rejoue son lot à la reconnexion. Un lot renvoyé deux fois
 * après une coupure ne doit rien dupliquer.
 */

async function seedTrip(t: ReturnType<typeof convexTest>) {
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

  const serviceDate = addDays(toServiceDate(Date.now()), 2)
  const adminCtx = t.withIdentity({ subject: "seed-admin" })
  const bookletId = await adminCtx.mutation(api.functions.booklets.create, {
    label: "Livret",
    validFrom: Date.parse(`${serviceDate}T00:00:00Z`),
    // Deux jours de validité : certains contrôles ont besoin d'une seconde
    // circulation pour vérifier qu'un titre ne vaut que pour la sienne.
    validUntil: Date.parse(`${addDays(serviceDate, 1)}T23:00:00Z`),
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
    }
  )
  await adminCtx.mutation(api.functions.booklets.submit, { bookletId })
  await adminCtx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId,
    serviceDate,
  })
  return {
    ...net,
    tripId: rapport.tripId as Id<"trips">,
    scheduleId,
    serviceDate,
  }
}

async function asAgent(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  posId: Id<"pointsOfSale">,
  suffix = ""
) {
  const authId = `${role}${suffix}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  return { ctx: t.withIdentity({ subject: authId }), userId }
}

/** Vend un billet en ligne et le règle, pour avoir un titre à contrôler. */
async function issueTicket(
  t: ReturnType<typeof convexTest>,
  fx: Awaited<ReturnType<typeof seedTrip>>
) {
  const r = await t.mutation(api.functions.bookings.create, {
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME",
    passengers: [{ lastName: "MBADINGA", firstName: "Paul", gender: "M" }],
    contactPhone: "+241 66 11 22 33",
  })
  await t.mutation(api.functions.bookings.confirm, {
    reference: r.reference,
    contactPhone: "+241 66 11 22 33",
    method: "airtel_money",
  })
  const vue = await t.query(api.functions.bookings.getByReference, {
    reference: r.reference,
    contactPhone: "+241 66 11 22 33",
  })
  return vue!.tickets[0]!
}

/* ═══════════════════════════ Manifeste ═══════════════════════════════════ */

describe("Manifeste embarqué", () => {
  it("emporte les arrêts, les titres et le barème des amendes", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const m = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
    })
    expect(m.stops).toHaveLength(3)
    expect(m.stops[0]?.code).toBe("OWE")
    expect(m.tickets).toHaveLength(1)
    expect(m.tickets[0]?.status).toBe("valide")
    expect(m.penalties.length).toBeGreaterThan(0)
    expect(m.generatedAt).toBeGreaterThan(0)
  })

  it("emporte aussi les titres annulés, pour pouvoir les refuser à bord", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    await t.run(async (c) => c.db.patch(billet._id, { status: "annule" }))

    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    const m = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
    })
    expect(m.tickets).toHaveLength(1)
    expect(m.tickets[0]?.status).toBe("annule")
  })

  it("est refusé à un rôle non habilité", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "comptable", fx.pos)
    await expect(
      ctx.query(api.functions.control.manifest, { tripId: fx.tripId })
    ).rejects.toThrow(/Accès refusé/)
  })

  it("porte la voiture de chaque titre, déduite de sa place", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })
    // Vendu au guichet : le titre a une place mais aucun repère de voiture.
    await ctx.mutation(api.functions.sales.createCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "NZE", firstName: "Antoinette", gender: "F" }],
      method: "especes",
    })
    const stockes = await t.run(async (c) => c.db.query("tickets").collect())
    expect(stockes.every((s) => s.coachLabel === undefined)).toBe(true)

    const m = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
    })
    expect(m.tickets).toHaveLength(2)
    expect(m.tickets.map((x) => x.coachLabel)).toEqual(["V1", "V1"])

    const lot = await ctx.query(api.functions.control.manifestTickets, {
      tripId: fx.tripId,
    })
    expect(lot.tickets.every((x) => x.coachLabel === "V1")).toBe(true)

    // Le titre lui-même n'est pas réécrit : la voiture se lit, elle ne se
    // recopie pas.
    const relu = await t.run(async (c) => c.db.get(billet._id))
    expect(relu?.coachLabel).toBeUndefined()
  })

  it("embarque la composition du train, voitures dans l'ordre de la rame", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    await t.run(async (c) => {
      const vip = await c.db.insert("coaches", {
        trainId: fx.trainId,
        label: "V0",
        serviceClass: "VIP",
        rowCount: 1,
        columnCount: 2,
        seatCount: 2,
        standingCapacity: 0,
        position: 0,
      })
      await c.db.insert("seats", {
        coachId: vip,
        trainId: fx.trainId,
        label: "1B",
        row: 1,
        column: 2,
        isActive: false,
      })
      await c.db.insert("seats", {
        coachId: vip,
        trainId: fx.trainId,
        label: "1A",
        row: 1,
        column: 1,
        isActive: true,
      })
    })
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const m = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
      includeTickets: false,
    })
    expect(m.composition.map((c) => c.label)).toEqual(["V0", "V1"])
    expect(m.composition[1]).toMatchObject({
      serviceClass: "DEUXIEME",
      rowCount: 2,
      columnCount: 2,
      seatCount: 4,
      standingCapacity: 0,
    })
    expect(m.composition[1]!.seats.map((s) => s.label)).toEqual([
      "1A",
      "1B",
      "2A",
      "2B",
    ])
    // Une place retirée du service n'apparaît pas au plan.
    expect(m.composition[0]!.seats).toEqual([{ label: "1A", row: 1, column: 1 }])
  })
})

/* ═══════════════════ Vérification du code-barres ═════════════════════════ */

describe("Vérification du code-barres", () => {
  it("émet un titre dont le code-barres est authentique et bien portant", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    expect(billet.barcodePayload).toMatch(/^SETRAG1:/)
    const check = verifyBarcode(billet.barcodePayload!)
    expect(check.authentic).toBe(true)
    expect(check.payload?.ref).toBe(billet.number)
    expect(check.payload?.trip).toBe(fx.tripId)
    expect(check.payload?.from).toBe(0)
    expect(check.payload?.to).toBe(2)
    expect(check.payload?.date).toBe(fx.serviceDate)
  })

  it("transmet la clé publique pour rendre le contrôle hors ligne sûr", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const m = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
    })
    expect(m.signing.publicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(m.signing.keyVersion).toBe(1)
    // Les tests tournent sans clé configurée : le drapeau doit le dire.
    expect(m.signing.isDemoKey).toBe(true)
  })

  it("valide un titre présenté au bon endroit", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: billet.barcodePayload!,
      tripId: fx.tripId,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("valide")
    expect(r.ticket?.number).toBe(billet.number)
    expect(r.ticket?.passenger.lastName).toBe("MBADINGA")
  })

  it("démasque une contrefaçon : charge utile modifiée, signature recopiée", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    // Le fraudeur relit un code légitime et s'attribue la première classe.
    const brut = decodeBase45(
      billet.barcodePayload!.slice(BARCODE_PREFIX.length)
    )
    const { payload } = parseBarcode(billet.barcodePayload!)
    const falsifie = serializePayload({ ...payload, cls: "PREMIERE" })
    const joint = new Uint8Array(falsifie.length + 64)
    joint.set(falsifie, 0)
    joint.set(brut.subarray(brut.length - 64), falsifie.length)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: BARCODE_PREFIX + encodeBase45(joint),
      tripId: fx.tripId,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("contrefait")
  })

  it("distingue un code étranger d'une contrefaçon", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: "HC1:NCFOXN%TS3DH",
      tripId: fx.tripId,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("illisible")
    expect(r.reason).toMatch(/étranger/)
  })

  it("refuse un titre émis pour une autre desserte", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const autre = await t.mutation(internal.functions.trips.generateOne, {
      scheduleId: fx.scheduleId,
      serviceDate: addDays(fx.serviceDate, 1),
    })
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: billet.barcodePayload!,
      tripId: autre.tripId as Id<"trips">,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("mauvaise_desserte")
  })

  it("refuse un titre au-delà de sa gare de descente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: billet.barcodePayload!,
      tripId: fx.tripId,
      currentStopIndex: 2,
    })
    expect(r.verdict).toBe("hors_segment")
  })

  it("signale un titre annulé plutôt que de le valider", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    await t.run(async (c) => c.db.patch(billet._id, { status: "annule" }))
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: billet.barcodePayload!,
      tripId: fx.tripId,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("annule")
  })

  it("signale un titre déjà contrôlé", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    await t.run(async (c) =>
      c.db.patch(billet._id, { status: "utilise", usedAt: Date.now() })
    )
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: billet.barcodePayload!,
      tripId: fx.tripId,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("deja_controle")
  })

  it("refuse un titre réservé mais non réglé", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    // Réservation laissée en attente : le code-barres existe déjà, mais le
    // titre n'ouvre aucun droit tant que la vente n'est pas encaissée.
    const r0 = await t.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "ONDO", firstName: "Alice", gender: "F" }],
      contactPhone: "+241 66 44 55 66",
    })
    const vue = await t.query(api.functions.bookings.getByReference, {
      reference: r0.reference,
      contactPhone: "+241 66 44 55 66",
    })
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.query(api.functions.control.verifyTicket, {
      barcode: vue!.tickets[0]!.barcodePayload!,
      tripId: fx.tripId,
      currentStopIndex: 1,
    })
    expect(r.verdict).toBe("non_paye")
  })

  it("est refusée à un rôle non habilité", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "comptable", fx.pos)

    await expect(
      ctx.query(api.functions.control.verifyTicket, {
        barcode: billet.barcodePayload!,
        tripId: fx.tripId,
        currentStopIndex: 1,
      })
    ).rejects.toThrow(/Accès refusé/)
  })
})

/* ═════════════════════ Synchronisation des contrôles ═════════════════════ */

describe("Synchronisation des contrôles", () => {
  it("enregistre un lot et marque les titres utilisés", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.mutation(api.functions.control.syncScans, {
      scans: [
        {
          clientScanId: "term-1-scan-1",
          tripId: fx.tripId,
          ticketId: billet._id,
          result: "valide",
          stopIndex: 0,
          scannedAt: Date.now(),
          offline: true,
        },
      ],
    })
    expect(r.created).toBe(1)
    expect(r.duplicates).toBe(0)

    const apres = await t.run(async (c) => c.db.get(billet._id))
    expect(apres?.status).toBe("utilise")
    expect(apres?.usedAt).toBeGreaterThan(0)
  })

  it("est idempotent : rejouer le lot ne duplique rien", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const lot = {
      scans: [
        {
          clientScanId: "term-1-scan-1",
          tripId: fx.tripId,
          ticketId: billet._id,
          result: "valide" as const,
          scannedAt: Date.now(),
          offline: true,
        },
      ],
    }
    await ctx.mutation(api.functions.control.syncScans, lot)
    const second = await ctx.mutation(api.functions.control.syncScans, lot)

    expect(second.created).toBe(0)
    expect(second.duplicates).toBe(1)
    const scans = await t.run(async (c) => c.db.query("ticketScans").collect())
    expect(scans).toHaveLength(1)
  })

  it("signale un conflit quand deux terminaux valident le même titre", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const a = await asAgent(t, "controleur_train", fx.pos, "-a")
    const b = await asAgent(t, "controleur_train", fx.pos, "-b")

    await a.ctx.mutation(api.functions.control.syncScans, {
      scans: [
        {
          clientScanId: "term-a-1",
          tripId: fx.tripId,
          ticketId: billet._id,
          result: "valide",
          scannedAt: Date.now(),
          offline: true,
        },
      ],
    })
    const second = await b.ctx.mutation(api.functions.control.syncScans, {
      scans: [
        {
          clientScanId: "term-b-1",
          tripId: fx.tripId,
          ticketId: billet._id,
          result: "valide",
          scannedAt: Date.now(),
          offline: true,
        },
      ],
    })

    // Le conflit est signalé, pas rejeté : l'arbitrage est humain.
    expect(second.created).toBe(1)
    expect(second.conflicts).toBe(1)

    const conflits = await a.ctx.query(api.functions.control.listConflicts, {})
    expect(conflits).toHaveLength(1)
    expect(conflits[0]?.allScans).toHaveLength(2)
  })

  it("permet à un superviseur d'arbitrer un conflit", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const a = await asAgent(t, "controleur_train", fx.pos, "-a")
    const b = await asAgent(t, "controleur_train", fx.pos, "-b")
    const chef = await asAgent(t, "chef_gare", fx.pos)

    for (const [agent, id] of [
      [a, "s-a"],
      [b, "s-b"],
    ] as const) {
      await agent.ctx.mutation(api.functions.control.syncScans, {
        scans: [
          {
            clientScanId: id,
            tripId: fx.tripId,
            ticketId: billet._id,
            result: "valide",
            scannedAt: Date.now(),
            offline: true,
          },
        ],
      })
    }

    const conflits = await chef.ctx.query(
      api.functions.control.listConflicts,
      {}
    )
    await chef.ctx.mutation(api.functions.control.resolveConflict, {
      scanId: conflits[0]!.scan._id,
      accept: true,
      note: "Second contrôle légitime après changement d'équipe",
    })
    const restants = await chef.ctx.query(
      api.functions.control.listConflicts,
      {}
    )
    expect(restants).toHaveLength(0)
  })

  it("enregistre les contrôles invalides avec leur motif", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    await ctx.mutation(api.functions.control.syncScans, {
      scans: [
        {
          clientScanId: "invalide-1",
          tripId: fx.tripId,
          result: "signature_invalide",
          scannedAt: Date.now(),
          offline: true,
        },
        {
          clientScanId: "invalide-2",
          tripId: fx.tripId,
          result: "hors_segment",
          scannedAt: Date.now(),
          offline: true,
        },
      ],
    })
    const mes = await ctx.query(api.functions.control.myScans, {
      tripId: fx.tripId,
    })
    expect(mes).toHaveLength(2)
    expect(mes.map((s) => s.result).sort()).toEqual([
      "hors_segment",
      "signature_invalide",
    ])
  })
})

/* ══════════════════════════ Vente à bord ═════════════════════════════════ */

describe("Vente à bord", () => {
  it("vend un titre sans caisse de guichet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    // Le contrôleur ouvre sa propre caisse embarquée.
    await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })

    const r = await ctx.mutation(api.functions.control.sellOnboard, {
      tripId: fx.tripId,
      originStationId: fx.boo,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "OBAME", firstName: "Jean", gender: "M" }],
      deviceId: "TERM-01",
    })
    expect(r.tickets).toHaveLength(1)

    const ventes = await t.run(async (c) => c.db.query("sales").collect())
    expect(ventes[0]?.channel).toBe("bord")
    expect(ventes[0]?.status).toBe("confirmee")
  })

  it("respecte la capacité, comme au guichet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })

    await ctx.mutation(api.functions.control.sellOnboard, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: Array.from({ length: 4 }, (_, i) => ({
        lastName: "X",
        firstName: `V${i}`,
        gender: "M" as const,
      })),
    })
    await expect(
      ctx.mutation(api.functions.control.sellOnboard, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [{ lastName: "Y", firstName: "Z", gender: "M" }],
      })
    ).rejects.toThrow(/Places insuffisantes/)
  })
})

/* ═══════════════════════ Procès-verbaux ══════════════════════════════════ */

describe("Procès-verbaux", () => {
  it("enregistre un lot et numérote en continu", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.mutation(api.functions.control.syncPenalties, {
      penalties: [
        {
          clientId: "pv-1",
          tripId: fx.tripId,
          offender: { lastName: "MOUSSAVOU", declined: false },
          reason: "sans_titre",
          amountXaf: 25000,
          paidOnBoard: false,
          issuedAt: Date.now(),
          offline: true,
        },
        {
          clientId: "pv-2",
          tripId: fx.tripId,
          offender: { declined: true },
          reason: "titre_invalide",
          amountXaf: 15000,
          paidOnBoard: true,
          issuedAt: Date.now(),
          offline: true,
        },
      ],
    })
    expect(r.created).toBe(2)
    expect(r.numbers).toEqual(["PV-000001", "PV-000002"])

    const liste = await ctx.query(api.functions.control.listPenalties, {})
    expect(liste).toHaveLength(2)
    // Le second a été encaissé à bord.
    const paye = liste.find((p) => p.penalty.status === "paye")
    expect(paye?.penalty.paymentId).toBeDefined()
  })

  it("est idempotent par identifiant client", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    const lot = {
      penalties: [
        {
          clientId: "pv-1",
          tripId: fx.tripId,
          offender: { declined: true },
          reason: "sans_titre" as const,
          amountXaf: 25000,
          paidOnBoard: false,
          issuedAt: Date.now(),
          offline: true,
        },
      ],
    }
    await ctx.mutation(api.functions.control.syncPenalties, lot)
    const second = await ctx.mutation(api.functions.control.syncPenalties, lot)
    expect(second.created).toBe(0)
    expect(second.duplicates).toBe(1)
  })

  it("permet de contester puis d'annuler avec motif", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    const chef = await asAgent(t, "chef_gare", fx.pos)

    await ctx.mutation(api.functions.control.syncPenalties, {
      penalties: [
        {
          clientId: "pv-1",
          tripId: fx.tripId,
          offender: { lastName: "NDONG", declined: false },
          reason: "classe_superieure",
          amountXaf: 8000,
          paidOnBoard: false,
          issuedAt: Date.now(),
          offline: false,
        },
      ],
    })
    const liste = await chef.ctx.query(api.functions.control.listPenalties, {})
    const pvId = liste[0]!.penalty._id

    await chef.ctx.mutation(api.functions.control.setPenaltyStatus, {
      penaltyId: pvId,
      status: "conteste",
      resolutionNote: "Le voyageur conteste les faits.",
    })
    await expect(
      chef.ctx.mutation(api.functions.control.setPenaltyStatus, {
        penaltyId: pvId,
        status: "annule",
      })
    ).rejects.toThrow(/motif est obligatoire/)

    await chef.ctx.mutation(api.functions.control.setPenaltyStatus, {
      penaltyId: pvId,
      status: "annule",
      resolutionNote: "Contestation fondée : le voyageur avait bien un titre",
    })
    const apres = await t.run(async (c) => c.db.get(pvId))
    expect(apres?.status).toBe("annule")
    expect(apres?.resolutionNote).toContain("fondée")
    const detail = await chef.ctx.query(api.functions.control.getPenalty, {
      penaltyId: pvId,
    })
    expect(detail?.penalty.number).toBe("PV-000001")
    expect(detail?.trip?.trainNumber).toBe("TR-201")
    expect(detail?.resolver?._id).toBeDefined()
    await expect(
      chef.ctx.mutation(api.functions.control.setPenaltyStatus, {
        penaltyId: pvId,
        status: "emis",
        resolutionNote: "Tentative de retour en arrière",
      })
    ).rejects.toThrow(/annule → emis/)
  })

  it("refuse un montant d'amende négatif", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await expect(
      ctx.mutation(api.functions.control.syncPenalties, {
        penalties: [
          {
            clientId: "pv-x",
            tripId: fx.tripId,
            offender: { declined: true },
            reason: "autre",
            amountXaf: -100,
            paidOnBoard: false,
            issuedAt: Date.now(),
            offline: false,
          },
        ],
      })
    ).rejects.toThrow(/Montant d'amende invalide/)
  })
})

/* ═════════════════════════════ Incidents ═════════════════════════════════ */

describe("Signalements d'incident", () => {
  it("enregistre un lot d'incidents", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const r = await ctx.mutation(api.functions.control.syncIncidents, {
      incidents: [
        {
          clientId: "inc-1",
          tripId: fx.tripId,
          category: "technique",
          severity: "important",
          description: "Climatisation hors service en voiture 4",
          reportedAt: Date.now(),
          offline: true,
        },
      ],
    })
    expect(r.created).toBe(1)
    const liste = await ctx.query(api.functions.control.listIncidents, {})
    expect(liste).toHaveLength(1)
    expect(liste[0]?.incident.status).toBe("ouvert")
  })

  it("alerte les superviseurs sur un incident critique", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await asAgent(t, "chef_gare", fx.pos)

    const r = await ctx.mutation(api.functions.control.syncIncidents, {
      incidents: [
        {
          clientId: "inc-crit",
          tripId: fx.tripId,
          category: "securite",
          severity: "critique",
          description: "Altercation entre voyageurs en voiture 2",
          reportedAt: Date.now(),
          offline: false,
        },
      ],
    })
    expect(r.critical).toBe(1)

    const notifs = await t.run(async (c) =>
      c.db.query("notifications").collect()
    )
    expect(notifs).toHaveLength(1)
    expect(notifs[0]?.title).toContain("critique")
  })

  it("est idempotent par identifiant client", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    const lot = {
      incidents: [
        {
          clientId: "inc-1",
          tripId: fx.tripId,
          category: "autre" as const,
          severity: "information" as const,
          description: "Retard de dix minutes au départ",
          reportedAt: Date.now(),
          offline: true,
        },
      ],
    }
    await ctx.mutation(api.functions.control.syncIncidents, lot)
    const second = await ctx.mutation(api.functions.control.syncIncidents, lot)
    expect(second.created).toBe(0)
    expect(second.duplicates).toBe(1)
  })

  it("exige une description", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await expect(
      ctx.mutation(api.functions.control.syncIncidents, {
        incidents: [
          {
            clientId: "inc-vide",
            tripId: fx.tripId,
            category: "autre",
            severity: "information",
            description: "   ",
            reportedAt: Date.now(),
            offline: false,
          },
        ],
      })
    ).rejects.toThrow(/description d'un incident est obligatoire/)
  })

  it("exige une note pour clore un incident", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    const chef = await asAgent(t, "chef_gare", fx.pos)
    await ctx.mutation(api.functions.control.syncIncidents, {
      incidents: [
        {
          clientId: "inc-1",
          tripId: fx.tripId,
          category: "technique",
          severity: "important",
          description: "Porte bloquée",
          reportedAt: Date.now(),
          offline: false,
        },
      ],
    })
    const liste = await chef.ctx.query(api.functions.control.listIncidents, {})
    const id = liste[0]!.incident._id
    const detail = await chef.ctx.query(api.functions.control.getIncident, {
      incidentId: id,
    })
    expect(detail?.incident.description).toBe("Porte bloquée")
    expect(detail?.trip?.trainNumber).toBe("TR-201")
    expect(detail?.reporter?._id).toBeDefined()

    await expect(
      chef.ctx.mutation(api.functions.control.setIncidentStatus, {
        incidentId: id,
        status: "resolu",
      })
    ).rejects.toThrow(/note de résolution est obligatoire/)

    await chef.ctx.mutation(api.functions.control.setIncidentStatus, {
      incidentId: id,
      status: "resolu",
      resolutionNote: "Porte réparée au terminus",
    })
    const apres = await t.run(async (c) => c.db.get(id))
    expect(apres?.status).toBe("resolu")
    expect(apres?.resolvedAt).toBeGreaterThan(0)

    await expect(
      chef.ctx.mutation(api.functions.control.setIncidentStatus, {
        incidentId: id,
        status: "en_cours",
      })
    ).rejects.toThrow(/note est obligatoire/)
    await chef.ctx.mutation(api.functions.control.setIncidentStatus, {
      incidentId: id,
      status: "en_cours",
      resolutionNote: "Le défaut est réapparu lors du contrôle de sortie",
    })
    const rouvert = await t.run(async (c) => c.db.get(id))
    expect(rouvert).toMatchObject({ status: "en_cours" })
    expect(rouvert?.resolvedAt).toBeUndefined()
    expect(rouvert?.resolvedBy).toBeUndefined()
    expect(rouvert?.resolutionNote).toBeUndefined()

    await expect(
      chef.ctx.mutation(api.functions.control.setIncidentStatus, {
        incidentId: id,
        status: "ouvert",
        resolutionNote: "Retour arrière interdit",
      })
    ).rejects.toThrow(/en_cours → ouvert/)
  })
})

/* ═════════════════════ Embarquement hors ligne ═══════════════════════════ */

describe("Préparation du terminal", () => {
  it("embarque le barème kilométrique et sait s'en passer d'aucun", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const m = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
    })
    expect(m.fare).not.toBeNull()
    expect(m.fare?.roundingBasis).toBe("TTC")
    expect(m.fare?.bases).toContainEqual({
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 47.51,
      longDistanceRate: 43.42,
    })
  })

  it("annonce le nombre de titres avant de les envoyer", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const entete = await ctx.query(api.functions.control.manifest, {
      tripId: fx.tripId,
      includeTickets: false,
    })
    expect(entete.tickets).toEqual([])
    expect(entete.ticketCount).toBe(1)
  })

  it("télécharge les titres par lots reprenables", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    await issueTicket(t, fx)
    await issueTicket(t, fx)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const lot1 = await ctx.query(api.functions.control.manifestTickets, {
      tripId: fx.tripId,
      pageSize: 1,
    })
    expect(lot1.tickets).toHaveLength(1)
    expect(lot1.isDone).toBe(false)

    // Une reprise repart du curseur reçu, sans réémettre le lot confirmé.
    const lot2 = await ctx.query(api.functions.control.manifestTickets, {
      tripId: fx.tripId,
      pageSize: 1,
      cursor: lot1.cursor,
    })
    expect(lot2.tickets).toHaveLength(1)
    expect(lot2.tickets[0]!.number).not.toBe(lot1.tickets[0]!.number)
  })

  it("propose au contrôleur les dessertes de sa fenêtre de service", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const dessertes = await ctx.query(api.functions.control.assignedTrips, {})
    const notre = dessertes.find((d) => d.id === fx.tripId)
    expect(notre).toBeDefined()
    expect(notre!.trainNumber).toBe("TR-201")
    expect(notre!.distanceKm).toBe(648)
  })

  it("masque un doublon vide et conserve la circulation qui porte les titres", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    await issueTicket(t, fx)
    const original = await t.run(async (dbCtx) => dbCtx.db.get(fx.tripId))
    if (!original) throw new Error("Desserte de test introuvable")

    const duplicateId = await t.run(async (dbCtx) =>
      dbCtx.db.insert("trips", {
        bookletId: original.bookletId,
        scheduleId: original.scheduleId,
        trainId: original.trainId,
        trainNumber: original.trainNumber,
        trainType: original.trainType,
        serviceDate: original.serviceDate,
        departureAt: original.departureAt,
        arrivalAt: original.arrivalAt,
        originStationId: original.originStationId,
        destinationStationId: original.destinationStationId,
        status: original.status,
        delayMinutes: original.delayMinutes,
        segmentCount: original.segmentCount,
        isOpenForSale: original.isOpenForSale,
      })
    )
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)

    const dessertes = await ctx.query(api.functions.control.assignedTrips, {})
    const mêmeDépart = dessertes.filter(
      (trip) =>
        trip.trainNumber === original.trainNumber &&
        trip.departureAt === original.departureAt
    )

    expect(mêmeDépart).toHaveLength(1)
    expect(mêmeDépart[0]?.id).toBe(fx.tripId)
    expect(mêmeDépart[0]?.id).not.toBe(duplicateId)
    expect(mêmeDépart[0]?.expectedPassengers).toBe(1)
  })
})

/* ═════════════════════ Ventes à bord rejouées ════════════════════════════ */

describe("Vente à bord hors ligne", () => {
  it("ne vend qu'une fois un lot rejoué après coupure", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })

    const envoi = {
      clientSaleId: "term-042-0001",
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.boo,
      serviceClass: "DEUXIEME" as const,
      passengers: [
        { lastName: "NGUEMA", firstName: "Serge", gender: "M" as const },
      ],
      quotedXaf: 14_000,
      method: "especes" as const,
      deviceId: "term-042",
    }

    const premier = await ctx.mutation(api.functions.control.syncSale, envoi)
    expect(premier.status).toBe("cree")
    expect(premier.ticketNumbers).toHaveLength(1)

    const rejeu = await ctx.mutation(api.functions.control.syncSale, envoi)
    expect(rejeu.status).toBe("doublon")
    expect(rejeu.saleNumber).toBe(premier.saleNumber)
    expect(rejeu.ticketNumbers).toEqual(premier.ticketNumbers)

    const ventes = await t.run(async (c) =>
      c.db
        .query("sales")
        .filter((q) => q.eq(q.field("clientSaleId"), "term-042-0001"))
        .collect()
    )
    expect(ventes).toHaveLength(1)
  })

  it("rend le prix serveur en regard du prix annoncé à bord", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, "controleur_train", fx.pos)
    await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 0 })

    const r = await ctx.mutation(api.functions.control.syncSale, {
      clientSaleId: "term-042-0002",
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.boo,
      serviceClass: "DEUXIEME",
      passengers: [
        { lastName: "OBAME", firstName: "Marie", gender: "F" as const },
      ],
      // Montant volontairement faux : l'écart doit être visible, pas absorbé.
      quotedXaf: 1,
      method: "especes",
    })
    expect(r.quotedXaf).toBe(1)
    expect(r.serverXaf).toBeGreaterThan(1)
  })
})

/* ═════════════════════ Signalement d'un conflit ══════════════════════════ */

describe("Conflits", () => {
  it("laisse le contrôleur alerter sans réécrire le contrôle", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const a = await asAgent(t, "controleur_train", fx.pos, "-a")
    const b = await asAgent(t, "controleur_train", fx.pos, "-b")
    await t.run(async (c) => {
      c.db.insert("users", {
        authId: "chef-alerte",
        role: "chef_gare",
        identitySource: "annuaire",
        isActive: true,
      })
    })

    const commun = {
      tripId: fx.tripId,
      ticketId: billet._id,
      result: "valide" as const,
      stopIndex: 0,
      offline: true,
    }
    await a.ctx.mutation(api.functions.control.syncScans, {
      scans: [{ ...commun, clientScanId: "a-1", scannedAt: Date.now() }],
    })
    const collision = await b.ctx.mutation(api.functions.control.syncScans, {
      scans: [{ ...commun, clientScanId: "b-1", scannedAt: Date.now() + 1000 }],
    })
    expect(collision.conflicts).toBe(1)

    const scanId = collision.conflictIds[0]!
    const r = await b.ctx.mutation(api.functions.control.flagConflict, {
      scanId,
      note: "Deux personnes présentent le même titre",
    })
    expect(r.notified).toBe(1)

    // Le contrôle reste en conflit : seul le superviseur peut le clore.
    const apres = await t.run(async (c) => c.db.get(scanId))
    expect(apres?.conflict).toBe(true)
  })
})

describe("Synthèse agrégée des incidents et procès-verbaux", () => {
  afterEach(() => vi.unstubAllEnvs())

  const MARS_2026 = { from: "2026-03-01", to: "2026-03-31" }
  const EN_MARS = Date.parse("2026-03-15T10:00:00Z")
  const EN_AVRIL = Date.parse("2026-04-02T10:00:00Z")

  async function fixture(t: ReturnType<typeof convexTest>) {
    const net = await seedTrip(t)
    const { userId: reporterId } = await asAgent(t, "controleur_train", net.pos)
    await t.run(async (ctx) => {
      await ctx.db.insert("moduleActivations", {
        moduleCode: "securite",
        environment: "test",
        isEnabled: true,
        reason: "Synthèse des contrôles",
        correlationId: `securite-${reporterId}`,
        changedBy: reporterId,
        updatedAt: Date.now(),
      })
      const incident = {
        reporterId,
        tripId: net.tripId,
        photoStorageIds: [],
        offline: false,
      }
      await ctx.db.insert("incidents", {
        ...incident,
        category: "securite",
        severity: "critique",
        status: "ouvert",
        description: "Obstacle signalé par Jean MOUSSAVOU",
        reportedAt: EN_MARS,
        clientId: "inc-1",
      })
      await ctx.db.insert("incidents", {
        ...incident,
        category: "medical",
        severity: "important",
        status: "en_cours",
        description: "Malaise voyageur voiture 4",
        reportedAt: EN_MARS,
        clientId: "inc-2",
      })
      await ctx.db.insert("incidents", {
        ...incident,
        category: "technique",
        severity: "information",
        status: "resolu",
        description: "Climatisation hors service",
        reportedAt: EN_AVRIL,
        clientId: "inc-hors-periode",
      })
      const penalty = {
        agentId: reporterId,
        tripId: net.tripId,
        offline: false,
        offender: {
          lastName: "NDONG",
          firstName: "Paul",
          documentNumber: "GA-123456",
          declined: false,
        },
      }
      await ctx.db.insert("procesVerbaux", {
        ...penalty,
        number: "PV-1",
        reason: "sans_titre",
        amountXaf: 10_000,
        status: "paye",
        issuedAt: EN_MARS,
        clientId: "pv-1",
      })
      await ctx.db.insert("procesVerbaux", {
        ...penalty,
        number: "PV-2",
        reason: "classe_superieure",
        amountXaf: 3_000,
        status: "annule",
        issuedAt: EN_MARS,
        clientId: "pv-2",
      })
      await ctx.db.insert("procesVerbaux", {
        ...penalty,
        number: "PV-3",
        reason: "sans_titre",
        amountXaf: 7_000,
        status: "emis",
        issuedAt: EN_AVRIL,
        clientId: "pv-hors-periode",
      })
    })
    return { net, reporterId }
  }

  it("résume la période pour la Direction générale sans aucune donnée nominative", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { net } = await fixture(t)
    const { ctx } = await asAgent(t, "direction_generale", net.pos, "-dg")

    const summary = await ctx.query(
      api.functions.control.networkSummary,
      MARS_2026
    )

    expect(summary.scope).toBe("reseau")
    expect(summary.dataState).toBe("operational")
    expect(summary.truncated).toBe(false)
    expect(summary.incidents.total).toBe(2)
    expect(summary.incidents.criticalOpen).toBe(1)
    expect(summary.incidents.byCategory.medical).toBe(1)
    expect(summary.penalties.total).toBe(2)
    expect(summary.penalties.amountXaf).toBe(10_000)
    expect(summary.penalties.byStatus.annule).toEqual({
      count: 1,
      amountXaf: 3_000,
    })

    const serialized = JSON.stringify(summary)
    for (const personal of [
      "MOUSSAVOU",
      "Malaise",
      "NDONG",
      "GA-123456",
      "voiture 4",
      String(net.tripId),
    ]) {
      expect(serialized).not.toContain(personal)
    }
  })

  it("refuse un rôle qui ne lit pas le module Sécurité", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { net } = await fixture(t)
    const { ctx } = await asAgent(t, "vendeur_guichet", net.pos, "-vente")

    await expect(
      ctx.query(api.functions.control.networkSummary, MARS_2026)
    ).rejects.toThrow(/Accès refusé/)
  })

  it("ferme la vue réseau à une affectation limitée à un site", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const { net, reporterId } = await fixture(t)
    const { ctx, userId } = await asAgent(
      t,
      "vendeur_guichet",
      net.pos,
      "-site"
    )
    await t.run(async (db) => {
      const now = Date.now()
      const organizationId = await db.db.insert("organizations", {
        code: "ORG-BOO-SECURITE",
        name: "Sécurité Booué",
        type: "direction",
        isActive: true,
        createdBy: reporterId,
        createdAt: now,
        updatedAt: now,
      })
      const siteId = await db.db.insert("sites", {
        code: "BOO",
        name: "Booué",
        type: "gare",
        organizationId,
        stationId: net.boo,
        isActive: true,
        createdBy: reporterId,
        createdAt: now,
        updatedAt: now,
      })
      await db.db.insert("userAssignments", {
        userId,
        role: "inspecteur_securite",
        organizationId,
        siteId,
        validFrom: now - 1_000,
        isActive: true,
        createdBy: reporterId,
        createdAt: now,
        updatedAt: now,
      })
    })

    const summary = await ctx.query(
      api.functions.control.networkSummary,
      MARS_2026
    )

    expect(summary.scope).toBe("restreint")
    expect(summary.dataState).toBe("restricted")
    expect(summary.incidents.total).toBe(0)
    expect(summary.penalties.total).toBe(0)
  })
})
