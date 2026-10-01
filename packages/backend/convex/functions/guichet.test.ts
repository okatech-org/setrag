import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"
import { addDays, toServiceDate } from "../model/calendar"
import { penaliteRemboursement } from "./guichet"

/**
 * Portail de vente — tenue des places, encaissement par moyen, paiement
 * mobile simulé, après-vente et caisse.
 *
 * L'invariant central : une place tenue au guichet n'est ni vendable par un
 * autre canal, ni comptée dans la caisse tant qu'elle n'est pas réglée.
 */

type T = ReturnType<typeof convexTest>

async function seedTrip(t: T) {
  const net = await t.run(async (ctx) => {
    const pos = await ctx.db.insert("pointsOfSale", {
      code: "OWE-PV",
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
    const ndj = await ctx.db.insert("stations", {
      code: "NDJ",
      name: "Ndjolé",
      province: "Moyen-Ogooué",
      kilometerPoint: 175,
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
    await ctx.db.patch(pos, { stationId: owe })
    const trainId = await ctx.db.insert("trains", {
      number: "TR-201",
      name: "Express",
      type: "EXPRESS",
      isActive: true,
    })
    const coachId = await ctx.db.insert("coaches", {
      trainId,
      label: "V4",
      serviceClass: "DEUXIEME",
      rowCount: 2,
      columnCount: 2,
      seatCount: 4,
      standingCapacity: 0,
      position: 1,
    })
    const seats: Record<string, Id<"seats">> = {}
    for (const [label, row, column] of [
      ["1A", 1, 1],
      ["1B", 1, 2],
      ["2A", 2, 1],
      ["2B", 2, 2],
    ] as const) {
      seats[label] = await ctx.db.insert("seats", { coachId, trainId, label, row, column, isActive: true })
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
    return { pos, owe, ndj, fcv, trainId, seats }
  })

  const serviceDate = addDays(toServiceDate(Date.now()), 3)
  const adminCtx = t.withIdentity({ subject: "seed-admin" })
  const bookletId = await adminCtx.mutation(api.functions.booklets.create, {
    label: "Livret de vente",
    validFrom: Date.parse(`${serviceDate}T00:00:00Z`),
    validUntil: Date.parse(`${serviceDate}T23:00:00Z`),
  })
  const scheduleId = await adminCtx.mutation(api.functions.booklets.addSchedule, {
    bookletId,
    trainId: net.trainId,
    departureTime: "08:00",
    daysOfWeek: [],
    stops: [
      { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
      { stationId: net.ndj, sequence: 1, arrivalOffsetMinutes: 200 },
      { stationId: net.fcv, sequence: 2, arrivalOffsetMinutes: 700 },
    ],
  })
  await adminCtx.mutation(api.functions.booklets.submit, { bookletId })
  await adminCtx.mutation(api.functions.booklets.approve, { bookletId })
  const rapport = await t.mutation(internal.functions.trips.generateOne, { scheduleId, serviceDate })
  return { ...net, serviceDate, tripId: rapport.tripId as Id<"trips"> }
}

async function asAgent(t: T, posId: Id<"pointsOfSale">, role: AppRole = "vendeur_guichet", openCash = true) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Nadège",
      lastName: "MOUSSAVOU",
      matricule: "V-101",
      role,
      pointOfSaleId: posId,
      identitySource: "annuaire",
      isActive: true,
    })
  )
  const ctx = t.withIdentity({ subject: authId })
  if (openCash) await ctx.mutation(api.functions.cash.openSession, { openingFloatXaf: 50_000 })
  return { ctx, userId }
}

type Fixture = Awaited<ReturnType<typeof seedTrip>>

async function tenir(ctx: Awaited<ReturnType<typeof asAgent>>["ctx"], fx: Fixture, seats: string[], codes: string[] = []) {
  return await ctx.mutation(api.functions.guichet.tenirPlaces, {
    tripId: fx.tripId,
    originStationId: fx.owe,
    destinationStationId: fx.fcv,
    serviceClass: "DEUXIEME",
    passagers: seats.map((label, index) => ({ seatId: fx.seats[label], discountCode: codes[index] || undefined })),
  })
}

function voyageurs(tenue: Awaited<ReturnType<typeof tenir>>) {
  return tenue.billets.map((b, index) => ({
    billetId: b.id,
    lastName: index === 0 ? "nzé" : "NZÉ",
    firstName: index === 0 ? "Aimée" : "Joël",
    gender: "F" as const,
    phone: index === 0 ? "+241 77 12 34 56" : undefined,
  }))
}

describe("Tenue des places au guichet", () => {
  it("tient les places choisies sans rien encaisser", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)

    const tenue = await tenir(ctx, fx, ["1A", "1B"], ["", "ENFANT"])
    expect(tenue.billets.map((b) => b.place)).toEqual(["1A", "1B"])
    expect(tenue.billets[0]?.voiture).toBe("V4")
    expect(tenue.billets[1]!.prix).toBeLessThan(tenue.billets[0]!.prix)
    expect(tenue.finTenue).toBeGreaterThan(Date.now() + 14 * 60_000)

    // Les places ne sont plus offertes à un autre canal…
    const plan = await ctx.query(api.functions.trips.availableSeats, {
      tripId: fx.tripId,
      fromIndex: 0,
      toIndex: 2,
      serviceClass: "DEUXIEME",
    })
    expect(plan.filter((s) => !s.isFree).map((s) => s.label).sort()).toEqual(["1A", "1B"])
    // …et la caisse n'a rien encaissé.
    const caisse = await ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.salesCount).toBe(0)
    expect(caisse?.totalTtc).toBe(0)
  })

  it("remplace une tenue sans rendre la place au public", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const premiere = await tenir(ctx, fx, ["1A"])
    const seconde = await ctx.mutation(api.functions.guichet.tenirPlaces, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passagers: [{ seatId: fx.seats["1A"], discountCode: "ENFANT" }],
      remplace: premiere.venteId,
    })
    expect(seconde.billets[0]?.place).toBe("1A")
    expect(seconde.billets[0]?.reduction).toBe("ENFANT")
    const ancienne = await t.run(async (c) => c.db.get(premiere.venteId))
    expect(ancienne?.status).toBe("annulee")
  })

  it("rend les places à l'abandon de la vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["2A"])
    await ctx.mutation(api.functions.guichet.libererTenue, { venteId: tenue.venteId })
    const plan = await ctx.query(api.functions.trips.availableSeats, {
      tripId: fx.tripId,
      fromIndex: 0,
      toIndex: 2,
      serviceClass: "DEUXIEME",
    })
    expect(plan.every((s) => s.isFree)).toBe(true)
  })

  it("refuse une place vendue entre-temps, avec un message du guichet", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const a = await asAgent(t, fx.pos)
    const b = await asAgent(t, fx.pos)
    await tenir(a.ctx, fx, ["1A"])
    await expect(tenir(b.ctx, fx, ["1A"])).rejects.toThrow(/vient d'être vendue/)
  })
})

