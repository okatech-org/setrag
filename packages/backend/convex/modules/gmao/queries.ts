import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { lireGmao, nomAgent } from "./acces"
import {
  calculerEcheance,
  coutTotalOt,
  deciderDepart,
  disponibilite,
  estOtEnRetard,
  estOtOuvert,
  fiabilite,
  jourService,
  JOUR_MS,
  LIBELLES_STATUT_OT,
  sousSeuil,
  STATUTS_OT_OUVERTS,
  type Echeance,
  type Famille,
} from "./model"

const FENETRE_FIABILITE_JOURS = 180

/* ============================================================ Utilitaires */

async function nomsAgents(
  ctx: QueryCtx,
  ids: readonly (Id<"users"> | undefined)[]
): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter((id): id is Id<"users"> => id !== undefined))]
  const noms = new Map<string, string>()
  for (const id of uniques) {
    const user = await ctx.db.get(id)
    const nom = nomAgent(user)
    if (nom) noms.set(id, nom)
  }
  return noms
}

async function chronologie(
  ctx: QueryCtx,
  entite: Doc<"gmaoEvenements">["entite"],
  entiteId: string
) {
  const evenements = await ctx.db
    .query("gmaoEvenements")
    .withIndex("by_entite", (q) => q.eq("entite", entite).eq("entiteId", entiteId))
    .order("desc")
    .take(200)
  const noms = await nomsAgents(
    ctx,
    evenements.map((evenement) => evenement.auteurId)
  )
  return evenements.map((evenement) => ({
    id: evenement._id,
    type: evenement.type,
    libelle: evenement.libelle,
    detail: evenement.detail ?? null,
    auteur: evenement.auteurId ? (noms.get(evenement.auteurId) ?? null) : null,
    le: evenement.creeLe,
  }))
}

async function ateliersParId(ctx: QueryCtx) {
  const ateliers = await ctx.db.query("gmaoAteliers").collect()
  return new Map(ateliers.map((atelier) => [atelier._id as string, atelier]))
}

async function otsOuverts(ctx: QueryCtx): Promise<Doc<"gmaoOrdresTravail">[]> {
  const lots = await Promise.all(
    STATUTS_OT_OUVERTS.map((statut) =>
      ctx.db
        .query("gmaoOrdresTravail")
        .withIndex("by_statut", (q) => q.eq("statut", statut))
        .collect()
    )
  )
  return lots.flat()
}

interface EcheanceEngin extends Echeance {
  planEquipementId: Id<"gmaoPlansEquipements">
  planId: Id<"gmaoPlans">
  planCode: string
  planLibelle: string
  equipementId: Id<"gmaoEquipements">
  derniereRealisationLe: number
  derniereRealisationKm: number
  otOuvertId: Id<"gmaoOrdresTravail"> | null
}

async function toutesEcheances(
  ctx: QueryCtx,
  maintenant: number,
  equipements?: ReadonlyMap<string, Doc<"gmaoEquipements">>
): Promise<EcheanceEngin[]> {
  const plans = new Map(
    (await ctx.db.query("gmaoPlans").collect()).map((plan) => [plan._id as string, plan])
  )
  const engins =
    equipements ??
    new Map(
      (await ctx.db.query("gmaoEquipements").collect()).map((engin) => [
        engin._id as string,
        engin,
      ])
    )
  const rattachements = await ctx.db.query("gmaoPlansEquipements").collect()
  const resultat: EcheanceEngin[] = []
  for (const rattachement of rattachements) {
    const plan = plans.get(rattachement.planId)
    const engin = engins.get(rattachement.equipementId)
    if (!plan || !plan.isActive || !engin || engin.statut === "reforme") continue
    resultat.push({
      ...calculerEcheance(
        plan,
        { le: rattachement.derniereRealisationLe, km: rattachement.derniereRealisationKm },
        engin.compteurKm,
        maintenant
      ),
      planEquipementId: rattachement._id,
      planId: plan._id,
      planCode: plan.code,
      planLibelle: plan.libelle,
      equipementId: engin._id,
      derniereRealisationLe: rattachement.derniereRealisationLe,
      derniereRealisationKm: rattachement.derniereRealisationKm,
      otOuvertId: rattachement.otOuvertId ?? null,
    })
  }
  return resultat
}

function libelleEngin(engin: Doc<"gmaoEquipements">) {
  return `${engin.numero} · ${engin.serie}`
}

/* ================================================================ Droits */

export const droits = query({
  args: {},
  handler: async (ctx) => {
    const acces = await lireGmao(ctx)
    return {
      role: acces.user.role,
      peutEcrire: acces.peutEcrire,
      capacites: acces.capacites,
      utilisateurId: acces.user._id,
    }
  },
})

/* ================================================================ Accueil */

