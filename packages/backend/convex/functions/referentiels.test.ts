import { convexTest, type TestConvex } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { addDays, toServiceDate } from "../model/calendar"
import type { AppRole } from "../model/permissions"
import schema from "../schema"
import { modules } from "../test.setup"
import {
  masquerTelephone,
  referenceIncident,
  validerPlanImporte,
  valeursModifiees,
} from "./referentiels"

type T = TestConvex<typeof schema>

async function asRole(t: T, role: AppRole, extra: Record<string, unknown> = {}) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      identitySource: "annuaire",
      isActive: true,
      ...extra,
    })
  )
  return { client: t.withIdentity({ subject: authId }), userId }
}

/** Réseau minimal : trois gares, un Express à deux voitures, une grille active. */
async function seedReseau(t: T) {
  const net = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", {
      authId: "seed-admin",
      firstName: "Clarisse",
      lastName: "Mba",
      matricule: "A-007",
      role: "admin_fonctionnel",
      identitySource: "annuaire",
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
      number: "E201",
      name: "Express 201",
      type: "EXPRESS",
      isActive: true,
    })
    const seats: Id<"seats">[] = []
    for (const [position, label, classe] of [
      [1, "V1", "PREMIERE"],
      [2, "V2", "DEUXIEME"],
    ] as const) {
      const coachId = await ctx.db.insert("coaches", {
        trainId,
        label,
        serviceClass: classe,
        rowCount: 2,
        columnCount: 2,
        seatCount: 4,
        standingCapacity: 0,
        position,
      })
      for (const [seat, row, column] of [
        ["1A", 1, 1],
        ["1B", 1, 2],
        ["2A", 2, 1],
        ["2B", 2, 2],
      ] as const) {
        seats.push(
          await ctx.db.insert("seats", { coachId, trainId, label: seat, row, column, isActive: true })
        )
      }
    }
    const scheduleId = await ctx.db.insert("fareSchedules", {
      label: "Barème 2026",
      status: "actif",
      validFrom: 0,
      validUntil: Date.now() + 365 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 0,
      cssPct: 0,
      createdBy: admin,
    })
    for (const [serviceClass, court, long] of [
      ["DEUXIEME", 47.51, 43.42],
      ["PREMIERE", 60.1, 54.93],
    ] as const) {
      await ctx.db.insert("fareBases", {
        scheduleId,
        trainType: "EXPRESS",
        serviceClass,
        shortDistanceRate: court,
        longDistanceRate: long,
      })
    }
    const agence = await ctx.db.insert("pointsOfSale", {
      code: "AG-LBV1",
      name: "Agence Libreville Centre",
      type: "agence_accreditee",
      counters: { passengers: 3, baggage: 0, parcels: 0 },
      isActive: true,
    })
    return { admin, owe, boo, fcv, trainId, seats, fareScheduleId: scheduleId, agence }
  })

  const serviceDate = addDays(toServiceDate(Date.now()), 3)
  const admin = t.withIdentity({ subject: "seed-admin" })
  const bookletId = await admin.mutation(api.functions.booklets.create, {
    label: "Service 2026",
    validFrom: Date.parse(`${serviceDate}T00:00:00Z`),
    validUntil: Date.parse(`${addDays(serviceDate, 1)}T23:00:00Z`),
  })
  const bookletScheduleId = await admin.mutation(api.functions.booklets.addSchedule, {
    bookletId,
    trainId: net.trainId,
    departureTime: "07:40",
    daysOfWeek: [],
    stops: [
      { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
      { stationId: net.boo, sequence: 1, arrivalOffsetMinutes: 380, departureOffsetMinutes: 385 },
      { stationId: net.fcv, sequence: 2, arrivalOffsetMinutes: 705 },
    ],
  })
  await admin.mutation(api.functions.booklets.submit, { bookletId })
  await admin.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId: bookletScheduleId,
    serviceDate,
  })
  const tripId = rapport.tripId as Id<"trips">
  await t.run((ctx) => ctx.db.patch(tripId, { isOpenForSale: true }))
  return { ...net, adminClient: admin, bookletId, tripId, serviceDate }
}