describe("Encaissement d'une vente tenue", () => {
  it("encaisse en espèces : vente ferme, monnaie, caisse par moyen", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["1A", "1B"], ["", "ENFANT"])
    const ttc = tenue.montants.ttc

    const resultat = await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "especes",
      tendered: ttc + 1_500,
    })
    expect(resultat.statut).toBe("confirmee")
    expect(resultat.monnaie).toBe(1_500)

    const dossier = await ctx.query(api.functions.guichet.vente, { venteId: tenue.venteId })
    expect(dossier?.vente.statut).toBe("confirmee")
    expect(dossier?.vente.moyen).toBe("especes")
    expect(dossier?.billets.map((b) => `${b.voyageur.nom} ${b.voyageur.prenom}`)).toEqual(["NZÉ Aimée", "NZÉ Joël"])
    expect(dossier?.billets.every((b) => b.statut === "valide")).toBe(true)
    expect(dossier?.paiements[0]).toMatchObject({ moyen: "especes", remis: ttc + 1_500, rendu: 1_500 })
    expect(dossier?.actions.annulation).toBe(true)

    const caisse = await ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.totalReceived).toBe(ttc)
    expect(caisse?.expectedByMethod).toEqual([{ method: "especes", amountXaf: ttc, count: 1 }])

    const plan = await ctx.query(api.functions.trips.availableSeats, {
      tripId: fx.tripId,
      fromIndex: 0,
      toIndex: 2,
      serviceClass: "DEUXIEME",
    })
    expect(plan.filter((s) => s.isOccupied).length).toBe(2)
  })

  it("bloque un montant reçu insuffisant", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["1A"])
    await expect(
      ctx.mutation(api.functions.guichet.encaisserBillets, {
        venteId: tenue.venteId,
        voyageurs: voyageurs(tenue),
        method: "especes",
        tendered: tenue.montants.ttc - 1,
      })
    ).rejects.toThrow(/Montant reçu insuffisant/)
  })

  it("exige le nom et le prénom de chaque voyageur", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["1A"])
    await expect(
      ctx.mutation(api.functions.guichet.encaisserBillets, {
        venteId: tenue.venteId,
        voyageurs: [{ billetId: tenue.billets[0]!.id, lastName: " ", firstName: "Aimée", gender: "F" }],
        method: "visa",
      })
    ).rejects.toThrow(/nom et le prénom/)
  })

  it("encaisse une carte bancaire avec la référence du ticket TPE", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["2A"])
    await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "visa",
      reference: "TPE-004512",
    })
    const caisse = await ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.expectedByMethod).toEqual([{ method: "visa", amountXaf: tenue.montants.ttc, count: 1 }])
  })
})