export const accueil = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const maintenant = Date.now()
    const engins = await ctx.db.query("gmaoEquipements").collect()
    const enginsParId = new Map(engins.map((engin) => [engin._id as string, engin]))
    const familles: Famille[] = ["locomotive", "voiture", "wagon"]
    const parc = familles.map((famille) => {
      const lot = engins.filter((engin) => engin.famille === famille)
      const dispo = disponibilite(lot)
      return {
        famille,
        total: lot.length,
        enService: dispo.enService,
        immobilises: lot.filter((engin) => engin.statut === "immobilise").length,
        enAtelier: lot.filter((engin) => engin.statut === "en_atelier").length,
        reformes: lot.filter((engin) => engin.statut === "reforme").length,
        utiles: dispo.utiles,
        disponibilite: dispo.taux,
      }
    })
    const global = disponibilite(engins)

    const ouverts = await otsOuverts(ctx)
    const enRetard = ouverts.filter((ot) => estOtEnRetard(ot, maintenant))
    const debutFenetre = maintenant - FENETRE_FIABILITE_JOURS * JOUR_MS
    const recents = await ctx.db
      .query("gmaoOrdresTravail")
      .withIndex("by_demande", (q) => q.gte("demandeLe", debutFenetre))
      .collect()
    const correctifs = recents.filter((ot) => ot.type === "correctif")
    const fiab = fiabilite({
      enginsUtiles: global.utiles,
      fenetreJours: FENETRE_FIABILITE_JOURS,
      correctifs,
    })
    const debut30 = maintenant - 30 * JOUR_MS
    const clotures30 = recents.filter(
      (ot) => ot.statut === "cloture" && (ot.clotureLe ?? 0) >= debut30
    )
    const cout30 = clotures30.reduce((total, ot) => total + coutTotalOt(ot), 0)

    const echeances = await toutesEcheances(ctx, maintenant, enginsParId)
    const echues = echeances.filter((echeance) => echeance.etat === "echue")
    const proches = echeances.filter((echeance) => echeance.etat === "proche")

    const stocks = await ctx.db.query("gmaoStocks").collect()
    const articles = new Map(
      (await ctx.db.query("gmaoArticles").collect()).map((article) => [
        article._id as string,
        article,
      ])
    )
    const sousSeuils = stocks.filter(
      (stock) => articles.get(stock.articleId)?.isActive && sousSeuil(stock)
    )
    const valeurStock = stocks.reduce(
      (total, stock) =>
        total + stock.quantite * (articles.get(stock.articleId)?.prixUnitaireFcfa ?? 0),
      0
    )
    const achatsAValider = await ctx.db
      .query("gmaoDemandesAchat")
      .withIndex("by_statut", (q) => q.eq("statut", "soumise"))
      .collect()

    const aujourdhui = jourService(maintenant)
    const visitesJour = (
      await ctx.db
        .query("gmaoVisites")
        .withIndex("by_debut", (q) => q.gte("debutLe", maintenant - 2 * JOUR_MS))
        .collect()
    ).filter((visite) => jourService(visite.debutLe) === aujourdhui)

    const priorites: {
      type: "ot" | "echeance" | "stock" | "achat" | "visite"
      id: string
      titre: string
      detail: string
      niveau: "critique" | "eleve" | "normal"
      echeance: number | null
    }[] = []
    for (const ot of ouverts) {
      const engin = enginsParId.get(ot.equipementId)
      if (ot.priorite === "urgente" || estOtEnRetard(ot, maintenant)) {
        priorites.push({
          type: "ot",
          id: ot._id,
          titre: `${ot.numero} — ${ot.titre}`,
          detail: `${engin ? libelleEngin(engin) : "Engin inconnu"} · ${LIBELLES_STATUT_OT[ot.statut]}${estOtEnRetard(ot, maintenant) ? " · en retard" : ""}`,
          niveau: ot.priorite === "urgente" ? "critique" : "eleve",
          echeance: ot.finPrevue ?? null,
        })
      }
    }
    for (const echeance of echues) {
      if (echeance.otOuvertId) continue
      const engin = enginsParId.get(echeance.equipementId)
      priorites.push({
        type: "echeance",
        id: echeance.planEquipementId,
        titre: `${echeance.planCode} échu — ${engin?.numero ?? ""}`,
        detail:
          echeance.declencheur === "km"
            ? `Dépassement de ${Math.abs(echeance.kmRestants ?? 0).toLocaleString("fr-FR")} km, aucun OT ouvert`
            : `Échu depuis ${Math.abs(echeance.joursRestants ?? 0)} j, aucun OT ouvert`,
        niveau: "eleve",
        echeance: echeance.prochaineDate ?? null,
      })
    }
    for (const stock of sousSeuils) {
      const article = articles.get(stock.articleId)
      if (!article?.critique) continue
      priorites.push({
        type: "stock",
        id: article._id,
        titre: `${article.reference} sous le seuil`,
        detail: `${article.designation} · ${stock.quantite} ${article.unite} pour un seuil de ${stock.seuilReappro}`,
        niveau: stock.quantite === 0 ? "critique" : "normal",
        echeance: null,
      })
    }
    for (const visite of visitesJour) {
      if (visite.aptitude === "inapte") {
        priorites.push({
          type: "visite",
          id: visite._id,
          titre: `${visite.numero} — convoi ${visite.convoi} inapte`,
          detail: `${visite.defauts.length} défaut(s), départ bloqué`,
          niveau: "critique",
          echeance: null,
        })
      }
    }
    const rang = { critique: 0, eleve: 1, normal: 2 }
    priorites.sort(
      (a, b) =>
        rang[a.niveau] - rang[b.niveau] ||
        (a.echeance ?? Number.MAX_SAFE_INTEGER) - (b.echeance ?? Number.MAX_SAFE_INTEGER)
    )

    return {
      genereLe: maintenant,
      vide: engins.length === 0,
      parc,
      disponibiliteGlobale: global.taux,
      enginsUtiles: global.utiles,
      enginsEnService: global.enService,
      ot: {
        ouverts: ouverts.length,
        parStatut: STATUTS_OT_OUVERTS.map((statut) => ({
          statut,
          nombre: ouverts.filter((ot) => ot.statut === statut).length,
        })),
        enRetard: enRetard.length,
        urgents: ouverts.filter((ot) => ot.priorite === "urgente").length,
        clotures30: clotures30.length,
        cout30Fcfa: cout30,
      },
      fiabilite: { ...fiab, fenetreJours: FENETRE_FIABILITE_JOURS },
      preventif: {
        echues: echues.length,
        echuesSansOt: echues.filter((echeance) => !echeance.otOuvertId).length,
        proches: proches.length,
        suivies: echeances.length,
      },
      stock: {
        articles: articles.size,
        sousSeuil: sousSeuils.length,
        ruptures: sousSeuils.filter((stock) => stock.quantite === 0).length,
        valeurFcfa: valeurStock,
        achatsAValider: achatsAValider.length,
      },
      visitesJour: {
        total: visitesJour.length,
        signees: visitesJour.filter((visite) => visite.statut === "signee").length,
        inaptes: visitesJour.filter((visite) => visite.aptitude === "inapte").length,
      },
      priorites: priorites.slice(0, 12),
    }
  },
})

/* ================================================================== Parc */