async function compteurs(t: T, tripId: Id<"trips">, classe: "DEUXIEME" | "PREMIERE") {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", tripId).eq("serviceClass", classe))
        .collect()
    ).sort((a, b) => a.segmentIndex - b.segmentIndex)
  )
}

async function actions(t: T) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).map((log) => log.action)
  )
}

describe("Outils purs", () => {
  it("masque un téléphone sans perdre de quoi le reconnaître", () => {
    expect(masquerTelephone("+241 77 12 34 21")).toBe("+241 77 •• •• 21")
    expect(masquerTelephone("077123421")).toBe("07 •• •• 21")
    expect(masquerTelephone(undefined)).toBeNull()
  })

  it("valide un plan importé et refuse les doublons", () => {
    const plan = validerPlanImporte([
      { rangee: 1, colonne: 1, type: "pmr" },
      { rangee: 1, colonne: 2, numero: "1b" },
      { rangee: 2, colonne: 4 },
    ])
    expect(plan).toMatchObject({ rowCount: 2, columnCount: 4 })
    expect(plan.places.map((p) => p.label)).toEqual(["1A", "1B", "2D"])
    expect(plan.places[0]?.kind).toBe("pmr")
    expect(() =>
      validerPlanImporte([
        { rangee: 1, colonne: 1 },
        { rangee: 1, colonne: 1 },
      ])
    ).toThrow(/rangée 1, colonne 1/)
    expect(() => validerPlanImporte([{ rangee: 1, colonne: 1, type: "lit" }])).toThrow(/inconnu/)
  })

  it("compte les taux modifiés entre deux barèmes", () => {
    const base = { trainType: "EXPRESS" as const, serviceClass: "DEUXIEME" as const, shortDistanceRate: 47.51, longDistanceRate: 43.42 }
    expect(valeursModifiees([base], [base])).toBe(0)
    expect(valeursModifiees([{ ...base, longDistanceRate: 44 }], [base])).toBe(1)
    expect(valeursModifiees([base], null)).toBe(0)
  })

  it("donne une référence stable aux incidents non numérotés", () => {
    expect(
      referenceIncident({ number: undefined, clientId: "abc-123-xyz9", reportedAt: Date.UTC(2026, 9, 1) })
    ).toBe("INC-2026-XYZ9")
  })
})

describe("Livrets horaires", () => {
  it("liste les livrets avec circulations, chevauchements et auteurs, puis expire", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const concurrent = await net.adminClient.mutation(api.functions.booklets.create, {
      label: "Fêtes",
      validFrom: Date.parse(`${net.serviceDate}T00:00:00Z`),
      validUntil: Date.parse(`${addDays(net.serviceDate, 10)}T23:00:00Z`),
    })
    const liste = await net.adminClient.query(api.functions.referentiels.livrets, {})
    const service = liste.find((l) => l._id === net.bookletId)!
    expect(service).toMatchObject({
      status: "actif",
      trains: ["E201"],
      circulations: 3,
      soumisPar: { court: "C. Mba" },
    })
    const fetes = liste.find((l) => l._id === concurrent)!
    expect(fetes.chevauchements.map((c) => c.label)).toEqual(["Service 2026"])

    const detail = await net.adminClient.query(api.functions.referentiels.livret, {
      bookletId: net.bookletId,
    })
    expect(detail?.circulations[0]).toMatchObject({
      trainNumber: "E201",
      heureArrivee: "19:25",
      voitures: 2,
      places: 8,
    })
    expect(detail?.historique.map((h) => h.action)).toEqual(
      expect.arrayContaining(["livret.creer", "livret.soumettre", "livret.activer"])
    )

    await net.adminClient.mutation(api.functions.referentiels.expirerLivret, {
      bookletId: net.bookletId,
    })
    expect((await t.run((ctx) => ctx.db.get(net.bookletId)))?.status).toBe("expire")
  })
})