describe("Paiement mobile (réponse opérateur simulée)", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("attend la confirmation de l'opérateur, puis émet les billets", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["1A"])
    const demande = await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "airtel_money",
      payerPhone: "+241 77 12 34 56",
    })
    expect(demande.statut).toBe("en_attente")
    const enCours = await ctx.query(api.functions.guichet.paiement, { paiementId: demande.paiementId! })
    expect(enCours?.statut).toBe("en_attente")
    expect(enCours?.simule).toBe(true)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const regle = await ctx.query(api.functions.guichet.paiement, { paiementId: demande.paiementId! })
    expect(regle?.statut).toBe("confirme")
    expect(regle?.vente?.statut).toBe("confirmee")
    const caisse = await ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.expectedByMethod).toEqual([{ method: "airtel_money", amountXaf: tenue.montants.ttc, count: 1 }])
  })

  it("garde la tenue quand l'opérateur refuse, pour proposer un autre moyen", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["1A"])
    const demande = await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "moov_money",
      payerPhone: "+241 62 00 0000",
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const refuse = await ctx.query(api.functions.guichet.paiement, { paiementId: demande.paiementId! })
    expect(refuse?.statut).toBe("echoue")
    expect(refuse?.raison).toMatch(/solde insuffisant/)

    const especes = await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "especes",
      tendered: tenue.montants.ttc,
    })
    expect(especes.statut).toBe("confirmee")
  })

  it("règle un bagage après confirmation du paiement préalable", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const tenue = await tenir(ctx, fx, ["1A"])
    await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "especes",
      tendered: tenue.montants.ttc,
    })
    const devis = await ctx.query(api.functions.ancillaries.quoteBaggage, {
      ticketId: tenue.billets[0]!.id,
      weightKg: 12,
    })
    const demande = await ctx.mutation(api.functions.guichet.demanderPaiement, {
      method: "airtel_money",
      amountXaf: devis.totalTtc,
      payerPhone: "+241 77 00 11 22",
    })
    // Avant confirmation, la vente refuse le paiement.
    await expect(
      ctx.mutation(api.functions.ancillaries.sellBaggage, {
        ticketId: tenue.billets[0]!.id,
        weightKg: 12,
        senderName: "NZÉ Aimée",
        method: "airtel_money",
        paymentId: demande.paiementId,
      })
    ).rejects.toThrow(/attend sa confirmation/)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const bagage = await ctx.mutation(api.functions.ancillaries.sellBaggage, {
      ticketId: tenue.billets[0]!.id,
      weightKg: 12,
      senderName: "NZÉ Aimée",
      pieceCount: 2,
      description: "Valise, sac",
      method: "airtel_money",
      paymentId: demande.paiementId,
    })
    expect(bagage.paymentMethod).toBe("airtel_money")
    // Un paiement ne règle qu'une vente.
    await expect(
      ctx.mutation(api.functions.ancillaries.sellBaggage, {
        ticketId: tenue.billets[0]!.id,
        weightKg: 12,
        senderName: "NZÉ Aimée",
        method: "airtel_money",
        paymentId: demande.paiementId,
      })
    ).rejects.toThrow(/déjà réglé/)
  })
})