export const equipements = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const maintenant = Date.now()
    const engins = await ctx.db.query("gmaoEquipements").collect()
    const enginsParId = new Map(engins.map((engin) => [engin._id as string, engin]))
    const ateliers = await ateliersParId(ctx)
    const ouverts = await otsOuverts(ctx)
    const otsParEngin = new Map<string, number>()
    for (const ot of ouverts) {
      otsParEngin.set(ot.equipementId, (otsParEngin.get(ot.equipementId) ?? 0) + 1)
    }
    const echeances = await toutesEcheances(ctx, maintenant, enginsParId)
    const pireEcheance = new Map<string, EcheanceEngin>()
    for (const echeance of echeances) {
      const actuelle = pireEcheance.get(echeance.equipementId)
      if (!actuelle || echeance.ratio > actuelle.ratio) {
        pireEcheance.set(echeance.equipementId, echeance)
      }
    }
    const trains = new Map(
      (await ctx.db.query("trains").collect()).map((train) => [train._id as string, train])
    )
    return engins.map((engin) => {
      const echeance = pireEcheance.get(engin._id)
      return {
        id: engin._id,
        numero: engin.numero,
        famille: engin.famille,
        serie: engin.serie,
        constructeur: engin.constructeur,
        statut: engin.statut,
        motifStatut: engin.motifStatut ?? null,
        statutDepuis: engin.statutDepuis,
        atelier: ateliers.get(engin.atelierId)?.nom ?? "—",
        atelierCode: ateliers.get(engin.atelierId)?.code ?? "—",
        compteurKm: engin.compteurKm,
        compteurHeures: engin.compteurHeures,
        proprietaire: engin.proprietaire,
        train: engin.trainId ? (trains.get(engin.trainId)?.number ?? null) : null,
        lieAuReferentiel: engin.coachId !== undefined,
        otOuverts: otsParEngin.get(engin._id) ?? 0,
        prochaineEcheance: echeance
          ? {
              planCode: echeance.planCode,
              etat: echeance.etat,
              ratio: echeance.ratio,
              kmRestants: echeance.kmRestants ?? null,
              joursRestants: echeance.joursRestants ?? null,
            }
          : null,
      }
    })
  },
})

export const equipement = query({
  args: { equipementId: v.id("gmaoEquipements") },
  handler: async (ctx, { equipementId }) => {
    await lireGmao(ctx)
    const engin = await ctx.db.get(equipementId)
    if (!engin) return null
    const maintenant = Date.now()
    const atelier = await ctx.db.get(engin.atelierId)
    const coach = engin.coachId ? await ctx.db.get(engin.coachId) : null
    const trainVoiture = coach ? await ctx.db.get(coach.trainId) : null
    const train = engin.trainId ? await ctx.db.get(engin.trainId) : null
    const ots = await ctx.db
      .query("gmaoOrdresTravail")
      .withIndex("by_equipement", (q) => q.eq("equipementId", equipementId))
      .order("desc")
      .collect()
    const plans = new Map(
      (await ctx.db.query("gmaoPlans").collect()).map((plan) => [plan._id as string, plan])
    )
    const rattachements = await ctx.db
      .query("gmaoPlansEquipements")
      .withIndex("by_equipement", (q) => q.eq("equipementId", equipementId))
      .collect()
    const echeances = rattachements.flatMap((rattachement) => {
      const plan = plans.get(rattachement.planId)
      if (!plan) return []
      return [
        {
          planEquipementId: rattachement._id,
          planId: plan._id,
          planCode: plan.code,
          planLibelle: plan.libelle,
          seuilKm: plan.seuilKm ?? null,
          seuilJours: plan.seuilJours ?? null,
          actif: plan.isActive,
          derniereRealisationLe: rattachement.derniereRealisationLe,
          derniereRealisationKm: rattachement.derniereRealisationKm,
          otOuvertId: rattachement.otOuvertId ?? null,
          ...calculerEcheance(
            plan,
            { le: rattachement.derniereRealisationLe, km: rattachement.derniereRealisationKm },
            engin.compteurKm,
            maintenant
          ),
        },
      ]
    })
    const releves = await ctx.db
      .query("gmaoReleves")
      .withIndex("by_equipement", (q) => q.eq("equipementId", equipementId))
      .order("desc")
      .take(30)
    const noms = await nomsAgents(ctx, [
      ...releves.map((releve) => releve.auteurId),
      ...ots.map((ot) => ot.demandeurId),
    ])
    const correctifs = ots.filter(
      (ot) => ot.type === "correctif" && ot.demandeLe >= maintenant - FENETRE_FIABILITE_JOURS * JOUR_MS
    )
    const fiab = fiabilite({
      enginsUtiles: 1,
      fenetreJours: FENETRE_FIABILITE_JOURS,
      correctifs,
    })
    const joursImmobilisation =
      Math.round(
        ots
          .filter((ot) => ot.immobilisant && ot.debutReel !== undefined)
          .reduce(
            (total, ot) =>
              total + ((ot.finReelle ?? maintenant) - (ot.debutReel ?? maintenant)) / JOUR_MS,
            0
          ) * 10
      ) / 10
    const visitesRecentes = (
      await ctx.db
        .query("gmaoVisites")
        .withIndex("by_debut", (q) => q.gte("debutLe", maintenant - 60 * JOUR_MS))
        .collect()
    )
      .filter((visite) => visite.equipementIds.includes(equipementId))
      .sort((a, b) => b.debutLe - a.debutLe)
      .slice(0, 15)
    return {
      engin: {
        id: engin._id,
        numero: engin.numero,
        famille: engin.famille,
        serie: engin.serie,
        constructeur: engin.constructeur,
        anneeMiseEnService: engin.anneeMiseEnService,
        numeroSerie: engin.numeroSerie ?? null,
        statut: engin.statut,
        motifStatut: engin.motifStatut ?? null,
        immobilisationManuelle: engin.immobilisationManuelle ?? null,
        statutDepuis: engin.statutDepuis,
        compteurKm: engin.compteurKm,
        compteurHeures: engin.compteurHeures,
        compteurReleveLe: engin.compteurReleveLe,
        proprietaire: engin.proprietaire,
        tareTonnes: engin.tareTonnes ?? null,
        chargeUtileTonnes: engin.chargeUtileTonnes ?? null,
        notes: engin.notes ?? null,
        atelierId: engin.atelierId,
        trainId: engin.trainId ?? null,
        creeLe: engin.creeLe,
      },
      atelier: atelier ? { id: atelier._id, code: atelier.code, nom: atelier.nom } : null,
      voiture: coach
        ? {
            repere: coach.label,
            classe: coach.serviceClass,
            places: coach.seatCount,
            train: trainVoiture?.number ?? null,
          }
        : null,
      train: train ? { id: train._id, numero: train.number, nom: train.name } : null,
      echeances,
      ordres: ots.map((ot) => ({
        id: ot._id,
        numero: ot.numero,
        titre: ot.titre,
        type: ot.type,
        priorite: ot.priorite,
        statut: ot.statut,
        demandeLe: ot.demandeLe,
        clotureLe: ot.clotureLe ?? null,
        coutFcfa: coutTotalOt(ot),
        enRetard: estOtEnRetard(ot, maintenant),
        demandeur: ot.demandeurId ? (noms.get(ot.demandeurId) ?? null) : null,
      })),
      releves: releves.map((releve) => ({
        id: releve._id,
        km: releve.km,
        heures: releve.heures,
        le: releve.releveLe,
        source: releve.source,
        auteur: releve.auteurId ? (noms.get(releve.auteurId) ?? null) : null,
      })),
      visites: visitesRecentes.map((visite) => ({
        id: visite._id,
        numero: visite.numero,
        convoi: visite.convoi,
        debutLe: visite.debutLe,
        statut: visite.statut,
        aptitude: visite.aptitude ?? null,
        defautsEngin: visite.defauts.filter((defaut) => defaut.equipementId === equipementId).length,
      })),
      indicateurs: {
        coutCumuleFcfa: ots.reduce((total, ot) => total + coutTotalOt(ot), 0),
        otOuverts: ots.filter((ot) => estOtOuvert(ot.statut)).length,
        defaillances: fiab.defaillances,
        mtbfJours: fiab.mtbfJours,
        mttrHeures: fiab.mttrHeures,
        joursImmobilisation,
      },
      chronologie: await chronologie(ctx, "equipement", equipementId),
    }
  },
})