describe("Trains et voitures", () => {
  it("importe un plan de voiture neuve, et refuse une voiture déjà engagée", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const neuf = await t.run(async (ctx) => {
      const trainId = await ctx.db.insert("trains", { number: "S901", name: "Spécial", type: "SPECIAL", isActive: true })
      return await ctx.db.insert("coaches", {
        trainId,
        label: "V1",
        serviceClass: "DEUXIEME",
        rowCount: 1,
        columnCount: 1,
        seatCount: 1,
        standingCapacity: 0,
        position: 1,
      })
    })
    const resultat = await net.adminClient.mutation(api.functions.referentiels.importerPlanVoiture, {
      coachId: neuf,
      places: [
        { rangee: 1, colonne: 1, type: "pmr" },
        { rangee: 1, colonne: 2 },
        { rangee: 2, colonne: 1 },
      ],
      fichier: "plan.csv",
    })
    expect(resultat).toEqual({ rowCount: 2, columnCount: 2, seatCount: 3 })
    const seats = await t.run((ctx) =>
      ctx.db.query("seats").withIndex("by_coach", (q) => q.eq("coachId", neuf)).collect()
    )
    expect(seats.filter((s) => s.kind === "pmr")).toHaveLength(1)

    const engagee = await t.run(async (ctx) =>
      (await ctx.db.query("coaches").withIndex("by_train", (q) => q.eq("trainId", net.trainId)).collect())[0]!._id
    )
    await expect(
      net.adminClient.mutation(api.functions.referentiels.importerPlanVoiture, {
        coachId: engagee,
        places: [{ rangee: 1, colonne: 1 }],
      })
    ).rejects.toThrow(/engagée/)

    const detail = await net.adminClient.query(api.functions.referentiels.train, { trainId: net.trainId })
    expect(detail).toMatchObject({ nbVoitures: 2, placesAssises: 8, aDesDessertes: true })
    expect(await actions(t)).toContain("referentiel.voiture.importer_plan")
  })
})

