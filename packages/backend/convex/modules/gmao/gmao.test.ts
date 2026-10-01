import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"

const nouveauTest = () => convexTest(schema, modules)
type T = ReturnType<typeof nouveauTest>

const gmao = api.modules.gmao
const JOUR = 86_400_000

async function agent(t: T, role: AppRole, authId: string) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      firstName: "Agent",
      lastName: authId,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function activer(t: T, changedBy: Id<"users">, isEnabled = true) {
  await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "gmao",
      environment: "test",
      isEnabled,
      reason: "Tests du module GMAO",
      correlationId: `gmao-${isEnabled}`,
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

/** Un atelier, un article en stock et une locomotive en service. */
async function parcMinimal(t: T) {
  return await t.run(async (ctx) => {
    const maintenant = Date.now()
    const atelierId = await ctx.db.insert("gmaoAteliers", {
      code: "OWE",
      nom: "Atelier central d'Owendo",
      kilometerPoint: 0,
      description: "Atelier de test",
      tauxHoraireFcfa: 20_000,
      isActive: true,
    })
    const articleId = await ctx.db.insert("gmaoArticles", {
      reference: "FRE-00001",
      designation: "Semelle de frein",
      famille: "Freinage",
      unite: "u",
      prixUnitaireFcfa: 30_000,
      fournisseur: "Fournisseur de test",
      delaiApproJours: 30,
      critique: true,
      compatibilite: "Locomotives",
      isActive: true,
      creeLe: maintenant,
      majLe: maintenant,
    })
    await ctx.db.insert("gmaoStocks", {
      articleId,
      atelierId,
      quantite: 10,
      seuilReappro: 4,
      quantiteReappro: 12,
      emplacement: "FRE-A1",
      majLe: maintenant,
    })
    const enginId = await ctx.db.insert("gmaoEquipements", {
      numero: "CC-2201",
      famille: "locomotive",
      serie: "CC 2200",
      constructeur: "General Electric",
      anneeMiseEnService: 2013,
      atelierId,
      statut: "en_service",
      statutDepuis: maintenant,
      compteurKm: 1_200_000,
      compteurHeures: 40_000,
      compteurReleveLe: maintenant - JOUR,
      proprietaire: "SETRAG",
      creeLe: maintenant,
      majLe: maintenant,
    })
    const wagonId = await ctx.db.insert("gmaoEquipements", {
      numero: "WTM-1001",
      famille: "wagon",
      serie: "Trémie minéralière 80 t",
      constructeur: "Astra",
      anneeMiseEnService: 2010,
      atelierId,
      statut: "en_service",
      statutDepuis: maintenant,
      compteurKm: 900_000,
      compteurHeures: 0,
      compteurReleveLe: maintenant - JOUR,
      proprietaire: "COMILOG",
      creeLe: maintenant,
      majLe: maintenant,
    })
    return { atelierId, articleId, enginId, wagonId }
  })
}

async function stock(t: T, articleId: Id<"gmaoArticles">) {
  return await t.run(async (ctx) => {
    const ligne = await ctx.db
      .query("gmaoStocks")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .first()
    return ligne?.quantite
  })
}

async function statutEngin(t: T, enginId: Id<"gmaoEquipements">) {
  return await t.run(async (ctx) => (await ctx.db.get(enginId))?.statut)
}

describe("module GMAO", () => {
  let t: T
  beforeEach(() => {
    t = nouveauTest()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("mène un OT de la demande à la remise en service en consommant le stock", async () => {
    const contremaitre = await agent(t, "contremaitre_atelier", "contremaitre")
    const ingenieur = await agent(t, "ingenieur_atelier", "ingenieur")
    const responsable = await agent(t, "responsable_atelier", "responsable")
    const magasinier = await agent(t, "magasinier", "magasinier")
    await activer(t, contremaitre.userId)
    const { atelierId, articleId, enginId } = await parcMinimal(t)

    const { otId, numero } = await contremaitre.client.mutation(gmao.mutations.creerOt, {
      equipementId: enginId,
      type: "correctif",
      priorite: "haute",
      titre: "Fuite sur la conduite générale",
      description: "Fuite audible au robinet de queue.",
      immobilisant: true,
    })
    expect(numero).toMatch(/^OT-\d{4}-0001$/)
    expect(await statutEngin(t, enginId)).toBe("en_service")

    await contremaitre.client.mutation(gmao.mutations.planifierOt, {
      otId,
      atelierId,
      equipe: "Équipe A",
      debutPrevu: Date.now(),
      finPrevue: Date.now() + JOUR,
    })
    await contremaitre.client.mutation(gmao.mutations.demarrerOt, { otId })
    expect(await statutEngin(t, enginId)).toBe("en_atelier")

    const temps = await contremaitre.client.mutation(gmao.mutations.saisirTemps, {
      otId,
      intervenant: "J. Moussavou",
      date: Date.now(),
      heures: 3.5,
    })
    expect(temps.montantFcfa).toBe(70_000)
    await expect(
      contremaitre.client.mutation(gmao.mutations.saisirTemps, {
        otId,
        intervenant: "J. Moussavou",
        date: Date.now(),
        heures: 3.3,
      })
    ).rejects.toThrow(/quart d'heure/)

    // Le magasinier sert la pièce sur l'OT : le stock baisse dans la même transaction.
    const sortie = await magasinier.client.mutation(gmao.mutations.consommerPiece, {
      otId,
      articleId,
      quantite: 4,
    })
    expect(sortie.quantiteRestante).toBe(6)
    expect(await stock(t, articleId)).toBe(6)
    await expect(
      magasinier.client.mutation(gmao.mutations.consommerPiece, { otId, articleId, quantite: 20 })
    ).rejects.toThrow(/Stock insuffisant/)
    expect(await stock(t, articleId)).toBe(6)

    await contremaitre.client.mutation(gmao.mutations.retournerPiece, { otId, articleId, quantite: 1 })
    expect(await stock(t, articleId)).toBe(7)
    await expect(
      contremaitre.client.mutation(gmao.mutations.retournerPiece, { otId, articleId, quantite: 4 })
    ).rejects.toThrow(/Retour refusé/)

    // Le contremaître ne réceptionne pas : la clôture revient à l'encadrement.
    await ingenieur.client.mutation(gmao.mutations.terminerTravaux, {
      otId,
      compteRendu: "Boyau remplacé, essai d'étanchéité conforme.",
    })
    await expect(contremaitre.client.mutation(gmao.mutations.cloturerOt, { otId })).rejects.toThrow(
      /Accès refusé/
    )
    // Séparation des tâches : celui qui a déclaré la fin ne remet pas en service.
    await expect(ingenieur.client.mutation(gmao.mutations.cloturerOt, { otId })).rejects.toThrow(
      /Séparation des tâches/
    )
    await responsable.client.mutation(gmao.mutations.cloturerOt, { otId, kmCloture: 1_200_050 })

    const dossier = await responsable.client.query(gmao.queries.ordreTravail, { otId })
    expect(dossier?.ot.statut).toBe("cloture")
    expect(dossier?.ot.coutMainOeuvreFcfa).toBe(70_000)
    expect(dossier?.ot.coutPiecesFcfa).toBe(90_000)
    expect(dossier?.pieces.map((piece) => piece.sens).sort()).toEqual(["entree", "sortie"])
    expect(dossier?.chronologie.map((evenement) => evenement.type)).toEqual(
      expect.arrayContaining(["creation", "planification", "demarrage", "temps", "piece", "fin_travaux", "cloture"])
    )
    expect(await statutEngin(t, enginId)).toBe("en_service")
    const engin = await t.run((ctx) => ctx.db.get(enginId))
    expect(engin?.compteurKm).toBe(1_200_050)
    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect())
    expect(audits.some((ligne) => ligne.action === "gmao.cloture" && ligne.permission === "valider")).toBe(true)
  })

  it("calcule les échéances préventives et ouvre les OT correspondants", async () => {
    const ingenieur = await agent(t, "ingenieur_atelier", "ingenieur")
    const responsable = await agent(t, "responsable_atelier", "responsable")
    await activer(t, ingenieur.userId)
    const { enginId } = await parcMinimal(t)

    const { planId, rattaches } = await ingenieur.client.mutation(gmao.mutations.creerPlan, {
      code: "loc-ip30",
      libelle: "Inspection 30 jours",
      famille: "locomotive",
      series: [],
      seuilJours: 30,
      alertePct: 15,
      dureeHeures: 6,
      immobilisant: true,
      operations: ["Essai de frein"],
      rattacherParc: true,
    })
    expect(rattaches).toBe(1)
    await expect(
      ingenieur.client.mutation(gmao.mutations.creerPlan, {
        code: "SANS-SEUIL",
        libelle: "Plan invalide",
        famille: "wagon",
        series: [],
        alertePct: 10,
        dureeHeures: 2,
        immobilisant: false,
        operations: ["Rien"],
        rattacherParc: false,
      })
    ).rejects.toThrow(/seuil/)

    // Dernière inspection il y a 40 jours : l'échéance est dépassée.
    await t.run(async (ctx) => {
      const rattachement = await ctx.db
        .query("gmaoPlansEquipements")
        .withIndex("by_plan", (q) => q.eq("planId", planId))
        .first()
      await ctx.db.patch(rattachement!._id, { derniereRealisationLe: Date.now() - 40 * JOUR })
    })
    const echeances = await ingenieur.client.query(gmao.queries.echeances, {})
    expect(echeances).toHaveLength(1)
    expect(echeances[0]).toMatchObject({ etat: "echue", planCode: "LOC-IP30", ot: null })

    const { crees } = await ingenieur.client.mutation(gmao.mutations.genererOtPreventifs, {
      planEquipementIds: [echeances[0]!.planEquipementId],
    })
    expect(crees).toHaveLength(1)
    const second = await ingenieur.client.mutation(gmao.mutations.genererOtPreventifs, {
      planEquipementIds: [echeances[0]!.planEquipementId],
    })
    expect(second).toEqual({ crees: [], ignores: 1 })

    const otId = crees[0]!.otId
    const ot = await ingenieur.client.query(gmao.queries.ordreTravail, { otId })
    expect(ot?.ot).toMatchObject({ type: "preventif", origine: "plan", immobilisant: true })
    const { atelierId } = (await t.run((ctx) => ctx.db.get(enginId)))!
    await ingenieur.client.mutation(gmao.mutations.planifierOt, {
      otId,
      atelierId,
      equipe: "Équipe B",
      debutPrevu: Date.now(),
      finPrevue: Date.now() + JOUR,
    })
    await ingenieur.client.mutation(gmao.mutations.demarrerOt, { otId })
    await ingenieur.client.mutation(gmao.mutations.saisirTemps, {
      otId,
      intervenant: "P. Ndong Mba",
      date: Date.now(),
      heures: 6,
    })
    await ingenieur.client.mutation(gmao.mutations.terminerTravaux, { otId, compteRendu: "Gamme réalisée." })
    await responsable.client.mutation(gmao.mutations.cloturerOt, { otId })

    // La réalisation remet l'échéance à zéro.
    expect(await ingenieur.client.query(gmao.queries.echeances, {})).toHaveLength(0)
    const plan = await ingenieur.client.query(gmao.queries.plan, { planId })
    expect(plan?.engins[0]).toMatchObject({ etat: "a_jour", otOuvertId: null })
  })

  it("bloque le départ d'un convoi déclaré inapte et immobilise l'engin fautif", async () => {
    const visiteur = await agent(t, "visiteur_rames", "visiteur")
    await activer(t, visiteur.userId)
    const { atelierId, enginId, wagonId } = await parcMinimal(t)

    const { visiteId, numero } = await visiteur.client.mutation(gmao.mutations.ouvrirVisite, {
      convoi: "MIN-712",
      atelierId,
      equipementIds: [enginId, wagonId],
    })
    expect(numero).toMatch(/^VT-/)
    await visiteur.client.mutation(gmao.mutations.majControles, {
      visiteId,
      controles: [{ code: "ESSIEUX", resultat: "defaut" }],
    })
    await expect(
      visiteur.client.mutation(gmao.mutations.signerVisite, { visiteId, aptitude: "inapte" })
    ).rejects.toThrow(/décrivez le défaut/)
    await visiteur.client.mutation(gmao.mutations.ajouterDefaut, {
      visiteId,
      equipementId: wagonId,
      organe: "Boîte d'essieu",
      description: "Boîte d'essieu chaude (92 °C)",
      gravite: "bloquant",
    })
    await expect(
      visiteur.client.mutation(gmao.mutations.signerVisite, { visiteId, aptitude: "apte" })
    ).rejects.toThrow(/Aptitude refusée/)
    await expect(
      visiteur.client.mutation(gmao.mutations.signerVisite, { visiteId, aptitude: "apte_sous_reserve" })
    ).rejects.toThrow(/Aptitude refusée/)

    const signature = await visiteur.client.mutation(gmao.mutations.signerVisite, {
      visiteId,
      aptitude: "inapte",
    })
    expect(signature.otIds).toHaveLength(1)
    expect(await statutEngin(t, wagonId)).toBe("immobilise")
    expect(await statutEngin(t, enginId)).toBe("en_service")

    const dossier = await visiteur.client.query(gmao.queries.visite, { visiteId })
    expect(dossier?.decision.autorise).toBe(false)
    expect(dossier?.decision.motifs.join(" ")).toMatch(/inapte/)
    expect(dossier?.ordres[0]).toMatchObject({ priorite: "urgente", statut: "demande" })
    await expect(
      visiteur.client.mutation(gmao.mutations.ajouterDefaut, {
        visiteId,
        equipementId: enginId,
        organe: "Frein",
        description: "Après signature",
        gravite: "mineur",
      })
    ).rejects.toThrow(/signée/)
  })

  it("autorise le départ d'une circulation visitée apte et le bloque sinon", async () => {
    const visiteur = await agent(t, "visiteur_rames", "visiteur")
    await activer(t, visiteur.userId)
    const { atelierId, enginId } = await parcMinimal(t)
    const serviceDate = new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(Date.now())
    const tripId = await t.run(async (ctx) => {
      const owe = await ctx.db.insert("stations", { code: "OWE", name: "Owendo", province: "Estuaire", kilometerPoint: 0, isEquipped: true, isActive: true })
      const fcv = await ctx.db.insert("stations", { code: "FCV", name: "Franceville", province: "Haut-Ogooué", kilometerPoint: 669, isEquipped: true, isActive: true })
      const trainId = await ctx.db.insert("trains", { number: "TR-201", name: "Express", type: "EXPRESS", isActive: true })
      const bookletId = await ctx.db.insert("timetableBooklets", { label: "Livret", validFrom: 0, validUntil: Date.now() + 365 * JOUR, status: "actif", createdBy: visiteur.userId })
      return await ctx.db.insert("trips", {
        bookletId,
        trainId,
        trainNumber: "TR-201",
        trainType: "EXPRESS",
        serviceDate,
        departureAt: Date.now() + 2 * 3_600_000,
        arrivalAt: Date.now() + 14 * 3_600_000,
        originStationId: owe,
        destinationStationId: fcv,
        status: "planifie",
        delayMinutes: 0,
        segmentCount: 1,
        isOpenForSale: true,
      })
    })
    let departs = await visiteur.client.query(gmao.queries.departs, { date: serviceDate })
    expect(departs[0]?.decision).toMatchObject({ autorise: false, aptitude: null })

    const { visiteId } = await visiteur.client.mutation(gmao.mutations.ouvrirVisite, {
      tripId,
      atelierId,
      equipementIds: [enginId],
    })
    departs = await visiteur.client.query(gmao.queries.departs, { date: serviceDate })
    expect(departs[0]?.decision.autorise).toBe(false)
    await visiteur.client.mutation(gmao.mutations.signerVisite, { visiteId, aptitude: "apte" })
    departs = await visiteur.client.query(gmao.queries.departs, { date: serviceDate })
    expect(departs[0]?.decision).toMatchObject({ autorise: true, aptitude: "apte" })
    expect(departs[0]?.visite?.statut).toBe("signee")
  })

  it("applique les droits du module et la séparation des achats", async () => {
    const magasinier = await agent(t, "magasinier", "magasinier")
    const stocks = await agent(t, "gestionnaire_stocks", "stocks")
    const visiteur = await agent(t, "visiteur_rames", "visiteur")
    const adminIt = await agent(t, "admin_it", "admin-it")
    const guichet = await agent(t, "vendeur_guichet", "guichet")
    await activer(t, magasinier.userId)
    const { atelierId, articleId, enginId } = await parcMinimal(t)

    await expect(
      magasinier.client.mutation(gmao.mutations.creerOt, {
        equipementId: enginId,
        type: "correctif",
        priorite: "normale",
        titre: "Essai",
        description: "Essai",
        immobilisant: false,
      })
    ).rejects.toThrow(/Accès refusé/)
    const { otId } = await visiteur.client.mutation(gmao.mutations.creerOt, {
      equipementId: enginId,
      type: "correctif",
      priorite: "normale",
      titre: "Avertisseur faible",
      description: "Constaté en visite",
      immobilisant: false,
    })
    await expect(
      visiteur.client.mutation(gmao.mutations.planifierOt, {
        otId,
        atelierId,
        equipe: "A",
        debutPrevu: Date.now(),
        finPrevue: Date.now() + JOUR,
      })
    ).rejects.toThrow(/Accès refusé/)

    // L'administration système lit le module sans y agir.
    const accueil = await adminIt.client.query(gmao.queries.accueil, {})
    expect(accueil.parc.find((famille) => famille.famille === "locomotive")?.total).toBe(1)
    expect((await adminIt.client.query(gmao.queries.droits, {})).capacites).toEqual([])
    await expect(
      adminIt.client.mutation(gmao.mutations.entreeStock, { articleId, atelierId, quantite: 1, motif: "Essai" })
    ).rejects.toThrow(/Accès refusé/)
    await expect(guichet.client.query(gmao.queries.accueil, {})).rejects.toThrow(/Accès refusé/)

    // Demande d'achat : le demandeur ne valide pas sa propre demande.
    const { demandeId } = await stocks.client.mutation(gmao.mutations.demanderAchat, {
      articleId,
      atelierId,
      quantite: 12,
      motif: "Réapprovisionnement",
    })
    await expect(stocks.client.mutation(gmao.mutations.validerAchat, { demandeId })).rejects.toThrow(
      /Séparation des tâches/
    )
    await expect(magasinier.client.mutation(gmao.mutations.validerAchat, { demandeId })).rejects.toThrow(
      /Accès refusé/
    )
    const { demandeId: autreId } = await magasinier.client.mutation(gmao.mutations.demanderAchat, {
      articleId,
      atelierId,
      quantite: 8,
      motif: "Complément",
    })
    await stocks.client.mutation(gmao.mutations.validerAchat, { demandeId: autreId })
    const { commande } = await stocks.client.mutation(gmao.mutations.commanderAchat, { demandeId: autreId })
    expect(commande).toMatchObject({ simulee: true, fournisseur: "Fournisseur de test" })
    await magasinier.client.mutation(gmao.mutations.receptionnerAchat, { demandeId: autreId, quantiteRecue: 8 })
    expect(await stock(t, articleId)).toBe(18)

    // Génération sous le seuil : aucune demande en double.
    await magasinier.client.mutation(gmao.mutations.sortieStock, { articleId, atelierId, quantite: 15, motif: "Transfert vers Booué" })
    const { crees } = await magasinier.client.mutation(gmao.mutations.genererDemandesSousSeuil, {})
    expect(crees).toHaveLength(0) // la demande de 12 est encore soumise
    await stocks.client.mutation(gmao.mutations.annulerAchat, { demandeId, motif: "Remplacée" })
    const relance = await magasinier.client.mutation(gmao.mutations.genererDemandesSousSeuil, {})
    expect(relance.crees).toHaveLength(1)

    await expect(
      magasinier.client.mutation(gmao.mutations.ajusterInventaire, { articleId, atelierId, quantiteComptee: 3, motif: "Inventaire" })
    ).rejects.toThrow(/Aucun écart/)
    const ajustement = await magasinier.client.mutation(gmao.mutations.ajusterInventaire, {
      articleId,
      atelierId,
      quantiteComptee: 2,
      motif: "Inventaire tournant",
    })
    expect(ajustement).toMatchObject({ ecart: -1, quantiteApres: 2 })
  })

  it("refuse toute action quand le module est désactivé", async () => {
    const ingenieur = await agent(t, "ingenieur_atelier", "ingenieur")
    await activer(t, ingenieur.userId, false)
    await parcMinimal(t)
    await expect(ingenieur.client.query(gmao.queries.accueil, {})).rejects.toThrow(/Module désactivé/)
  })

  it("protège l'immobilisation décidée et la réforme", async () => {
    const ingenieur = await agent(t, "ingenieur_atelier", "ingenieur")
    const responsable = await agent(t, "responsable_atelier", "responsable")
    await activer(t, ingenieur.userId)
    const { atelierId, enginId } = await parcMinimal(t)
    await ingenieur.client.mutation(gmao.mutations.changerStatutEquipement, {
      equipementId: enginId,
      statut: "immobilise",
      motif: "Expertise après talonnage",
    })
    expect(await statutEngin(t, enginId)).toBe("immobilise")

    // Un OT ouvert puis clôturé ne lève pas une immobilisation décidée.
    const { otId } = await ingenieur.client.mutation(gmao.mutations.creerOt, {
      equipementId: enginId,
      type: "correctif",
      priorite: "normale",
      titre: "Contrôle du bogie",
      description: "Suite au talonnage",
      immobilisant: true,
    })
    await expect(
      ingenieur.client.mutation(gmao.mutations.changerStatutEquipement, { equipementId: enginId, statut: "reforme", motif: "Fin de vie" })
    ).rejects.toThrow(/Réforme refusée/)
    await ingenieur.client.mutation(gmao.mutations.planifierOt, { otId, atelierId, equipe: "A", debutPrevu: Date.now(), finPrevue: Date.now() + JOUR })
    await ingenieur.client.mutation(gmao.mutations.demarrerOt, { otId })
    expect(await statutEngin(t, enginId)).toBe("en_atelier")
    await ingenieur.client.mutation(gmao.mutations.saisirTemps, { otId, intervenant: "A. Mintsa", date: Date.now(), heures: 2 })
    await ingenieur.client.mutation(gmao.mutations.terminerTravaux, { otId, compteRendu: "Bogie contrôlé." })
    await responsable.client.mutation(gmao.mutations.cloturerOt, { otId })
    expect(await statutEngin(t, enginId)).toBe("immobilise")

    await ingenieur.client.mutation(gmao.mutations.changerStatutEquipement, { equipementId: enginId, statut: "en_service", motif: "Expertise favorable" })
    expect(await statutEngin(t, enginId)).toBe("en_service")
    await expect(
      ingenieur.client.mutation(gmao.mutations.releverCompteurs, { equipementId: enginId, km: 1_000 })
    ).rejects.toThrow(/ne recule pas/)
    await ingenieur.client.mutation(gmao.mutations.changerStatutEquipement, { equipementId: enginId, statut: "reforme", motif: "Fin de vie" })
    await expect(
      ingenieur.client.mutation(gmao.mutations.creerOt, {
        equipementId: enginId,
        type: "correctif",
        priorite: "normale",
        titre: "Essai",
        description: "Essai",
        immobilisant: false,
      })
    ).rejects.toThrow(/réformé/)
  })
})

describe("seed GMAO", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("refuse de peupler sans le mode démo", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)
    await expect(t.mutation(internal.modules.gmao.seed.run, {})).rejects.toThrow(/DEMO_ACCOUNTS_ENABLED/)
  })

  it("est idempotent, cohérent et se réinitialise", async () => {
    vi.useFakeTimers()
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)

    const premier = await t.mutation(internal.modules.gmao.seed.run, { volume: "reduit" })
    expect(premier.statut).toBe("cree")
    expect(premier.comptes.gmaoEquipements).toBeGreaterThan(30)
    expect(premier.comptes.gmaoOrdresTravail).toBeGreaterThan(10)
    const second = await t.mutation(internal.modules.gmao.seed.run, { volume: "reduit" })
    expect(second).toEqual({ statut: "deja", comptes: premier.comptes })

    // Invariants : un engin en atelier a un OT en cours, aucun stock négatif.
    await t.run(async (ctx) => {
      const engins = await ctx.db.query("gmaoEquipements").collect()
      const ots = await ctx.db.query("gmaoOrdresTravail").collect()
      for (const engin of engins.filter((candidat) => candidat.statut === "en_atelier")) {
        expect(ots.some((ot) => ot.equipementId === engin._id && (ot.statut === "en_cours" || ot.statut === "travaux_termines"))).toBe(true)
      }
      for (const ligne of await ctx.db.query("gmaoStocks").collect()) {
        expect(ligne.quantite).toBeGreaterThanOrEqual(0)
      }
      const numeros = new Set(ots.map((ot) => ot.numero))
      expect(numeros.size).toBe(ots.length)
    })

    const reset = await t.mutation(internal.modules.gmao.seed.run, { reset: true, volume: "reduit" })
    expect(reset.statut).toBe("purge")
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const comptes = await t.run(async (ctx) => ({
      engins: (await ctx.db.query("gmaoEquipements").collect()).length,
      ots: (await ctx.db.query("gmaoOrdresTravail").collect()).length,
    }))
    expect(comptes).toEqual({
      engins: premier.comptes.gmaoEquipements,
      ots: premier.comptes.gmaoOrdresTravail,
    })
  })

  it("tient le volume complet dans une seule transaction", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const t = convexTest(schema, modules)
    const resultat = await t.mutation(internal.modules.gmao.seed.run, {})
    const total = Object.values(resultat.comptes).reduce((somme, n) => somme + n, 0)
    expect(resultat.comptes.gmaoEquipements).toBeGreaterThan(350)
    expect(resultat.comptes.gmaoArticles).toBeGreaterThanOrEqual(180)
    // Marge sous la limite d'écriture d'une mutation Convex (16 000 documents).
    expect(total).toBeLessThan(12_000)
  }, 60_000)
})