describe("Après-vente", () => {
  async function venteEncaissee(t: T) {
    const fx = await seedTrip(t)
    const vendeur = await asAgent(t, fx.pos)
    const tenue = await tenir(vendeur.ctx, fx, ["1A"])
    await vendeur.ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "especes",
      tendered: tenue.montants.ttc,
    })
    return { fx, vendeur, tenue }
  }

  it("annule : la place repart à la vente et les espèces sortent de la caisse", async () => {
    const t = convexTest(schema, modules)
    const { fx, vendeur, tenue } = await venteEncaissee(t)
    const annulation = await vendeur.ctx.mutation(api.functions.sales.cancel, {
      saleId: tenue.venteId,
      reason: "Erreur de trajet",
    })
    expect(annulation.paymentMethod).toBe("especes")
    const caisse = await vendeur.ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.expectedByMethod).toEqual([{ method: "especes", amountXaf: 0, count: 2 }])
    const plan = await vendeur.ctx.query(api.functions.trips.availableSeats, {
      tripId: fx.tripId,
      fromIndex: 0,
      toIndex: 2,
      serviceClass: "DEUXIEME",
    })
    expect(plan.every((s) => s.isFree)).toBe(true)
  })

  it("rembourse avec la pénalité du paramétrage, jamais saisie au guichet", async () => {
    const t = convexTest(schema, modules)
    const { fx, tenue } = await venteEncaissee(t)
    const chef = await asAgent(t, fx.pos, "chef_gare", false)
    const remboursement = await chef.ctx.mutation(api.functions.guichet.rembourser, {
      venteId: tenue.venteId,
      motif: "Voyage annulé par le client",
    })
    expect(remboursement?.penaltyPct).toBe(10)
    expect(remboursement?.refundedTtc).toBe(Math.round(tenue.montants.ttc * 0.9 * 100) / 100)
  })

  it("réserve le remboursement aux rôles habilités", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, tenue } = await venteEncaissee(t)
    await expect(
      vendeur.ctx.mutation(api.functions.guichet.rembourser, {
        venteId: tenue.venteId,
        motif: "Voyage annulé par le client",
      })
    ).rejects.toThrow(/Accès refusé/)
  })

  it("interdit d'annuler ou de rembourser un billet contrôlé à bord", async () => {
    const t = convexTest(schema, modules)
    const { fx, vendeur, tenue } = await venteEncaissee(t)
    await t.run(async (c) => c.db.patch(tenue.billets[0]!.id, { status: "utilise", usedAt: Date.now() }))
    const dossier = await vendeur.ctx.query(api.functions.guichet.vente, { venteId: tenue.venteId })
    expect(dossier?.actions).toMatchObject({ controle: true, annulation: false, remboursement: false })
    expect(dossier?.resume.etat).toBe("controle")
    await expect(
      vendeur.ctx.mutation(api.functions.sales.cancel, { saleId: tenue.venteId, reason: "Erreur" })
    ).rejects.toThrow(/contrôlé/)
    const chef = await asAgent(t, fx.pos, "chef_gare", false)
    await expect(
      chef.ctx.mutation(api.functions.guichet.rembourser, {
        venteId: tenue.venteId,
        billetIds: [tenue.billets[0]!.id],
        motif: "Voyage annulé par le client",
      })
    ).rejects.toThrow(/contrôlé/)
  })

  it("retrouve une opération par un numéro de billet", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, tenue } = await venteEncaissee(t)
    const trouvees = await vendeur.ctx.query(api.functions.guichet.operations, {
      periode: "jour",
      numero: tenue.billets[0]!.numero,
    })
    expect(trouvees.map((o) => o.id)).toEqual([tenue.venteId])
    const jour = await vendeur.ctx.query(api.functions.guichet.operations, { periode: "jour" })
    expect(jour[0]).toMatchObject({ produit: "billet", etat: "emis", client: "Aimée NZÉ", moyen: "especes" })
  })
})