describe("Places et quotas", () => {
  it("bloque plusieurs places d'un coup, en tout ou rien", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const { client: chef } = await asRole(t, "chef_gare")
    const [a, b] = net.seats.slice(4, 6) as [Id<"seats">, Id<"seats">]
    await chef.mutation(api.functions.referentiels.bloquerPlaces, {
      tripId: net.tripId,
      seatIds: [a, b],
      fromStopIndex: 0,
      toStopIndex: 2,
      reason: "protocole",
      comment: "Délégation ministérielle",
    })
    const counters = await compteurs(t, net.tripId, "DEUXIEME")
    expect(counters.map((c) => [c.reserved, c.available])).toEqual([
      [2, 2],
      [2, 2],
    ])

    // Une place déjà bloquée fait échouer le lot entier.
    const c = net.seats[6]!
    await expect(
      chef.mutation(api.functions.referentiels.bloquerPlaces, {
        tripId: net.tripId,
        seatIds: [c, a],
        fromStopIndex: 0,
        toStopIndex: 1,
        reason: "maintenance",
        comment: "Tablette cassée",
      })
    ).rejects.toThrow(/déjà bloquée/)
    expect((await compteurs(t, net.tripId, "DEUXIEME"))[0]?.reserved).toBe(2)

    const vue = await chef.query(api.functions.referentiels.occupation, { tripId: net.tripId })
    expect(vue?.totaux).toMatchObject({ bloquee: 2, libre: 6 })
    expect(vue?.blocages[0]).toMatchObject({ portion: "Tout le parcours", isActive: true, creePar: { role: "chef_gare" } })
  })

  it("réserve un quota d'agence, le figure, puis le rend à la vente", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const quotaId = await net.adminClient.mutation(api.functions.referentiels.creerQuotaAgence, {
      tripId: net.tripId,
      pointOfSaleId: net.agence,
      serviceClass: "DEUXIEME",
      allocated: 3,
      releaseAt: Date.now() + 86_400_000,
    })
    expect((await compteurs(t, net.tripId, "DEUXIEME")).map((c) => c.available)).toEqual([1, 1])
    await expect(
      net.adminClient.mutation(api.functions.referentiels.creerQuotaAgence, {
        tripId: net.tripId,
        pointOfSaleId: net.agence,
        serviceClass: "DEUXIEME",
        allocated: 2,
      })
    ).rejects.toThrow(/Seulement 1 place/)

    const vue = await net.adminClient.query(api.functions.referentiels.occupation, { tripId: net.tripId })
    expect(vue?.totaux.quota).toBe(3)
    expect(vue?.quotas[0]).toMatchObject({ allocated: 3, pointOfSale: { code: "AG-LBV1" } })

    await net.adminClient.mutation(api.functions.referentiels.annulerQuotaAgence, {
      quotaId,
      motif: "Agence fermée pour inventaire",
    })
    expect((await compteurs(t, net.tripId, "DEUXIEME")).map((c) => [c.reserved, c.available])).toEqual([
      [0, 4],
      [0, 4],
    ])
    // L'échéance planifiée ne rend rien une seconde fois.
    await expect(t.mutation(internal.functions.referentiels.libererQuotaEchu, { quotaId })).resolves.toBe(0)
    expect(await actions(t)).toEqual(expect.arrayContaining(["quota_agence.creer", "quota_agence.annuler"]))
  })

  it("rend à la vente un quota dont l'échéance est passée sans libération planifiée", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const quotaId = await net.adminClient.mutation(api.functions.referentiels.creerQuotaAgence, {
      tripId: net.tripId,
      pointOfSaleId: net.agence,
      serviceClass: "DEUXIEME",
      allocated: 3,
      releaseAt: Date.now() + 86_400_000,
    })
    // L'échéance est passée, et sa libération planifiée n'a jamais tourné.
    await t.run((ctx) => ctx.db.patch(quotaId, { releaseAt: Date.now() - 60_000 }))

    const bilan = await t.mutation(internal.functions.referentiels.libererQuotasEchus, {})
    expect(bilan.quotas).toBe(1)
    expect((await compteurs(t, net.tripId, "DEUXIEME")).map((c) => [c.reserved, c.available])).toEqual([
      [0, 4],
      [0, 4],
    ])
    // Un second passage ne rend rien de plus.
    await expect(t.mutation(internal.functions.referentiels.libererQuotasEchus, {})).resolves.toEqual({ quotas: 0, places: 0 })
    expect(await actions(t)).toEqual(expect.arrayContaining(["quota_agence.liberer_echeance"]))
  })
})