/* ===================================================== Ordres de travail */

export const ordresTravail = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const maintenant = Date.now()
    const ots = await ctx.db.query("gmaoOrdresTravail").withIndex("by_demande").order("desc").collect()
    const engins = new Map(
      (await ctx.db.query("gmaoEquipements").collect()).map((engin) => [engin._id as string, engin])
    )
    const ateliers = await ateliersParId(ctx)
    return ots.map((ot) => {
      const engin = engins.get(ot.equipementId)
      return {
        id: ot._id,
        numero: ot.numero,
        titre: ot.titre,
        type: ot.type,
        origine: ot.origine,
        priorite: ot.priorite,
        statut: ot.statut,
        engin: engin?.numero ?? "—",
        famille: engin?.famille ?? null,
        serie: engin?.serie ?? null,
        atelier: ateliers.get(ot.atelierId)?.nom ?? "—",
        equipe: ot.equipe ?? null,
        demandeLe: ot.demandeLe,
        debutPrevu: ot.debutPrevu ?? null,
        finPrevue: ot.finPrevue ?? null,
        clotureLe: ot.clotureLe ?? null,
        immobilisant: ot.immobilisant,
        heuresPassees: ot.heuresPassees,
        coutFcfa: coutTotalOt(ot),
        enRetard: estOtEnRetard(ot, maintenant),
      }
    })
  },
})

export const ordreTravail = query({
  args: { otId: v.id("gmaoOrdresTravail") },
  handler: async (ctx, { otId }) => {
    const acces = await lireGmao(ctx)
    const ot = await ctx.db.get(otId)
    if (!ot) return null
    const maintenant = Date.now()
    const engin = await ctx.db.get(ot.equipementId)
    const atelier = await ctx.db.get(ot.atelierId)
    const plan = ot.planId ? await ctx.db.get(ot.planId) : null
    const visite = ot.visiteId ? await ctx.db.get(ot.visiteId) : null
    const incident = ot.incidentId ? await ctx.db.get(ot.incidentId) : null
    const temps = await ctx.db
      .query("gmaoTempsPasses")
      .withIndex("by_ot", (q) => q.eq("otId", otId))
      .collect()
    const mouvements = await ctx.db
      .query("gmaoMouvements")
      .withIndex("by_ot", (q) => q.eq("otId", otId))
      .collect()
    const articles = new Map<string, Doc<"gmaoArticles">>()
    for (const mouvement of mouvements) {
      if (!articles.has(mouvement.articleId)) {
        const article = await ctx.db.get(mouvement.articleId)
        if (article) articles.set(article._id, article)
      }
    }
    const achats = (await ctx.db.query("gmaoDemandesAchat").collect()).filter(
      (demande) => demande.otId === otId
    )
    const noms = await nomsAgents(ctx, [
      ot.demandeurId,
      ot.planifieParId,
      ot.termineParId,
      ot.clotureParId,
      ...temps.map((saisie) => saisie.saisiParId),
      ...mouvements.map((mouvement) => mouvement.auteurId),
    ])
    const nom = (id?: Id<"users">) => (id ? (noms.get(id) ?? null) : null)
    return {
      ot: {
        id: ot._id,
        numero: ot.numero,
        titre: ot.titre,
        description: ot.description,
        type: ot.type,
        origine: ot.origine,
        priorite: ot.priorite,
        statut: ot.statut,
        equipe: ot.equipe ?? null,
        atelierId: ot.atelierId,
        debutPrevu: ot.debutPrevu ?? null,
        finPrevue: ot.finPrevue ?? null,
        debutReel: ot.debutReel ?? null,
        finReelle: ot.finReelle ?? null,
        immobilisant: ot.immobilisant,
        kmDebut: ot.kmDebut ?? null,
        heuresPassees: ot.heuresPassees,
        coutMainOeuvreFcfa: ot.coutMainOeuvreFcfa,
        coutPiecesFcfa: ot.coutPiecesFcfa,
        coutExterneFcfa: ot.coutExterneFcfa,
        coutTotalFcfa: coutTotalOt(ot),
        compteRendu: ot.compteRendu ?? null,
        organe: ot.organe ?? null,
        demandeLe: ot.demandeLe,
        clotureLe: ot.clotureLe ?? null,
        motifAnnulation: ot.motifAnnulation ?? null,
        enRetard: estOtEnRetard(ot, maintenant),
        demandeur: nom(ot.demandeurId),
        planifiePar: nom(ot.planifieParId),
        terminePar: nom(ot.termineParId),
        cloturePar: nom(ot.clotureParId),
        /** Séparation des tâches : celui qui a réparé ne remet pas en service. */
        termineParMoi: ot.termineParId === acces.user._id,
      },
      engin: engin
        ? {
            id: engin._id,
            numero: engin.numero,
            famille: engin.famille,
            serie: engin.serie,
            statut: engin.statut,
            compteurKm: engin.compteurKm,
          }
        : null,
      atelier: atelier
        ? { id: atelier._id, code: atelier.code, nom: atelier.nom, tauxHoraireFcfa: atelier.tauxHoraireFcfa }
        : null,
      plan: plan ? { id: plan._id, code: plan.code, libelle: plan.libelle, operations: plan.operations } : null,
      visite: visite ? { id: visite._id, numero: visite.numero, convoi: visite.convoi } : null,
      incident: incident
        ? {
            id: incident._id,
            reference: incident.number ?? null,
            description: incident.description,
            statut: incident.status,
          }
        : null,
      temps: temps
        .sort((a, b) => b.date - a.date)
        .map((saisie) => ({
          id: saisie._id,
          intervenant: saisie.intervenant,
          matricule: saisie.matricule ?? null,
          date: saisie.date,
          heures: saisie.heures,
          tauxHoraireFcfa: saisie.tauxHoraireFcfa,
          montantFcfa: Math.round(saisie.heures * saisie.tauxHoraireFcfa),
          commentaire: saisie.commentaire ?? null,
          saisiPar: nom(saisie.saisiParId),
        })),
      pieces: mouvements
        .sort((a, b) => b.creeLe - a.creeLe)
        .map((mouvement) => {
          const article = articles.get(mouvement.articleId)
          return {
            id: mouvement._id,
            articleId: mouvement.articleId,
            reference: article?.reference ?? "—",
            designation: article?.designation ?? "—",
            unite: article?.unite ?? "",
            sens: mouvement.sens,
            quantite: mouvement.quantite,
            valeurFcfa: mouvement.valeurFcfa,
            le: mouvement.creeLe,
            auteur: nom(mouvement.auteurId),
            atelierId: mouvement.atelierId,
          }
        }),
      achats: achats.map((demande) => ({
        id: demande._id,
        numero: demande.numero,
        statut: demande.statut,
        quantite: demande.quantite,
        montantFcfa: demande.montantFcfa,
      })),
      chronologie: await chronologie(ctx, "ordre_travail", otId),
    }
  },
})