describe("Politique de remboursement", () => {
  const politique = {
    penaliteAvantSeuilPct: 10,
    penaliteApresSeuilPct: 30,
    seuilHeures: 2,
    apresDepart: false,
    motifs: [],
    provisoire: true,
  }
  const maintenant = Date.parse("2026-10-01T10:00:00Z")

  it("applique le taux selon le délai avant départ", () => {
    expect(penaliteRemboursement(politique, { status: "planifie", departureAt: maintenant + 5 * 3_600_000, delayMinutes: 0 }, maintenant)).toMatchObject({ penalitePct: 10 })
    expect(penaliteRemboursement(politique, { status: "planifie", departureAt: maintenant + 3_600_000, delayMinutes: 0 }, maintenant)).toMatchObject({ penalitePct: 30 })
  })

  it("rembourse sans pénalité une desserte supprimée", () => {
    expect(penaliteRemboursement(politique, { status: "annule", departureAt: maintenant - 3_600_000, delayMinutes: 0 }, maintenant)).toMatchObject({ autorise: true, penalitePct: 0 })
  })

  it("refuse après le départ, retard compris", () => {
    expect(penaliteRemboursement(politique, { status: "retarde", departureAt: maintenant - 60 * 60_000, delayMinutes: 30 }, maintenant).autorise).toBe(false)
    expect(penaliteRemboursement(politique, { status: "retarde", departureAt: maintenant - 20 * 60_000, delayMinutes: 30 }, maintenant)).toMatchObject({ penalitePct: 30 })
  })
})

describe("Caisse", () => {
  it("refuse un billetage d'ouverture qui ne fait pas le fonds déclaré", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos, "vendeur_guichet", false)
    await expect(
      ctx.mutation(api.functions.cash.openSession, {
        openingFloatXaf: 50_000,
        openingBreakdown: [{ denomination: 10_000, count: 4 }],
      })
    ).rejects.toThrow(/recomptez/)
  })

  it("clôture au billetage, fonds compris, avec l'attendu par moyen", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos, "vendeur_guichet", false)
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 50_000,
      openingBreakdown: [
        { denomination: 10_000, count: 3 },
        { denomination: 5_000, count: 4 },
      ],
      emergencyBooklet: { number: "0042", firstNumber: "PP-004201", lastNumber: "PP-004250" },
    })
    const tenue = await tenir(ctx, fx, ["1A"])
    await ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "especes",
      tendered: tenue.montants.ttc,
    })
    const ttc = tenue.montants.ttc
    const detail = await ctx.query(api.functions.guichet.caisse, {})
    expect(detail?.attendu).toEqual([{ method: "especes", amountXaf: ttc, count: 1 }])
    expect(detail?.carnet?.number).toBe("0042")

    // Billetage : fonds + recette, à 500 près en moins → écart justifié.
    const billets = Math.floor((50_000 + ttc - 500) / 1_000)
    const pieces = 50_000 + ttc - 500 - billets * 1_000
    const billetage = [
      { denomination: 1_000, count: billets },
      ...(pieces > 0 ? [{ denomination: 5, count: pieces / 5 }] : []),
    ]
    await expect(
      ctx.mutation(api.functions.cash.closeSession, {
        countedByMethod: [{ method: "especes", amountXaf: ttc - 500 }],
        closingBreakdown: billetage,
      })
    ).rejects.toThrow(/justification est obligatoire/)
    const cloture = await ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: ttc - 500 }],
      closingBreakdown: billetage,
      varianceReason: "Pièce de 500 rendue en trop",
    })
    expect(cloture.varianceXaf).toBe(-500)
    const historique = await ctx.query(api.functions.guichet.sessionsCaisse, {})
    expect(historique[0]).toMatchObject({ statut: "cloturee", ecart: -500, operations: 1 })
  })
})