describe("Tarifs", () => {
  it("crée une version copiée, édite la grille, gère les réductions et simule", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const brouillon = await net.adminClient.mutation(api.functions.referentiels.creerGrille, {
      label: "Grille 2026-2",
      validFrom: Date.now() + 30 * 86_400_000,
      validUntil: Date.now() + 400 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 0,
      cssPct: 0,
      copierDe: net.fareScheduleId,
    })
    const resultat = await net.adminClient.mutation(api.functions.referentiels.enregistrerGrille, {
      scheduleId: brouillon,
      bases: [
        { trainType: "EXPRESS", serviceClass: "DEUXIEME", shortDistanceRate: 47.51, longDistanceRate: 44 },
        { trainType: "EXPRESS", serviceClass: "PREMIERE", shortDistanceRate: 60.1, longDistanceRate: 54.93 },
      ],
    })
    expect(resultat.modifiees).toBe(1)
    const detail = await net.adminClient.query(api.functions.referentiels.grilleTarifaire, { scheduleId: brouillon })
    expect(detail).toMatchObject({ modifiees: 1, estAuteur: true, reference: { label: "Barème 2026" } })

    await net.adminClient.mutation(api.functions.referentiels.enregistrerReduction, {
      scheduleId: brouillon,
      code: "enfant",
      label: "Enfant 4–11 ans",
      ratePct: 50,
      minAge: 4,
      maxAge: 11,
      requiresProof: true,
      isActive: true,
    })
    await expect(
      net.adminClient.mutation(api.functions.referentiels.enregistrerReduction, {
        scheduleId: brouillon,
        code: "ENFANT",
        label: "Doublon",
        ratePct: 40,
        requiresProof: false,
        isActive: true,
      })
    ).rejects.toThrow(/existe déjà/)

    const simulation = await net.adminClient.query(api.functions.referentiels.simulerPrix, {
      scheduleId: brouillon,
      originStationId: net.owe,
      destinationStationId: net.fcv,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      discountCode: "ENFANT",
      joursAvantDepart: 10,
      jourSemaine: 5,
      remplissagePct: 50,
      canal: "guichet",
    })
    // 648 km × 44 = 28 512, −50 % = 14 256, arrondi à la centaine : 14 300.
    expect(simulation).toMatchObject({ ok: true, distanceKm: 648, ratePerKm: 44, prixGrille: 14300, prixFinal: 14300 })

    // Une grille active ne se modifie plus.
    await expect(
      net.adminClient.mutation(api.functions.referentiels.enregistrerGrille, {
        scheduleId: net.fareScheduleId,
        bases: [],
      })
    ).rejects.toThrow(/plus modifiable/)
    expect(await actions(t)).toEqual(
      expect.arrayContaining(["tarif.grille.creer", "tarif.grille.bareme", "tarif.reduction.creer"])
    )
  })
})

describe("Yield", () => {
  it("crée une règle et trace la courbe de prix selon l'anticipation", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    await net.adminClient.mutation(api.functions.referentiels.creerRegleYield, {
      label: "Dernière minute",
      code: "derniere-minute",
      scope: "reseau",
      type: "anticipation",
      threshold: 7,
      modifierPct: 12,
      priority: 10,
      isActive: true,
    })
    await expect(
      net.adminClient.mutation(api.functions.referentiels.creerRegleYield, {
        code: "DERNIERE-MINUTE",
        scope: "reseau",
        type: "anticipation",
        threshold: 3,
        modifierPct: 5,
        priority: 11,
        isActive: true,
      })
    ).rejects.toThrow(/existe déjà/)

    const courbe = await net.adminClient.query(api.functions.referentiels.courbeYield, {
      tripId: net.tripId,
      serviceClass: "DEUXIEME",
    })
    expect(courbe?.etat).toBe("ok")
    expect(courbe?.points).toHaveLength(61)
    // 648 × 43,42 = 28 136 → 28 100 ; à J−7 et moins, +12 % → 31 500.
    expect(courbe?.prixGrille).toBe(28100)
    expect(courbe?.points.find((p) => p.jours === 30)?.prix).toBe(28100)
    expect(courbe?.points.find((p) => p.jours === 2)).toMatchObject({ prix: 31500, regles: ["Dernière minute"] })

    const regles = await net.adminClient.query(api.functions.referentiels.reglesYield, {})
    expect(regles[0]).toMatchObject({ code: "DERNIERE-MINUTE", etat: "active", label: "Dernière minute" })
  })
})