/* ======================================================= Préventif */

export const plans = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const maintenant = Date.now()
    const tous = await ctx.db.query("gmaoPlans").collect()
    const echeances = await toutesEcheances(ctx, maintenant)
    return tous.map((plan) => {
      const lot = echeances.filter((echeance) => echeance.planId === plan._id)
      return {
        id: plan._id,
        code: plan.code,
        libelle: plan.libelle,
        famille: plan.famille,
        series: plan.series,
        seuilKm: plan.seuilKm ?? null,
        seuilJours: plan.seuilJours ?? null,
        alertePct: plan.alertePct,
        dureeHeures: plan.dureeHeures,
        immobilisant: plan.immobilisant,
        actif: plan.isActive,
        engins: lot.length,
        echues: lot.filter((echeance) => echeance.etat === "echue").length,
        proches: lot.filter((echeance) => echeance.etat === "proche").length,
      }
    })
  },
})

export const plan = query({
  args: { planId: v.id("gmaoPlans") },
  handler: async (ctx, { planId }) => {
    await lireGmao(ctx)
    const plan = await ctx.db.get(planId)
    if (!plan) return null
    const maintenant = Date.now()
    const engins = new Map(
      (await ctx.db.query("gmaoEquipements").collect()).map((engin) => [engin._id as string, engin])
    )
    const echeances = (await toutesEcheances(ctx, maintenant, engins)).filter(
      (echeance) => echeance.planId === planId
    )
    return {
      plan: {
        id: plan._id,
        code: plan.code,
        libelle: plan.libelle,
        famille: plan.famille,
        series: plan.series,
        seuilKm: plan.seuilKm ?? null,
        seuilJours: plan.seuilJours ?? null,
        alertePct: plan.alertePct,
        dureeHeures: plan.dureeHeures,
        immobilisant: plan.immobilisant,
        operations: plan.operations,
        actif: plan.isActive,
        creeLe: plan.creeLe,
        majLe: plan.majLe,
      },
      engins: echeances.map((echeance) => {
        const engin = engins.get(echeance.equipementId)!
        return {
          planEquipementId: echeance.planEquipementId,
          equipementId: engin._id,
          numero: engin.numero,
          serie: engin.serie,
          statut: engin.statut,
          compteurKm: engin.compteurKm,
          derniereRealisationLe: echeance.derniereRealisationLe,
          derniereRealisationKm: echeance.derniereRealisationKm,
          etat: echeance.etat,
          ratio: echeance.ratio,
          prochainKm: echeance.prochainKm ?? null,
          kmRestants: echeance.kmRestants ?? null,
          prochaineDate: echeance.prochaineDate ?? null,
          joursRestants: echeance.joursRestants ?? null,
          otOuvertId: echeance.otOuvertId,
        }
      }),
      chronologie: await chronologie(ctx, "plan", planId),
    }
  },
})

export const echeances = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const maintenant = Date.now()
    const engins = new Map(
      (await ctx.db.query("gmaoEquipements").collect()).map((engin) => [engin._id as string, engin])
    )
    const ots = new Map<string, Doc<"gmaoOrdresTravail">>()
    for (const ot of await otsOuverts(ctx)) ots.set(ot._id, ot)
    return (await toutesEcheances(ctx, maintenant, engins))
      .filter((echeance) => echeance.etat !== "a_jour")
      .map((echeance) => {
        const engin = engins.get(echeance.equipementId)!
        const ot = echeance.otOuvertId ? ots.get(echeance.otOuvertId) : undefined
        return {
          planEquipementId: echeance.planEquipementId,
          planId: echeance.planId,
          planCode: echeance.planCode,
          planLibelle: echeance.planLibelle,
          equipementId: engin._id,
          numero: engin.numero,
          famille: engin.famille,
          serie: engin.serie,
          statutEngin: engin.statut,
          etat: echeance.etat,
          ratio: echeance.ratio,
          declencheur: echeance.declencheur,
          kmRestants: echeance.kmRestants ?? null,
          joursRestants: echeance.joursRestants ?? null,
          prochaineDate: echeance.prochaineDate ?? null,
          ot: ot ? { id: ot._id, numero: ot.numero, statut: ot.statut } : null,
        }
      })
  },
})