describe("Ventes manuelles", () => {
  it("tient une place pour la souche et signale les souches manquantes", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx, userId } = await asAgent(t, fx.pos, "vendeur_guichet", false)
    await ctx.mutation(api.functions.cash.openSession, {
      openingFloatXaf: 0,
      emergencyBooklet: { number: "0042", firstNumber: "PP-004201", lastNumber: "PP-004250" },
    })
    const enregistrement = await ctx.mutation(api.functions.manualSales.recordManualSale, {
      preprintedNumber: "PP-004203",
      soldAt: Date.now(),
      originalSellerId: userId,
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengerName: "ESSONO Blaise",
      amountReceivedXaf: 32_500,
    })
    expect(enregistrement.seat).toEqual({ coachLabel: "V4", seatLabel: "1A" })

    const carnet = await ctx.query(api.functions.guichet.ventesManuelles, {})
    expect(carnet.sequence?.manquantes).toEqual(["PP-004201", "PP-004202"])
    expect(carnet.indicateurs).toMatchObject({ ressaisies: 1, encaisse: 32_500 })
    expect(carnet.souches[0]).toMatchObject({ voyageur: "ESSONO Blaise", billet: { voiture: "V4", place: "1A" } })

    // La souche est dans le tiroir du vendeur : elle compte à la clôture.
    const caisse = await ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.expectedByMethod).toEqual([{ method: "especes", amountXaf: 32_500, count: 1 }])
  })
})

describe("Recherche de dessertes au guichet", () => {
  it("chiffre chaque classe au tarif du guichet, pour le groupe saisi", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const dessertes = await ctx.query(api.functions.guichet.dessertes, {
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceDate: fx.serviceDate,
      discountCodes: ["", "ENFANT"],
    })
    expect(dessertes).toHaveLength(1)
    const deuxieme = dessertes[0]!.classes.DEUXIEME!
    expect(deuxieme.disponibles).toBe(4)
    expect(deuxieme.totalTtc).toBe(deuxieme.lignes[0]! + deuxieme.lignes[1]!)
    expect(deuxieme.lignes[1]).toBeLessThan(deuxieme.prixAdulteTtc!)
    const devis = await ctx.query(api.functions.sales.quoteCounterSale, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengerCount: 2,
      discountCodes: ["", "ENFANT"],
    })
    expect(devis.totalTtc).toBe(deuxieme.totalTtc)
  })

  it("annonce les départs de la gare du point de vente", async () => {
    const t = convexTest(schema, modules)
    const fx = await seedTrip(t)
    const { ctx } = await asAgent(t, fx.pos)
    const accueil = await ctx.query(api.functions.guichet.accueil, {})
    expect(accueil.station?.code).toBe("OWE")
    expect(accueil.indicateurs.especesAttendues).toBe(50_000)
    // La desserte de test circule dans trois jours : hors de l'accueil.
    expect(accueil.departs).toEqual([])
  })
})