describe("Voyageurs et manifeste", () => {
  async function seedBillet(t: T, net: Awaited<ReturnType<typeof seedReseau>>) {
    return await t.run(async (ctx) => {
      const saleId = await ctx.db.insert("sales", {
        number: "V-OWE-0001",
        kind: "vente",
        product: "billet",
        channel: "guichet",
        status: "confirmee",
        contactPhone: "+241 66 00 11 04",
        amounts: { ht: 28100, vat: 0, css: 0, ttc: 28100, received: 28100 },
        soldAt: Date.now(),
      })
      return await ctx.db.insert("tickets", {
        saleId,
        number: "B-4801-1",
        tripId: net.tripId,
        passenger: {
          lastName: "Ella Nguema",
          firstName: "Paul",
          gender: "M",
          phone: "+241 77 12 34 21",
          nationality: "Gabonaise",
        },
        originStationId: net.owe,
        destinationStationId: net.fcv,
        fromStopIndex: 0,
        toStopIndex: 2,
        serviceClass: "DEUXIEME",
        coachLabel: "V2",
        seatLabel: "1A",
        isStanding: false,
        fare: { distanceKm: 648, chargeableKm: 648, ratePerKm: 43.42, discountPct: 0, appliedRules: [], roundingStep: 100 },
        unitPriceTtc: 28100,
        status: "valide",
        duplicateCount: 0,
      })
    })
  }

  it("extrait le manifeste avec téléphones masqués, et trace l'extraction", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const ticketId = await seedBillet(t, net)
    const { client: chef } = await asRole(t, "chef_gare")

    const extraction = await chef.mutation(api.functions.referentiels.extraireManifeste, {
      tripId: net.tripId,
      recherche: "34 21",
    })
    expect(extraction.lignes).toHaveLength(1)
    expect(extraction.lignes[0]).toMatchObject({
      nom: "ELLA NGUEMA",
      telephone: "+241 77 •• •• 21",
      controle: null,
    })
    const log = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).find((l) => l.action === "voyageurs.extraction")
    )
    expect(JSON.parse(log!.metadata!)).toMatchObject({ voyageurs: 1, filtres: { recherche: "34 21" } })

    await expect(
      chef.mutation(api.functions.referentiels.revelerTelephone, { ticketId, motif: "court" })
    ).rejects.toThrow(/Motivez/)
    const numeros = await chef.mutation(api.functions.referentiels.revelerTelephone, {
      ticketId,
      motif: "Retard de 2 h : prévenir le voyageur",
    })
    expect(numeros.telephone).toBe("+241 77 12 34 21")
    const fiche = await chef.query(api.functions.referentiels.billetVoyageur, { ticketId })
    expect(fiche?.ticket.telephone).toBe("+241 77 •• •• 21")
    expect(JSON.stringify(fiche)).not.toContain("12 34 21")
    expect(await actions(t)).toContain("voyageurs.telephone.afficher")
  })

  it("refuse l'extraction sans desserte ni date, et aux rôles sans droit", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const { client: chef } = await asRole(t, "chef_gare")
    await expect(chef.mutation(api.functions.referentiels.extraireManifeste, {})).rejects.toThrow(/desserte ou une date/)
    const { client: agence } = await asRole(t, "vendeur_agence")
    await expect(
      agence.mutation(api.functions.referentiels.extraireManifeste, { tripId: net.tripId })
    ).rejects.toThrow(/Accès refusé/)
  })
})