/* =================================================== Visites avant départ */

export const visites = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const visites = await ctx.db.query("gmaoVisites").withIndex("by_debut").order("desc").take(500)
    const ateliers = await ateliersParId(ctx)
    const noms = await nomsAgents(ctx, visites.map((visite) => visite.visiteurId))
    return visites.map((visite) => ({
      id: visite._id,
      numero: visite.numero,
      convoi: visite.convoi,
      atelier: ateliers.get(visite.atelierId)?.nom ?? "—",
      engins: visite.equipementIds.length,
      defauts: visite.defauts.length,
      bloquants: visite.defauts.filter((defaut) => defaut.gravite === "bloquant").length,
      statut: visite.statut,
      aptitude: visite.aptitude ?? null,
      debutLe: visite.debutLe,
      signeeLe: visite.signeeLe ?? null,
      visiteur: visite.visiteurId ? (noms.get(visite.visiteurId) ?? null) : null,
      tripId: visite.tripId ?? null,
    }))
  },
})

export const visite = query({
  args: { visiteId: v.id("gmaoVisites") },
  handler: async (ctx, { visiteId }) => {
    await lireGmao(ctx)
    const visite = await ctx.db.get(visiteId)
    if (!visite) return null
    const atelier = await ctx.db.get(visite.atelierId)
    const trip = visite.tripId ? await ctx.db.get(visite.tripId) : null
    const engins = (
      await Promise.all(visite.equipementIds.map((id) => ctx.db.get(id)))
    ).filter((engin): engin is Doc<"gmaoEquipements"> => engin !== null)
    const ots = (
      await Promise.all(visite.otIds.map((id) => ctx.db.get(id)))
    ).filter((ot): ot is Doc<"gmaoOrdresTravail"> => ot !== null)
    const noms = await nomsAgents(ctx, [visite.visiteurId])
    const numeroEngin = new Map(engins.map((engin) => [engin._id as string, engin.numero]))
    return {
      visite: {
        id: visite._id,
        numero: visite.numero,
        convoi: visite.convoi,
        statut: visite.statut,
        aptitude: visite.aptitude ?? null,
        observations: visite.observations ?? null,
        debutLe: visite.debutLe,
        signeeLe: visite.signeeLe ?? null,
        visiteur: visite.visiteurId ? (noms.get(visite.visiteurId) ?? null) : null,
        controles: visite.controles,
        defauts: visite.defauts.map((defaut, index) => ({
          index,
          ...defaut,
          numeroEngin: numeroEngin.get(defaut.equipementId) ?? "—",
        })),
      },
      atelier: atelier ? { id: atelier._id, nom: atelier.nom } : null,
      trajet: trip
        ? {
            id: trip._id,
            train: trip.trainNumber,
            serviceDate: trip.serviceDate,
            departureAt: trip.departureAt,
            statut: trip.status,
          }
        : null,
      engins: engins.map((engin) => ({
        id: engin._id,
        numero: engin.numero,
        famille: engin.famille,
        serie: engin.serie,
        statut: engin.statut,
      })),
      decision: deciderDepart(visite, engins),
      ordres: ots.map((ot) => ({
        id: ot._id,
        numero: ot.numero,
        titre: ot.titre,
        statut: ot.statut,
        priorite: ot.priorite,
      })),
      chronologie: await chronologie(ctx, "visite", visiteId),
    }
  },
})

/**
 * Départs d'un jour avec leur aptitude matériel. C'est aussi la lecture que
 * COTRAF pourra consommer : un départ n'est autorisé qu'avec une visite
 * signée et un convoi sans engin indisponible.
 */
export const departs = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await lireGmao(ctx)
    const jour = args.date ?? jourService(Date.now())
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", jour))
      .collect()
    const resultat = []
    for (const trip of trips) {
      const visitesTrajet = await ctx.db
        .query("gmaoVisites")
        .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
        .collect()
      const derniere = visitesTrajet.sort((a, b) => b.debutLe - a.debutLe)[0] ?? null
      const engins = derniere
        ? (await Promise.all(derniere.equipementIds.map((id) => ctx.db.get(id)))).filter(
            (engin): engin is Doc<"gmaoEquipements"> => engin !== null
          )
        : []
      const origine = await ctx.db.get(trip.originStationId)
      const destination = await ctx.db.get(trip.destinationStationId)
      resultat.push({
        tripId: trip._id,
        train: trip.trainNumber,
        departureAt: trip.departureAt,
        origine: origine?.name ?? "—",
        destination: destination?.name ?? "—",
        statutTrajet: trip.status,
        visite: derniere
          ? { id: derniere._id, numero: derniere.numero, statut: derniere.statut }
          : null,
        decision: deciderDepart(derniere, engins),
      })
    }
    return resultat.sort((a, b) => a.departureAt - b.departureAt)
  },
})

/* ================================================================ Stock */

export const articles = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const articles = await ctx.db.query("gmaoArticles").collect()
    const stocks = await ctx.db.query("gmaoStocks").collect()
    const ateliers = await ateliersParId(ctx)
    const enCours = (await ctx.db.query("gmaoDemandesAchat").collect()).filter((demande) =>
      ["soumise", "validee", "commandee"].includes(demande.statut)
    )
    return articles.map((article) => {
      const lignes = stocks.filter((stock) => stock.articleId === article._id)
      const quantite = lignes.reduce((total, stock) => total + stock.quantite, 0)
      return {
        id: article._id,
        reference: article.reference,
        designation: article.designation,
        famille: article.famille,
        unite: article.unite,
        prixUnitaireFcfa: article.prixUnitaireFcfa,
        fournisseur: article.fournisseur,
        critique: article.critique,
        actif: article.isActive,
        quantite,
        valeurFcfa: quantite * article.prixUnitaireFcfa,
        sousSeuil: lignes.some(sousSeuil),
        rupture: lignes.some((stock) => stock.quantite === 0),
        achatsEnCours: enCours.filter((demande) => demande.articleId === article._id).length,
        magasins: lignes.map((stock) => ({
          stockId: stock._id,
          atelierId: stock.atelierId,
          atelier: ateliers.get(stock.atelierId)?.code ?? "—",
          quantite: stock.quantite,
          seuilReappro: stock.seuilReappro,
          sousSeuil: sousSeuil(stock),
        })),
      }
    })
  },
})

