import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"

/**
 * Génération du billet PDF.
 *
 * Deux enjeux se croisent ici : que le fichier soit bien produit et rattaché,
 * et que personne d'autre que l'acheteur ou un agent habilité ne puisse le
 * réclamer. Un billet porte le nom, le trajet et la place d'un voyageur.
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
    },
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
  suffix = "",
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
    }),
  )
  return { ctx: t.withIdentity({ subject: authId }), userId }
}

const TELEPHONE = "+241 06 11 22 33"

/** Vend un billet en ligne et le règle, pour avoir un titre à imprimer. */
async function issueTicket(
  t: ReturnType<typeof convexTest>,
  fx: Awaited<ReturnType<typeof seedTrip>>,
) {
  const r = await t.mutation(api.functions.bookings.create, {
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME",
    passengers: [{ lastName: "MBADINGA", firstName: "Paul", gender: "M" }],
    contactPhone: TELEPHONE,
  })
  await t.mutation(api.functions.bookings.confirm, {
    reference: r.reference,
    method: "airtel_money",
  })
  const vue = await t.query(api.functions.bookings.getByReference, {
    reference: r.reference,
    contactPhone: TELEPHONE,
  })
  return vue!.tickets[0]!
}

describe("Billet PDF", () => {
  it("produit un fichier et le rattache au titre", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    const r = await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    expect(r.regenerated).toBe(true)
    expect(r.url).toBeTruthy()

    const stocke = await t.run(async (c) => (await c.db.get(billet._id))!)
    expect(stocke.pdfStorageId).toBeDefined()
  })

  it("resert le même fichier au second appel", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    const premier = await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    const second = await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    expect(second.regenerated).toBe(false)
    expect(second.url).toBe(premier.url)
  })

  it("refabrique le billet sur demande, et efface le précédent", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    const avant = await t.run(async (c) => (await c.db.get(billet._id))!)

    const refait = await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
      force: true,
    })
    expect(refait.regenerated).toBe(true)

    const apres = await t.run(async (c) => (await c.db.get(billet._id))!)
    expect(apres.pdfStorageId).not.toBe(avant.pdfStorageId)
    // L'ancien fichier ne doit pas rester orphelin dans le stockage.
    const ancien = await t.run(async (c) =>
      c.storage.getUrl(avant.pdfStorageId!),
    )
    expect(ancien).toBeNull()
  })

  it("est délivré à un agent habilité aux duplicatas", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx: guichet } = await asAgent(t, "vendeur_guichet", fx.pos)

    const r = await guichet.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
    })
    expect(r.url).toBeTruthy()
  })

  it("est refusé sans téléphone de contact ni habilitation", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    await expect(
      t.action(api.functions.documents.ticketPdf, { ticketId: billet._id }),
    ).rejects.toThrow()
  })

  it("est refusé avec un téléphone qui ne correspond pas", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    await expect(
      t.action(api.functions.documents.ticketPdf, {
        ticketId: billet._id,
        contactPhone: "+241 06 99 99 99",
      }),
    ).rejects.toThrow()
  })

  it("est refusé à un rôle interne sans droit sur les duplicatas", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const { ctx: comptable } = await asAgent(t, "comptable", fx.pos)

    await expect(
      comptable.action(api.functions.documents.ticketPdf, {
        ticketId: billet._id,
      }),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("ne rend aucune adresse tant que le billet n'est pas généré", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)

    const url = await t.query(api.functions.documents.ticketPdfUrl, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    expect(url).toBeNull()

    await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    const apres = await t.query(api.functions.documents.ticketPdfUrl, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })
    expect(apres).toBeTruthy()
  })

  it("re-signe les titres sans code-barres et refait leur PDF", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    await t.action(api.functions.documents.ticketPdf, {
      ticketId: billet._id,
      contactPhone: TELEPHONE,
    })

    // Titre hérité : ni code-barres, ni version de clé.
    await t.run(async (c) =>
      c.db.patch(billet._id, {
        barcodePayload: undefined,
        barcodeSignature: undefined,
        keyVersion: undefined,
      }),
    )

    const rapport = await t.mutation(
      internal.functions.documents.resignTickets,
      {},
    )
    expect(rapport.resignes).toBe(1)

    const apres = await t.run(async (c) => (await c.db.get(billet._id))!)
    expect(apres.barcodePayload).toMatch(/^SETRAG1:/)
    expect(apres.keyVersion).toBe(1)
    // Le PDF portait l'ancien symbole : il doit avoir été retiré.
    expect(apres.pdfStorageId).toBeUndefined()
  })

  it("laisse tranquilles les titres déjà à jour", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    const avant = await t.run(async (c) => (await c.db.get(billet._id))!)

    const rapport = await t.mutation(
      internal.functions.documents.resignTickets,
      {},
    )
    expect(rapport.resignes).toBe(0)

    const apres = await t.run(async (c) => (await c.db.get(billet._id))!)
    expect(apres.barcodePayload).toBe(avant.barcodePayload)
  })

  it("refuse d'imprimer un titre dépourvu de code-barres", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const billet = await issueTicket(t, fx)
    // Cas d'un titre antérieur à la mise en place de la signature.
    await t.run(async (c) =>
      c.db.patch(billet._id, { barcodePayload: undefined }),
    )

    await expect(
      t.action(api.functions.documents.ticketPdf, {
        ticketId: billet._id,
        contactPhone: TELEPHONE,
      }),
    ).rejects.toThrow(/sans code-barres/)
  })
})