describe("Incidents et procès-verbaux", () => {
  it("numérote la déclaration, exige une cause à la clôture, encaisse un PV", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const { client: chef, userId } = await asRole(t, "chef_gare")
    const { number, id } = await chef.mutation(api.functions.referentiels.declarerIncident, {
      tripId: net.tripId,
      location: "Entre Ntoum et Andem",
      category: "technique",
      severity: "important",
      description: "Lecteur de billets indisponible en V3",
    })
    expect(number).toMatch(/^INC-\d{4}-0001$/)
    const second = await chef.mutation(api.functions.referentiels.declarerIncident, {
      stationId: net.boo,
      category: "securite",
      severity: "information",
      description: "Quai glissant après l'averse",
    })
    expect(second.number).toMatch(/-0002$/)

    await chef.mutation(api.functions.referentiels.cloreIncident, {
      incidentId: id,
      cause: "materiel",
      note: "Terminal de relève remis à Ndjolé",
    })
    const detail = await chef.query(api.functions.referentiels.incident, { incidentId: id })
    expect(detail?.incident).toMatchObject({ status: "resolu", closureCause: "materiel" })
    expect(detail?.historique.map((h) => h.action)).toEqual(["incident.clore", "incident.declarer"])
    await expect(
      chef.mutation(api.functions.referentiels.cloreIncident, { incidentId: id, cause: "autre", note: "Encore" })
    ).rejects.toThrow(/déjà clos/)

    const penaltyId = await t.run((ctx) =>
      ctx.db.insert("procesVerbaux", {
        number: "PV-000142",
        agentId: userId,
        tripId: net.tripId,
        offender: { lastName: "Tchibinda", firstName: "Marc", phone: "+241 65 00 00 72", declined: false },
        reason: "sans_titre",
        amountXaf: 25_000,
        status: "emis",
        issuedAt: Date.now(),
        offline: false,
        clientId: "pv-1",
      })
    )
    await expect(
      chef.mutation(api.functions.referentiels.encaisserPv, { penaltyId, method: "airtel_money" })
    ).rejects.toThrow(/référence/)
    await chef.mutation(api.functions.referentiels.encaisserPv, { penaltyId, method: "especes" })
    const pv = await chef.query(api.functions.referentiels.penalite, { penaltyId })
    expect(pv?.penalty).toMatchObject({ status: "paye", offender: { phone: "+241 65 •• •• 72" } })
    expect(pv?.paiement).toMatchObject({ method: "especes", amountXaf: 25_000, status: "confirme" })
  })
})

describe("Utilisateurs et droits", () => {
  it("invite un agent, borne le rôle d'administrateur système et simule l'annuaire", async () => {
    const t = convexTest(schema, modules)
    const net = await seedReseau(t)
    const { client: admin } = await asRole(t, "admin_fonctionnel")
    const pos = await t.run((ctx) =>
      ctx.db.insert("pointsOfSale", {
        code: "OWE",
        name: "Gare d'Owendo",
        type: "gare",
        counters: { passengers: 4, baggage: 1, parcels: 1 },
        isActive: true,
      })
    )
    const id = await admin.mutation(api.functions.referentiels.inviterUtilisateur, {
      email: "Guy.Mapangou@setrag.ga",
      firstName: "Guy",
      lastName: "Mapangou",
      matricule: "v-133",
      role: "vendeur_guichet",
      pointOfSaleId: pos,
    })
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      email: "guy.mapangou@setrag.ga",
      matricule: "V-133",
      identitySource: "annuaire",
      invitedAt: expect.any(Number),
    })
    await expect(
      admin.mutation(api.functions.referentiels.inviterUtilisateur, {
        email: "dsi@setrag.ga",
        firstName: "Dsi",
        lastName: "Test",
        role: "admin_it",
      })
    ).rejects.toThrow(/administrateur système/)
    await expect(
      admin.mutation(api.functions.administration.updateManagedUser, {
        userId: id,
        role: "admin_it",
      })
    ).rejects.toThrow(/administrateur système/)

    const rapport = await admin.mutation(api.functions.referentiels.synchroniserAnnuaire, {})
    expect(rapport.simule).toBe(true)
    const vue = await admin.query(api.functions.referentiels.comptes, {})
    const guy = vue.comptes.find((c) => c._id === id)
    expect(guy).toMatchObject({ etat: "invite", secondFactor: "aucun", pointOfSale: { code: "OWE" } })
    expect(vue.annuaire.derniereSynchronisation).not.toBeNull()
    expect(vue.comptes.some((c) => c.role === "voyageur")).toBe(false)
    expect(net.admin).toBeDefined()
  })
})