export const article = query({
  args: { articleId: v.id("gmaoArticles") },
  handler: async (ctx, { articleId }) => {
    await lireGmao(ctx)
    const article = await ctx.db.get(articleId)
    if (!article) return null
    const ateliers = await ateliersParId(ctx)
    const stocks = await ctx.db
      .query("gmaoStocks")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .collect()
    const mouvements = await ctx.db
      .query("gmaoMouvements")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .order("desc")
      .take(300)
    const ots = new Map<string, string>()
    for (const mouvement of mouvements) {
      if (mouvement.otId && !ots.has(mouvement.otId)) {
        const ot = await ctx.db.get(mouvement.otId)
        if (ot) ots.set(ot._id, ot.numero)
      }
    }
    const demandes = await ctx.db
      .query("gmaoDemandesAchat")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .collect()
    const noms = await nomsAgents(ctx, mouvements.map((mouvement) => mouvement.auteurId))
    const maintenant = Date.now()
    const consommation6Mois = mouvements
      .filter((mouvement) => mouvement.sens === "sortie" && mouvement.creeLe >= maintenant - 182 * JOUR_MS)
      .reduce((total, mouvement) => total + mouvement.quantite, 0)
    return {
      article: {
        id: article._id,
        reference: article.reference,
        designation: article.designation,
        famille: article.famille,
        unite: article.unite,
        prixUnitaireFcfa: article.prixUnitaireFcfa,
        fournisseur: article.fournisseur,
        delaiApproJours: article.delaiApproJours,
        critique: article.critique,
        compatibilite: article.compatibilite,
        actif: article.isActive,
      },
      stocks: stocks.map((stock) => ({
        id: stock._id,
        atelierId: stock.atelierId,
        atelier: ateliers.get(stock.atelierId)?.nom ?? "—",
        atelierCode: ateliers.get(stock.atelierId)?.code ?? "—",
        quantite: stock.quantite,
        seuilReappro: stock.seuilReappro,
        quantiteReappro: stock.quantiteReappro,
        emplacement: stock.emplacement,
        sousSeuil: sousSeuil(stock),
      })),
      mouvements: mouvements.map((mouvement) => ({
        id: mouvement._id,
        sens: mouvement.sens,
        quantite: mouvement.quantite,
        ecart: mouvement.ecart ?? null,
        quantiteApres: mouvement.quantiteApres,
        valeurFcfa: mouvement.valeurFcfa,
        motif: mouvement.motif,
        atelier: ateliers.get(mouvement.atelierId)?.code ?? "—",
        otId: mouvement.otId ?? null,
        otNumero: mouvement.otId ? (ots.get(mouvement.otId) ?? null) : null,
        le: mouvement.creeLe,
        auteur: mouvement.auteurId ? (noms.get(mouvement.auteurId) ?? null) : null,
      })),
      demandes: demandes
        .sort((a, b) => b.demandeLe - a.demandeLe)
        .map((demande) => ({
          id: demande._id,
          numero: demande.numero,
          statut: demande.statut,
          quantite: demande.quantite,
          montantFcfa: demande.montantFcfa,
          demandeLe: demande.demandeLe,
        })),
      consommation6Mois,
      chronologie: await chronologie(ctx, "article", articleId),
    }
  },
})

export const mouvements = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const mouvements = await ctx.db.query("gmaoMouvements").withIndex("by_date").order("desc").take(1000)
    const articles = new Map(
      (await ctx.db.query("gmaoArticles").collect()).map((article) => [article._id as string, article])
    )
    const ateliers = await ateliersParId(ctx)
    const ots = new Map<string, string>()
    for (const mouvement of mouvements) {
      if (mouvement.otId && !ots.has(mouvement.otId)) {
        const ot = await ctx.db.get(mouvement.otId)
        if (ot) ots.set(ot._id, ot.numero)
      }
    }
    const noms = await nomsAgents(ctx, mouvements.map((mouvement) => mouvement.auteurId))
    return mouvements.map((mouvement) => {
      const article = articles.get(mouvement.articleId)
      return {
        id: mouvement._id,
        articleId: mouvement.articleId,
        reference: article?.reference ?? "—",
        designation: article?.designation ?? "—",
        unite: article?.unite ?? "",
        sens: mouvement.sens,
        quantite: mouvement.quantite,
        ecart: mouvement.ecart ?? null,
        quantiteApres: mouvement.quantiteApres,
        valeurFcfa: mouvement.valeurFcfa,
        motif: mouvement.motif,
        atelier: ateliers.get(mouvement.atelierId)?.code ?? "—",
        otId: mouvement.otId ?? null,
        otNumero: mouvement.otId ? (ots.get(mouvement.otId) ?? null) : null,
        le: mouvement.creeLe,
        auteur: mouvement.auteurId ? (noms.get(mouvement.auteurId) ?? null) : null,
      }
    })
  },
})

/* ============================================================== Achats */

export const demandesAchat = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const demandes = await ctx.db.query("gmaoDemandesAchat").collect()
    const articles = new Map(
      (await ctx.db.query("gmaoArticles").collect()).map((article) => [article._id as string, article])
    )
    const ateliers = await ateliersParId(ctx)
    const noms = await nomsAgents(ctx, demandes.map((demande) => demande.demandeurId))
    return demandes
      .sort((a, b) => b.demandeLe - a.demandeLe)
      .map((demande) => {
        const article = articles.get(demande.articleId)
        return {
          id: demande._id,
          numero: demande.numero,
          articleId: demande.articleId,
          reference: article?.reference ?? "—",
          designation: article?.designation ?? "—",
          unite: article?.unite ?? "",
          atelier: ateliers.get(demande.atelierId)?.code ?? "—",
          quantite: demande.quantite,
          montantFcfa: demande.montantFcfa,
          origine: demande.origine,
          statut: demande.statut,
          demandeLe: demande.demandeLe,
          demandeur: demande.demandeurId ? (noms.get(demande.demandeurId) ?? null) : null,
          livraisonPrevueLe: demande.commande?.livraisonPrevueLe ?? null,
          commandeNumero: demande.commande?.numero ?? null,
        }
      })
  },
})

