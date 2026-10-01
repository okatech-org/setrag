import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import appSchema from "../../schema"
import { modules } from "../../test.setup"

const q = api.modules.infrastructure.queries
const m = api.modules.infrastructure.mutations
const seed = internal.modules.infrastructure.seed

type TestInstance = ReturnType<typeof convexTest>

const HEURE = 3_600_000
const JOUR = 24 * HEURE

async function utilisateur(t: TestInstance, authId: string, role: AppRole) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      firstName: authId,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function activer(t: TestInstance, changedBy: Id<"users">) {
  await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "infrastructure",
      environment: "test",
      isEnabled: true,
      reason: "Test du module Infrastructures",
      correlationId: `infra-${Math.random()}`,
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

/** Trois sections : 0–35 à 80 km/h, 35–57 à 70 km/h, 57–85 à 60 km/h. */
async function sections(t: TestInstance) {
  return await t.run(async (ctx) => {
    const ids: Id<"infraSections">[] = []
    const defs = [
      ["S01", "Owendo – Ntoum", 0, 35, 80],
      ["S02", "Ntoum – Andem", 35, 57, 70],
      ["S03", "Andem – Mbel", 57, 85, 60],
    ] as const
    for (const [code, libelle, pkDebut, pkFin, vitesse] of defs) {
      ids.push(
        await ctx.db.insert("infraSections", {
          code,
          libelle,
          pkDebut,
          pkFin,
          district: "District d'Owendo",
          brigade: `Brigade ${code}`,
          vitesseNominaleKmh: vitesse,
          typeTraverse: "beton_bibloc",
          partBetonPct: 100,
          armement: "UIC 50",
          etat: "bon",
          majLe: Date.now(),
        })
      )
    }
    return ids
  })
}

async function circulations(t: TestInstance, createdBy: Id<"users">) {
  await t.run(async (ctx) => {
    const gare = async (code: string, name: string, kilometerPoint: number) =>
      await ctx.db.insert("stations", {
        code,
        name,
        province: "Estuaire",
        kilometerPoint,
        isEquipped: true,
        isActive: true,
      })
    const owe = await gare("OWE", "Owendo Virié", 0)
    const ntm = await gare("NTM", "Ntoum", 35)
    const and = await gare("AND", "Andem", 57)
    const bookletId = await ctx.db.insert("timetableBooklets", {
      label: "Livret de test",
      validFrom: Date.now() - JOUR,
      validUntil: Date.now() + 30 * JOUR,
      status: "actif",
      createdBy,
    })
    const trainId = await ctx.db.insert("trains", {
      number: "E101",
      name: "Express",
      type: "EXPRESS",
      isActive: true,
    })
    const depart = Date.now() + 2 * JOUR
    const trajet = async (
      trainNumber: string,
      originStationId: Id<"stations">,
      destinationStationId: Id<"stations">,
      status: "planifie" | "annule"
    ) =>
      await ctx.db.insert("trips", {
        bookletId,
        trainId,
        trainNumber,
        trainType: "EXPRESS",
        serviceDate: "2026-10-03",
        departureAt: depart,
        arrivalAt: depart + 3 * HEURE,
        originStationId,
        destinationStationId,
        status,
        delayMinutes: 0,
        segmentCount: 2,
        isOpenForSale: true,
      })
    await trajet("E101", owe, and, "planifie")
    await trajet("E102", ntm, owe, "planifie")
    await trajet("E103", owe, and, "annule")
    await trajet("E104", and, ntm, "planifie")
  })
}

describe("Module Infrastructures", () => {
  beforeEach(() => {
    vi.stubEnv("SETRAG_ENV", "test")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("refuse tout accès tant que le module n'est pas activé", async () => {
    const t = convexTest(appSchema, modules)
    const { client } = await utilisateur(t, "voie", "agent_voie")
    await expect(client.query(q.droits, {})).rejects.toThrow(
      "Module désactivé : infrastructure"
    )
  })

  it("mène une anomalie du signalement à la clôture, avec séparation des tâches", async () => {
    const t = convexTest(appSchema, modules)
    const voie = await utilisateur(t, "voie", "agent_voie")
    const prn = await utilisateur(t, "prn", "responsable_prn")
    await activer(t, prn.userId)
    const [s1] = await sections(t)

    const { anomalieId, numero } = await voie.client.mutation(m.signalerAnomalie, {
      pk: 12.4,
      categorie: "rail",
      gravite: "elevee",
      description: "Éclisse fissurée",
    })
    expect(numero).toMatch(/^AN-\d{4}-0001$/)

    await expect(
      voie.client.mutation(m.cloreAnomalie, { anomalieId })
    ).rejects.toThrow("Transition refusée")
    await voie.client.mutation(m.prendreEnChargeAnomalie, { anomalieId })
    await voie.client.mutation(m.traiterAnomalie, {
      anomalieId,
      traitement: "Éclisse remplacée",
    })
    await expect(voie.client.mutation(m.cloreAnomalie, { anomalieId })).rejects.toThrow(
      "Séparation des tâches"
    )
    await prn.client.mutation(m.cloreAnomalie, { anomalieId })

    const detail = await voie.client.query(q.anomalie, { anomalieId })
    expect(detail?.anomalie).toMatchObject({
      numero,
      statut: "close",
      sectionId: s1,
      sectionLibelle: "Owendo – Ntoum",
      brigade: "Brigade S01",
      traiteParNom: "voie",
      closParNom: "prn",
      enRetard: false,
    })
    expect(detail!.anomalie.echeanceLe - detail!.anomalie.signaleLe).toBe(7 * JOUR)
    expect(detail?.chronologie.map((e) => e.type)).toEqual([
      "anomalie_close",
      "anomalie_traitee",
      "anomalie_prise_en_charge",
      "anomalie_signalee",
    ])
    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect())
    expect(audits.map((a) => a.action)).toContain("infrastructure.anomalie_close")
  })

  it("pose, contrôle et lève une LTV, et calcule les trains impactés", async () => {
    const t = convexTest(appSchema, modules)
    const prn = await utilisateur(t, "prn", "responsable_prn")
    await activer(t, prn.userId)
    await sections(t)
    await circulations(t, prn.userId)

    const { ltvId, numero, vitesseNominaleKmh } = await prn.client.mutation(m.poserLtv, {
      pkDebut: 10,
      pkFin: 12,
      vitesseKmh: 40,
      motif: "Défaut de nivellement",
    })
    expect(numero).toMatch(/^LTV-\d{4}-0001$/)
    expect(vitesseNominaleKmh).toBe(80)

    await expect(
      prn.client.mutation(m.poserLtv, { pkDebut: 30, pkFin: 40, vitesseKmh: 70, motif: "Essai" })
    ).rejects.toThrow("inférieure à la vitesse nominale de la plage (70 km/h)")
    await expect(
      prn.client.mutation(m.poserLtv, { pkDebut: 20, pkFin: 21, vitesseKmh: 5, motif: "Essai" })
    ).rejects.toThrow("10 km/h")
    await expect(
      prn.client.mutation(m.poserLtv, { pkDebut: 11, pkFin: 13, vitesseKmh: 30, motif: "Essai" })
    ).rejects.toThrow("recouvre déjà")

    const detail = await prn.client.query(q.ltv, { ltvId })
    expect(detail?.ltv).toMatchObject({ longueurKm: 2, perteTempsMinutes: 2.5, statut: "active" })
    expect(detail?.trainsImpactes.map((train) => train.trainNumber).sort()).toEqual([
      "E101",
      "E102",
    ])
    const accueil = await prn.client.query(q.accueil, {})
    expect(accueil.indicateurs.ltv).toEqual({ actives: 1, kmSousLtv: 2, perteTempsMinutes: 2.5 })
    expect(accueil.ligne.gares.map((g) => [g.nom, g.majeure])).toEqual([
      ["Owendo Virié", true],
      ["Ntoum", false],
      ["Andem", true],
    ])

    await prn.client.mutation(m.leverLtv, { ltvId, motif: "Relevage réalisé" })
    await expect(
      prn.client.mutation(m.leverLtv, { ltvId, motif: "Encore" })
    ).rejects.toThrow("Transition refusée")
    const seconde = await prn.client.mutation(m.poserLtv, {
      pkDebut: 11,
      pkFin: 13,
      vitesseKmh: 30,
      motif: "Nouveau défaut",
    })
    expect(seconde.numero).toMatch(/-0002$/)
  })

  it("distingue les droits du cantonnier, du bailleur et de l'administration système", async () => {
    const t = convexTest(appSchema, modules)
    const cantonnier = await utilisateur(t, "cantonnier", "cantonnier")
    const bailleur = await utilisateur(t, "bailleur", "bailleur_fonds")
    const adminIt = await utilisateur(t, "dsi", "admin_it")
    await activer(t, adminIt.userId)
    await sections(t)

    expect(await cantonnier.client.query(q.droits, {})).toEqual({
      peutEcrire: true,
      capacites: ["anomalie_signaler"],
      partenaire: false,
      role: "cantonnier",
    })
    await cantonnier.client.mutation(m.signalerAnomalie, {
      pk: 40,
      categorie: "vegetation",
      gravite: "faible",
      description: "Arbre penché vers la voie",
    })
    await expect(
      cantonnier.client.mutation(m.poserLtv, { pkDebut: 1, pkFin: 2, vitesseKmh: 30, motif: "x" })
    ).rejects.toThrow("Accès refusé")

    expect(await bailleur.client.query(q.droits, {})).toMatchObject({
      peutEcrire: false,
      capacites: [],
      partenaire: true,
    })
    const rapport = await bailleur.client.query(q.rapportBailleur, { bailleur: "afd" })
    expect(rapport).toMatchObject({ bailleur: "afd", bailleurLibelle: "AFD", chantiers: [] })
    await expect(
      bailleur.client.mutation(m.signalerAnomalie, {
        pk: 1,
        categorie: "autre",
        gravite: "faible",
        description: "x",
      })
    ).rejects.toThrow("Accès refusé")

    expect(await adminIt.client.query(q.droits, {})).toMatchObject({
      peutEcrire: false,
      capacites: [],
    })
    await expect(
      adminIt.client.mutation(m.signalerAnomalie, {
        pk: 1,
        categorie: "autre",
        gravite: "faible",
        description: "x",
      })
    ).rejects.toThrow("Accès refusé")
  })

  it("interdit de valider sa propre situation d'avancement et plafonne les quantités", async () => {
    const t = convexTest(appSchema, modules)
    const p1 = await utilisateur(t, "prn1", "responsable_prn")
    const p2 = await utilisateur(t, "prn2", "responsable_prn")
    const bailleur = await utilisateur(t, "bailleur", "bailleur_fonds")
    await activer(t, p1.userId)

    const { chantierId } = await p1.client.mutation(m.creerChantier, {
      code: "prn-t1",
      libelle: "Traverses béton",
      description: "Chantier de test",
      nature: "traverses_beton",
      pkDebut: 0,
      pkFin: 35,
      entreprise: "Entreprise test",
      maitreOeuvre: "SETRAG",
      budgetFcfa: 1_000_000,
      financements: [
        { bailleur: "afd", montantFcfa: 600_000 },
        { bailleur: "etat", montantFcfa: 400_000 },
      ],
      uniteQuantite: "traverses",
      quantitePrevue: 100,
      debutLe: Date.now() - 30 * JOUR,
      finPrevueLe: Date.now() + 300 * JOUR,
    })
    const periode = new Date(Date.now() - 40 * JOUR).toISOString().slice(0, 7)
    await expect(
      p1.client.mutation(m.saisirAvancement, {
        chantierId,
        periode,
        quantite: 10,
        montantTravauxFcfa: 100_000,
        montantPayeFcfa: 50_000,
      })
    ).rejects.toThrow("chantier en cours")
    await p1.client.mutation(m.modifierChantier, { chantierId, statut: "en_cours" })
    await expect(
      p1.client.mutation(m.modifierChantier, { chantierId, statut: "etude" })
    ).rejects.toThrow("Transition refusée")

    const { avancementId } = await p1.client.mutation(m.saisirAvancement, {
      chantierId,
      periode,
      quantite: 60,
      montantTravauxFcfa: 600_000,
      montantPayeFcfa: 450_000,
      bailleur: "afd",
    })
    await expect(
      p1.client.mutation(m.validerAvancement, { avancementId })
    ).rejects.toThrow("Séparation des tâches")
    await p2.client.mutation(m.validerAvancement, { avancementId })

    await expect(
      p1.client.mutation(m.saisirAvancement, {
        chantierId,
        periode,
        quantite: 51,
        montantTravauxFcfa: 0,
        montantPayeFcfa: 0,
      })
    ).rejects.toThrow("110 %")
    await expect(
      p1.client.mutation(m.saisirAvancement, {
        chantierId,
        periode,
        quantite: 1,
        montantTravauxFcfa: 0,
        montantPayeFcfa: 600_000,
      })
    ).rejects.toThrow("budget")

    const { jalonId } = await p1.client.mutation(m.ajouterJalon, {
      chantierId,
      libelle: "Tranche 2",
      prevuLe: Date.now() - JOUR,
      conditionDecaissement: true,
      bailleur: "afd",
    })
    const rapport = await bailleur.client.query(q.rapportBailleur, { bailleur: "afd" })
    expect(rapport.chantiers).toHaveLength(1)
    expect(rapport.chantiers[0]).toMatchObject({
      code: "PRN-T1",
      montantBailleurFcfa: 600_000,
      partBailleurPct: 60,
      avancementPhysiquePct: 60,
      avancementFinancierPct: 45,
      engageFcfa: 600_000,
      payeFcfa: 450_000,
    })
    expect(rapport.chantiers[0]?.jalonsDecaissement).toMatchObject([
      { id: jalonId, statut: "en_retard", bailleurLibelle: "AFD" },
    ])
    expect(rapport.totaux.jalonsDecaissementEnAttente).toBe(1)
  })

  it("refuse d'accorder une plage travaux en conflit ou demandée par soi-même", async () => {
    const t = convexTest(appSchema, modules)
    const voie = await utilisateur(t, "voie", "agent_voie")
    const prn = await utilisateur(t, "prn", "responsable_prn")
    await activer(t, prn.userId)
    const demain = Date.now() + JOUR

    await expect(
      voie.client.mutation(m.demanderIntervention, {
        libelle: "Trop long",
        type: "entretien_voie",
        pkDebut: 10,
        pkFin: 15,
        debutLe: demain,
        finLe: demain + 73 * HEURE,
        interruption: true,
        equipe: "Brigade",
      })
    ).rejects.toThrow("72 heures")

    const premiere = await voie.client.mutation(m.demanderIntervention, {
      libelle: "Bourrage",
      type: "entretien_voie",
      pkDebut: 10,
      pkFin: 15,
      debutLe: demain,
      finLe: demain + 4 * HEURE,
      interruption: true,
      equipe: "Brigade d'Owendo",
    })
    await prn.client.mutation(m.accorderIntervention, {
      interventionId: premiere.interventionId,
    })
    const seconde = await voie.client.mutation(m.demanderIntervention, {
      libelle: "Maintenance des signaux",
      type: "signalisation",
      pkDebut: 12,
      pkFin: 14,
      debutLe: demain + 2 * HEURE,
      finLe: demain + 6 * HEURE,
      interruption: false,
      equipe: "Équipe signalisation",
    })
    await expect(
      prn.client.mutation(m.accorderIntervention, { interventionId: seconde.interventionId })
    ).rejects.toThrow(`Conflit : la plage recoupe ${premiere.numero}`)
    const detail = await prn.client.query(q.intervention, {
      interventionId: seconde.interventionId,
    })
    expect(detail?.conflits.map((c) => c.numero)).toEqual([premiere.numero])

    const propre = await prn.client.mutation(m.demanderIntervention, {
      libelle: "Inspection",
      type: "ouvrage",
      pkDebut: 50,
      pkFin: 51,
      debutLe: demain,
      finLe: demain + 2 * HEURE,
      interruption: false,
      equipe: "Brigade ouvrages",
    })
    await expect(
      prn.client.mutation(m.accorderIntervention, { interventionId: propre.interventionId })
    ).rejects.toThrow("Séparation des tâches")
  })

  it("valide une inspection par un autre agent et met à jour la cotation", async () => {
    const t = convexTest(appSchema, modules)
    const oa = await utilisateur(t, "oa", "agent_ouvrages_ponts")
    const prn = await utilisateur(t, "prn", "responsable_prn")
    await activer(t, prn.userId)
    await sections(t)
    const { ouvrageId } = await oa.client.mutation(m.creerOuvrage, {
      code: "oa-pt-12",
      nom: "Pont test",
      type: "pont",
      pk: 12,
      longueurM: 40,
      materiau: "Béton armé",
      anneeConstruction: 1978,
    })
    const { inspectionId } = await oa.client.mutation(m.creerInspection, {
      ouvrageId,
      type: "inspection_detaillee",
      dateInspection: Date.now() - JOUR,
      constats: "Affouillement en pied de pile",
      desordres: [{ partie: "Piles", description: "Affouillement", gravite: "elevee" }],
      cotationProposee: "3",
    })
    await expect(
      oa.client.mutation(m.validerInspection, { inspectionId })
    ).rejects.toThrow("Séparation des tâches")
    const resultat = await prn.client.mutation(m.validerInspection, { inspectionId })
    expect(resultat).toMatchObject({
      cotation: "3",
      surveillanceRenforcee: true,
      periodiciteMois: 6,
    })
    const rapport = await oa.client.query(q.inspection, { inspectionId })
    expect(rapport?.inspection).toMatchObject({
      statut: "validee",
      cotationAvant: "1",
      valideParNom: "prn",
      inspecteurNom: "oa",
    })
    await expect(
      oa.client.mutation(m.modifierInspection, { inspectionId, constats: "x" })
    ).rejects.toThrow("Transition refusée")
  })
})

describe("Jeu de démonstration Infrastructures", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("refuse le peuplement sans DEMO_ACCOUNTS_ENABLED", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(appSchema, modules)
    await expect(t.mutation(seed.run, {})).rejects.toThrow(
      "DEMO_ACCOUNTS_ENABLED doit valoir true"
    )
  })

  it("peuple une fois, reste idempotent, se réinitialise, et alimente les lectures", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(appSchema, modules)
    const prn = await utilisateur(t, "prn", "responsable_prn")
    await utilisateur(t, "voie", "agent_voie")
    await utilisateur(t, "oa", "agent_ouvrages_ponts")
    await activer(t, prn.userId)

    const premier = await t.mutation(seed.run, {})
    expect(premier.deja).toBe(false)
    expect(premier).toMatchObject({
      sections: 22,
      ouvrages: 40,
      equipements: expect.any(Number),
      anomalies: 60,
      chantiers: 8,
      interventions: 40,
    })
    expect(premier.inspections).toBeGreaterThanOrEqual(55)
    expect(premier.equipements).toBeGreaterThanOrEqual(65)
    expect(premier.ltv).toBe(11)
    const statutsInterventions = new Set(
      await t.run(async (ctx) =>
        (await ctx.db.query("infraInterventions").collect()).map((i) => i.statut)
      )
    )
    expect([...statutsInterventions].sort()).toEqual(
      ["accordee", "annulee", "demandee", "en_cours", "refusee", "terminee"]
    )
    const statutsAnomalies = new Set(
      await t.run(async (ctx) =>
        (await ctx.db.query("infraAnomalies").collect()).map((a) => a.statut)
      )
    )
    expect(statutsAnomalies.size).toBe(5)
    const total = Object.entries(premier)
      .filter(([cle]) => cle !== "deja")
      .reduce((s, [, n]) => s + (n as number), 0)
    expect(total).toBeLessThan(5000)

    const second = await t.mutation(seed.run, {})
    expect(second).toEqual({ ...premier, deja: true })

    const reset = await t.mutation(seed.run, { reset: true })
    expect(reset).toEqual({ ...premier, deja: false })
    const numeros = await t.run(async (ctx) =>
      (await ctx.db.query("infraAnomalies").collect()).map((a) => a.numero)
    )
    expect(new Set(numeros).size).toBe(numeros.length)

    /* Toutes les lectures fonctionnent sur le jeu complet. */
    const accueil = await prn.client.query(q.accueil, {})
    expect(accueil.indicateurs.ltv.actives).toBe(3)
    expect(accueil.indicateurs.ouvrages.cotes3U).toBe(1)
    expect(accueil.indicateurs.ouvrages.cotes3).toBe(2)
    expect(accueil.indicateurs.prn.budgetFcfa).toBeGreaterThan(100_000_000_000)
    expect(accueil.priorites.length).toBeGreaterThan(0)
    expect(accueil.ligne.ltv).toHaveLength(3)

    const [listeSections, ouvrages, equipements, anomalies, ltvs, chantiers, interventions] =
      await Promise.all([
        prn.client.query(q.sections, {}),
        prn.client.query(q.ouvrages, {}),
        prn.client.query(q.equipements, {}),
        prn.client.query(q.anomalies, {}),
        prn.client.query(q.ltvs, {}),
        prn.client.query(q.chantiers, {}),
        prn.client.query(q.interventions, {}),
      ])
    expect(listeSections).toHaveLength(22)
    expect(await prn.client.query(q.section, { sectionId: listeSections[13]!.id })).not.toBeNull()
    expect(await prn.client.query(q.ouvrage, { ouvrageId: ouvrages[0]!.id })).not.toBeNull()
    expect(await prn.client.query(q.equipement, { equipementId: equipements[0]!.id })).not.toBeNull()
    expect(await prn.client.query(q.anomalie, { anomalieId: anomalies[0]!.id })).not.toBeNull()
    expect(await prn.client.query(q.ltv, { ltvId: ltvs[0]!.id })).not.toBeNull()
    const chantier = await prn.client.query(q.chantier, { chantierId: chantiers[0]!.id })
    expect(chantier?.avancements.length).toBeGreaterThan(0)
    expect(await prn.client.query(q.intervention, { interventionId: interventions[0]!.id })).not.toBeNull()
    const rapport = await prn.client.query(q.rapportBailleur, {})
    expect(rapport.chantiers).toHaveLength(8)
    expect(rapport.parBailleur.map((b) => b.bailleur).sort()).toEqual(
      ["afd", "etat", "meridiam", "proparco", "setrag", "sfi", "ue"]
    )
    const formulaires = await prn.client.query(q.formulaires, {})
    expect(formulaires.sections).toHaveLength(22)
  })
})