describe("Après-vente du réseau (encadrants)", () => {
  async function venteDuVendeur(t: T) {
    const fx = await seedTrip(t)
    const vendeur = await asAgent(t, fx.pos)
    const tenue = await tenir(vendeur.ctx, fx, ["1A"])
    await vendeur.ctx.mutation(api.functions.guichet.encaisserBillets, {
      venteId: tenue.venteId,
      voyageurs: voyageurs(tenue),
      method: "especes",
      tendered: tenue.montants.ttc,
    })
    return { fx, vendeur, tenue }
  }

  async function encadrant(t: T, role: AppRole, posId?: Id<"pointsOfSale">) {
    const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
    await t.run(async (ctx) =>
      ctx.db.insert("users", { authId, firstName: "Démo", lastName: "Encadrant", role, pointOfSaleId: posId, identitySource: "annuaire", isActive: true })
    )
    return t.withIdentity({ subject: authId })
  }

  it("limite le chef de gare rattaché à sa gare, ouvre le réseau au contrôle des recettes", async () => {
    const t = convexTest(schema, modules)
    const { fx, tenue } = await venteDuVendeur(t)
    const autreGare = await t.run(async (ctx) => {
      const station = await ctx.db.insert("stations", { code: "LTV", name: "Lastourville", province: "Ogooué-Lolo", kilometerPoint: 508, isEquipped: true, isActive: true })
      return await ctx.db.insert("pointsOfSale", { code: "LTV-PV", name: "Gare de Lastourville", type: "gare", stationId: station, counters: { passengers: 1, baggage: 1, parcels: 1 }, isActive: true })
    })
    const chefAilleurs = await encadrant(t, "chef_gare", autreGare)
    const perimetre = await chefAilleurs.query(api.functions.guichet.perimetreApresVente, {})
    expect(perimetre.mode).toBe("gare")
    expect(perimetre.pointsDeVente.map((p) => p.code)).toEqual(["LTV-PV"])
    expect(await chefAilleurs.query(api.functions.guichet.operationsReseau, { periode: "jour" })).toEqual([])
    // Un numéro exact se retrouve partout : le voyageur présente son billet.
    const trouvee = await chefAilleurs.query(api.functions.guichet.operationsReseau, { periode: "jour", numero: tenue.billets[0]!.numero })
    expect(trouvee.map((o) => o.id)).toEqual([tenue.venteId])
    await expect(chefAilleurs.query(api.functions.guichet.operationsReseau, { periode: "jour", pointOfSaleId: fx.pos })).rejects.toThrow(/hors de votre périmètre/)

    const recettes = await encadrant(t, "controleur_recettes")
    const reseau = await recettes.query(api.functions.guichet.perimetreApresVente, {})
    expect(reseau.mode).toBe("reseau")
    expect(reseau.droits).toEqual({ annuler: false, rembourser: true, dupliquer: false })
    const liste = await recettes.query(api.functions.guichet.operationsReseau, { periode: "jour", pointOfSaleId: fx.pos })
    expect(liste[0]).toMatchObject({ id: tenue.venteId, pointDeVente: { code: "OWE-PV" } })
  })

  it("laisse la vendeuse consulter sa gare, sans droit de rembourser", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, tenue } = await venteDuVendeur(t)
    const perimetre = await vendeur.ctx.query(api.functions.guichet.perimetreApresVente, {})
    expect(perimetre).toMatchObject({ mode: "gare", droits: { annuler: true, rembourser: false, dupliquer: true } })
    await expect(
      vendeur.ctx.mutation(api.functions.guichet.rembourser, { venteId: tenue.venteId, motif: "Voyage annulé par le client" })
    ).rejects.toThrow(/Accès refusé/)
  })

  it("rembourse sur la caisse d'origine encore ouverte, sinon hors caisse", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, tenue } = await venteDuVendeur(t)
    const chefVente = await encadrant(t, "chef_vente")
    const dossier = await chefVente.query(api.functions.guichet.vente, { venteId: tenue.venteId })
    expect(dossier?.caisseSortie?.mode).toBe("origine")
    const remboursement = await chefVente.mutation(api.functions.guichet.rembourser, { venteId: tenue.venteId, motif: "Voyage annulé par le client" })
    expect(remboursement?.caisse).toBe("origine")
    // L'argent sort du tiroir de la vendeuse : son attendu en tient compte.
    const caisse = await vendeur.ctx.query(api.functions.cash.mySession, {})
    expect(caisse?.expectedByMethod[0]?.amountXaf).toBe(tenue.montants.ttc - (remboursement?.refundedTtc ?? 0))
    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    expect(logs.find((l) => l.action === "vente.rembourser")?.after).toContain("origine")
  })

  it("rembourse hors caisse quand la caisse d'origine est clôturée", async () => {
    const t = convexTest(schema, modules)
    const { vendeur, tenue } = await venteDuVendeur(t)
    await vendeur.ctx.mutation(api.functions.cash.closeSession, {
      countedByMethod: [{ method: "especes", amountXaf: tenue.montants.ttc }],
    })
    const chef = await encadrant(t, "chef_gare")
    const remboursement = await chef.mutation(api.functions.guichet.rembourser, { venteId: tenue.venteId, motif: "Voyage annulé par le client" })
    expect(remboursement?.caisse).toBe("hors_caisse")
    const ecriture = await t.run(async (c) => c.db.get(remboursement!.refundId))
    expect(ecriture?.cashSessionId).toBeUndefined()
    expect(ecriture?.accountingDayId).toBeDefined()
  })

  it("rembourse sur la caisse de l'agent quand il en tient une", async () => {
    const t = convexTest(schema, modules)
    const { fx, tenue } = await venteDuVendeur(t)
    const admin = await asAgent(t, fx.pos, "admin_fonctionnel")
    const remboursement = await admin.ctx.mutation(api.functions.guichet.rembourser, { venteId: tenue.venteId, motif: "Erreur de vente au guichet" })
    expect(remboursement?.caisse).toBe("agent")
  })
})