export const demandeAchat = query({
  args: { demandeId: v.id("gmaoDemandesAchat") },
  handler: async (ctx, { demandeId }) => {
    const acces = await lireGmao(ctx)
    const demande = await ctx.db.get(demandeId)
    if (!demande) return null
    const article = await ctx.db.get(demande.articleId)
    const atelier = await ctx.db.get(demande.atelierId)
    const ot = demande.otId ? await ctx.db.get(demande.otId) : null
    const stock = await ctx.db
      .query("gmaoStocks")
      .withIndex("by_article_atelier", (q) =>
        q.eq("articleId", demande.articleId).eq("atelierId", demande.atelierId)
      )
      .unique()
    const noms = await nomsAgents(ctx, [demande.demandeurId, demande.valideurId])
    return {
      demande: {
        id: demande._id,
        numero: demande.numero,
        quantite: demande.quantite,
        prixUnitaireFcfa: demande.prixUnitaireFcfa,
        montantFcfa: demande.montantFcfa,
        motif: demande.motif,
        origine: demande.origine,
        statut: demande.statut,
        demandeLe: demande.demandeLe,
        demandeur: demande.demandeurId ? (noms.get(demande.demandeurId) ?? null) : null,
        demandeParMoi: demande.demandeurId === acces.user._id,
        valideur: demande.valideurId ? (noms.get(demande.valideurId) ?? null) : null,
        valideLe: demande.valideLe ?? null,
        motifRefus: demande.motifRefus ?? null,
        commande: demande.commande ?? null,
        quantiteRecue: demande.quantiteRecue ?? null,
        recueLe: demande.recueLe ?? null,
      },
      article: article
        ? {
            id: article._id,
            reference: article.reference,
            designation: article.designation,
            unite: article.unite,
            fournisseur: article.fournisseur,
            delaiApproJours: article.delaiApproJours,
          }
        : null,
      atelier: atelier ? { id: atelier._id, code: atelier.code, nom: atelier.nom } : null,
      stock: stock
        ? { quantite: stock.quantite, seuilReappro: stock.seuilReappro, quantiteReappro: stock.quantiteReappro }
        : null,
      ot: ot ? { id: ot._id, numero: ot.numero, titre: ot.titre } : null,
      chronologie: await chronologie(ctx, "demande_achat", demandeId),
    }
  },
})

/* ========================================================== Formulaires */

/** Listes légères pour alimenter les formulaires de saisie. */
export const formulaires = query({
  args: {},
  handler: async (ctx) => {
    await lireGmao(ctx)
    const maintenant = Date.now()
    const ateliers = await ctx.db.query("gmaoAteliers").collect()
    const engins = await ctx.db.query("gmaoEquipements").collect()
    const articles = await ctx.db.query("gmaoArticles").collect()
    const stocks = await ctx.db.query("gmaoStocks").collect()
    const plans = await ctx.db.query("gmaoPlans").collect()
    const trains = await ctx.db.query("trains").collect()
    const coachesSuivies = new Set(engins.filter((engin) => engin.coachId).map((engin) => engin.coachId as string))
    const voituresReferentiel = (await ctx.db.query("coaches").collect()).filter(
      (coach) => !coachesSuivies.has(coach._id)
    )
    const incidents = (
      await ctx.db
        .query("incidents")
        .withIndex("by_status", (q) => q.eq("status", "ouvert"))
        .collect()
    )
      .concat(
        await ctx.db
          .query("incidents")
          .withIndex("by_status", (q) => q.eq("status", "en_cours"))
          .collect()
      )
      .filter((incident) => incident.category === "technique" || incident.category === "securite")
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_departure", (q) =>
        q.gte("departureAt", maintenant - 12 * 3_600_000).lte("departureAt", maintenant + 2 * JOUR_MS)
      )
      .collect()
    return {
      ateliers: ateliers
        .filter((atelier) => atelier.isActive)
        .map((atelier) => ({
          id: atelier._id,
          code: atelier.code,
          nom: atelier.nom,
          tauxHoraireFcfa: atelier.tauxHoraireFcfa,
        })),
      engins: engins
        .filter((engin) => engin.statut !== "reforme")
        .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }))
        .map((engin) => ({
          id: engin._id,
          numero: engin.numero,
          famille: engin.famille,
          serie: engin.serie,
          statut: engin.statut,
          atelierId: engin.atelierId,
          compteurKm: engin.compteurKm,
        })),
      articles: articles
        .filter((article) => article.isActive)
        .sort((a, b) => a.reference.localeCompare(b.reference, "fr"))
        .map((article) => ({
          id: article._id,
          reference: article.reference,
          designation: article.designation,
          unite: article.unite,
          prixUnitaireFcfa: article.prixUnitaireFcfa,
          stocks: stocks
            .filter((stock) => stock.articleId === article._id)
            .map((stock) => ({ atelierId: stock.atelierId, quantite: stock.quantite })),
        })),
      plans: plans.map((plan) => ({
        id: plan._id,
        code: plan.code,
        libelle: plan.libelle,
        famille: plan.famille,
        series: plan.series,
        actif: plan.isActive,
      })),
      series: [...new Set(engins.map((engin) => `${engin.famille}|${engin.serie}`))].map((cle) => {
        const [famille, serie] = cle.split("|") as [Famille, string]
        return { famille, serie }
      }),
      /** Voitures du référentiel commercial pas encore suivies au parc. */
      voituresReferentiel: voituresReferentiel.map((coach) => ({
        id: coach._id,
        repere: coach.label,
        classe: coach.serviceClass,
        trainId: coach.trainId,
        train: trains.find((train) => train._id === coach.trainId)?.number ?? null,
      })),
      trains: trains
        .filter((train) => train.isActive)
        .map((train) => ({ id: train._id, numero: train.number, nom: train.name })),
      incidents: incidents.map((incident) => ({
        id: incident._id,
        reference: incident.number ?? null,
        description: incident.description,
        signaleLe: incident.reportedAt,
      })),
      trajets: trips
        .sort((a, b) => a.departureAt - b.departureAt)
        .map((trip) => ({
          id: trip._id,
          train: trip.trainNumber,
          serviceDate: trip.serviceDate,
          departureAt: trip.departureAt,
          trainId: trip.trainId,
        })),
    }
  },
})
