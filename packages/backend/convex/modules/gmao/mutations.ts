import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, type MutationCtx } from "../../_generated/server"
import { exigerGmao, journaliserGmao, prochainNumero } from "./acces"
import {
  assertAptitudeAdmise,
  assertTransitionOt,
  controlesPourFamilles,
  entierPositif,
  estOtOuvert,
  HEURE_MS,
  JOUR_MS,
  LIBELLES_APTITUDE,
  LIBELLES_STATUT_EQUIPEMENT,
  LIBELLES_STATUT_OT,
  nombrePositifOuNul,
  prioriteDefaut,
  sousSeuil,
  texteFacultatif,
  texteRequis,
  validerHeures,
  validerSeuilsPlan,
  type Famille,
} from "./model"
import {
  gmaoAptitudeValidator,
  gmaoFamilleValidator,
  gmaoGraviteDefautValidator,
  gmaoPrioriteValidator,
  gmaoResultatControleValidator,
  gmaoTypeOtValidator,
} from "./tables"

/* ============================================================ Utilitaires */

async function charger<T extends "gmaoOrdresTravail" | "gmaoEquipements" | "gmaoVisites" | "gmaoArticles" | "gmaoDemandesAchat" | "gmaoPlans" | "gmaoAteliers">(
  ctx: MutationCtx,
  id: Id<T>,
  libelle: string
): Promise<Doc<T>> {
  const document = await ctx.db.get(id)
  if (!document) throw new Error(`${libelle} introuvable.`)
  return document as Doc<T>
}

function quantiteValide(valeur: number, libelle = "La quantité"): number {
  if (!Number.isFinite(valeur) || valeur <= 0) {
    throw new Error(`${libelle} doit être strictement positive.`)
  }
  if (Math.round(valeur * 100) !== valeur * 100) {
    throw new Error(`${libelle} accepte au plus deux décimales.`)
  }
  if (valeur > 100_000) throw new Error(`${libelle} est hors limite.`)
  return valeur
}

/** Engins dont un OT ouvert et immobilisant empêche la circulation. */
async function otsImmobilisantsOuverts(
  ctx: MutationCtx,
  equipementId: Id<"gmaoEquipements">,
  saufOtId?: Id<"gmaoOrdresTravail">
) {
  const ots = await ctx.db
    .query("gmaoOrdresTravail")
    .withIndex("by_equipement", (q) => q.eq("equipementId", equipementId))
    .collect()
  return ots.filter(
    (ot) => ot._id !== saufOtId && ot.immobilisant && estOtOuvert(ot.statut)
  )
}

/**
 * Recalcule la disponibilité d'un engin après un changement d'OT : en atelier
 * tant qu'un OT immobilisant est en cours, immobilisé s'il attend un OT
 * urgent, en service sinon. Un engin réformé ne bouge pas.
 */
async function recalculerStatutEngin(
  ctx: MutationCtx,
  equipementId: Id<"gmaoEquipements">,
  auteurId: Id<"users">,
  maintenant: number,
  saufOtId?: Id<"gmaoOrdresTravail">
) {
  const engin = await ctx.db.get(equipementId)
  if (!engin || engin.statut === "reforme") return
  const restants = await otsImmobilisantsOuverts(ctx, equipementId, saufOtId)
  const enCours = restants.find(
    (ot) => ot.statut === "en_cours" || ot.statut === "travaux_termines"
  )
  const bloquant = restants.find(
    (ot) => ot.priorite === "urgente" || ot.origine === "visite_technique"
  )
  const statut = enCours
    ? "en_atelier"
    : bloquant || engin.immobilisationManuelle
      ? "immobilise"
      : "en_service"
  const motif = enCours
    ? `Travaux de l'${enCours.numero}`
    : bloquant
      ? `En attente de l'${bloquant.numero}`
      : engin.immobilisationManuelle
  if (statut === engin.statut && motif === engin.motifStatut) return
  await ctx.db.patch(equipementId, {
    statut,
    motifStatut: motif,
    statutDepuis: statut === engin.statut ? engin.statutDepuis : maintenant,
    majLe: maintenant,
  })
  if (statut !== engin.statut) {
    await journaliserGmao(ctx, {
      entite: "equipement",
      entiteId: equipementId,
      table: "gmaoEquipements",
      type: "statut",
      libelle: `${LIBELLES_STATUT_EQUIPEMENT[engin.statut]} → ${LIBELLES_STATUT_EQUIPEMENT[statut]}`,
      detail: motif ?? "Remise en service après clôture des ordres de travail",
      auteurId,
      avant: { statut: engin.statut },
      apres: { statut },
      maintenant,
    })
  }
}

async function mouvementerStock(
  ctx: MutationCtx,
  params: {
    articleId: Id<"gmaoArticles">
    atelierId: Id<"gmaoAteliers">
    sens: "entree" | "sortie" | "ajustement"
    quantite: number
    ecart?: number
    motif: string
    otId?: Id<"gmaoOrdresTravail">
    demandeAchatId?: Id<"gmaoDemandesAchat">
    auteurId: Id<"users">
    maintenant: number
  }
) {
  const article = await charger(ctx, params.articleId, "Article")
  if (!article.isActive && params.sens === "sortie") {
    throw new Error(`L'article ${article.reference} est désactivé.`)
  }
  await charger(ctx, params.atelierId, "Magasin")
  const stock = await ctx.db
    .query("gmaoStocks")
    .withIndex("by_article_atelier", (q) =>
      q.eq("articleId", params.articleId).eq("atelierId", params.atelierId)
    )
    .unique()
  const disponible = stock?.quantite ?? 0
  const variation =
    params.sens === "entree"
      ? params.quantite
      : params.sens === "sortie"
        ? -params.quantite
        : (params.ecart ?? 0)
  const apres = Math.round((disponible + variation) * 100) / 100
  if (apres < 0) {
    throw new Error(
      `Stock insuffisant : ${disponible} ${article.unite} disponible(s) pour ${article.reference} dans ce magasin.`
    )
  }
  if (stock) {
    await ctx.db.patch(stock._id, { quantite: apres, majLe: params.maintenant })
  } else {
    await ctx.db.insert("gmaoStocks", {
      articleId: params.articleId,
      atelierId: params.atelierId,
      quantite: apres,
      seuilReappro: 0,
      quantiteReappro: 0,
      emplacement: "À ranger",
      majLe: params.maintenant,
    })
  }
  const valeurFcfa = Math.round(params.quantite * article.prixUnitaireFcfa)
  const mouvementId = await ctx.db.insert("gmaoMouvements", {
    articleId: params.articleId,
    atelierId: params.atelierId,
    sens: params.sens,
    quantite: params.quantite,
    ecart: params.ecart,
    quantiteApres: apres,
    valeurFcfa,
    motif: params.motif,
    otId: params.otId,
    demandeAchatId: params.demandeAchatId,
    auteurId: params.auteurId,
    creeLe: params.maintenant,
  })
  await journaliserGmao(ctx, {
    entite: "article",
    entiteId: params.articleId,
    table: "gmaoMouvements",
    type: `stock_${params.sens}`,
    libelle:
      params.sens === "entree"
        ? `Entrée de ${params.quantite} ${article.unite}`
        : params.sens === "sortie"
          ? `Sortie de ${params.quantite} ${article.unite}`
          : `Ajustement d'inventaire (${variation > 0 ? "+" : ""}${variation} ${article.unite})`,
    detail: params.motif,
    auteurId: params.auteurId,
    avant: { quantite: disponible },
    apres: { quantite: apres, mouvementId },
    maintenant: params.maintenant,
  })
  return { mouvementId, quantiteApres: apres, valeurFcfa, article }
}

async function journalOt(
  ctx: MutationCtx,
  ot: Doc<"gmaoOrdresTravail">,
  params: {
    type: string
    libelle: string
    detail?: string
    auteurId: Id<"users">
    avant?: unknown
    apres?: unknown
    permission?: "creer" | "modifier" | "valider"
    motif?: string
    maintenant: number
  }
) {
  await journaliserGmao(ctx, {
    entite: "ordre_travail",
    entiteId: ot._id,
    table: "gmaoOrdresTravail",
    ...params,
  })
}

/* ================================================================== Parc */

export const creerEquipement = mutation({
  args: {
    numero: v.string(),
    famille: gmaoFamilleValidator,
    serie: v.string(),
    constructeur: v.string(),
    anneeMiseEnService: v.number(),
    numeroSerie: v.optional(v.string()),
    atelierId: v.id("gmaoAteliers"),
    proprietaire: v.string(),
    compteurKm: v.number(),
    compteurHeures: v.optional(v.number()),
    tareTonnes: v.optional(v.number()),
    chargeUtileTonnes: v.optional(v.number()),
    coachId: v.optional(v.id("coaches")),
    trainId: v.optional(v.id("trains")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "parc_administrer", "creer")
    const maintenant = Date.now()
    const numero = texteRequis(args.numero, "Le numéro de l'engin", 40).toUpperCase()
    const doublon = await ctx.db
      .query("gmaoEquipements")
      .withIndex("by_numero", (q) => q.eq("numero", numero))
      .first()
    if (doublon) throw new Error(`Le numéro ${numero} existe déjà dans le parc.`)
    const annee = new Date(maintenant).getUTCFullYear()
    if (!Number.isInteger(args.anneeMiseEnService) || args.anneeMiseEnService < 1950 || args.anneeMiseEnService > annee) {
      throw new Error(`L'année de mise en service doit être comprise entre 1950 et ${annee}.`)
    }
    await charger(ctx, args.atelierId, "Atelier")
    if (args.coachId) {
      if (args.famille !== "voiture") {
        throw new Error("Seule une voiture voyageurs se rattache à une voiture du référentiel.")
      }
      const coach = await ctx.db.get(args.coachId)
      if (!coach) throw new Error("Voiture du référentiel introuvable.")
      const deja = await ctx.db
        .query("gmaoEquipements")
        .withIndex("by_coach", (q) => q.eq("coachId", args.coachId))
        .first()
      if (deja) throw new Error(`Cette voiture est déjà suivie sous le numéro ${deja.numero}.`)
    }
    if (args.trainId && !(await ctx.db.get(args.trainId))) {
      throw new Error("Train introuvable.")
    }
    const compteurKm = nombrePositifOuNul(args.compteurKm, "Le compteur kilométrique", 20_000_000)
    const compteurHeures = nombrePositifOuNul(args.compteurHeures ?? 0, "Le compteur horaire", 1_000_000)
    const equipementId = await ctx.db.insert("gmaoEquipements", {
      numero,
      famille: args.famille,
      serie: texteRequis(args.serie, "La série", 80),
      constructeur: texteRequis(args.constructeur, "Le constructeur", 80),
      anneeMiseEnService: args.anneeMiseEnService,
      numeroSerie: texteFacultatif(args.numeroSerie, "Le numéro de série", 80),
      coachId: args.coachId,
      trainId: args.trainId,
      atelierId: args.atelierId,
      statut: "en_service",
      statutDepuis: maintenant,
      compteurKm,
      compteurHeures,
      compteurReleveLe: maintenant,
      proprietaire: texteRequis(args.proprietaire, "Le propriétaire", 80),
      tareTonnes: args.tareTonnes,
      chargeUtileTonnes: args.chargeUtileTonnes,
      notes: texteFacultatif(args.notes, "Les notes"),
      creeLe: maintenant,
      majLe: maintenant,
    })
    await ctx.db.insert("gmaoReleves", {
      equipementId,
      km: compteurKm,
      heures: compteurHeures,
      releveLe: maintenant,
      source: "saisie",
      auteurId: user._id,
    })
    // Les plans préventifs de la série s'appliquent dès l'entrée au parc.
    const plans = (await ctx.db.query("gmaoPlans").collect()).filter(
      (plan) =>
        plan.isActive &&
        plan.famille === args.famille &&
        (plan.series.length === 0 || plan.series.includes(args.serie.trim()))
    )
    for (const plan of plans) {
      await ctx.db.insert("gmaoPlansEquipements", {
        planId: plan._id,
        equipementId,
        derniereRealisationLe: maintenant,
        derniereRealisationKm: compteurKm,
      })
    }
    await journaliserGmao(ctx, {
      entite: "equipement",
      entiteId: equipementId,
      table: "gmaoEquipements",
      type: "creation",
      libelle: `Entrée au parc de ${numero}`,
      detail: plans.length > 0 ? `${plans.length} plan(s) préventif(s) rattaché(s)` : undefined,
      auteurId: user._id,
      permission: "creer",
      apres: { numero, famille: args.famille, serie: args.serie },
      maintenant,
    })
    return { equipementId, numero, plansRattaches: plans.length }
  },
})

export const modifierEquipement = mutation({
  args: {
    equipementId: v.id("gmaoEquipements"),
    serie: v.optional(v.string()),
    constructeur: v.optional(v.string()),
    numeroSerie: v.optional(v.string()),
    atelierId: v.optional(v.id("gmaoAteliers")),
    proprietaire: v.optional(v.string()),
    trainId: v.optional(v.union(v.id("trains"), v.null())),
    tareTonnes: v.optional(v.number()),
    chargeUtileTonnes: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "parc_administrer")
    const engin = await charger(ctx, args.equipementId, "Engin")
    if (engin.statut === "reforme") throw new Error("Un engin réformé n'est plus modifiable.")
    const maintenant = Date.now()
    if (args.atelierId) await charger(ctx, args.atelierId, "Atelier")
    if (args.trainId) {
      if (!(await ctx.db.get(args.trainId))) throw new Error("Train introuvable.")
    }
    const patch: Partial<Doc<"gmaoEquipements">> = { majLe: maintenant }
    if (args.serie !== undefined) patch.serie = texteRequis(args.serie, "La série", 80)
    if (args.constructeur !== undefined) patch.constructeur = texteRequis(args.constructeur, "Le constructeur", 80)
    if (args.numeroSerie !== undefined) patch.numeroSerie = texteFacultatif(args.numeroSerie, "Le numéro de série", 80)
    if (args.atelierId !== undefined) patch.atelierId = args.atelierId
    if (args.proprietaire !== undefined) patch.proprietaire = texteRequis(args.proprietaire, "Le propriétaire", 80)
    if (args.trainId !== undefined) patch.trainId = args.trainId ?? undefined
    if (args.tareTonnes !== undefined) patch.tareTonnes = nombrePositifOuNul(args.tareTonnes, "La tare", 500)
    if (args.chargeUtileTonnes !== undefined) patch.chargeUtileTonnes = nombrePositifOuNul(args.chargeUtileTonnes, "La charge utile", 500)
    if (args.notes !== undefined) patch.notes = texteFacultatif(args.notes, "Les notes")
    await ctx.db.patch(engin._id, patch)
    const avant = Object.fromEntries(Object.keys(patch).map((cle) => [cle, engin[cle as keyof typeof engin]]))
    await journaliserGmao(ctx, {
      entite: "equipement",
      entiteId: engin._id,
      table: "gmaoEquipements",
      type: "modification",
      libelle: "Fiche de l'engin mise à jour",
      detail: Object.keys(patch).filter((cle) => cle !== "majLe").join(", "),
      auteurId: user._id,
      avant,
      apres: patch,
      maintenant,
    })
    return { equipementId: engin._id }
  },
})

export const changerStatutEquipement = mutation({
  args: {
    equipementId: v.id("gmaoEquipements"),
    statut: v.union(v.literal("en_service"), v.literal("immobilise"), v.literal("reforme")),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "parc_administrer")
    const engin = await charger(ctx, args.equipementId, "Engin")
    const motif = texteRequis(args.motif, "Le motif", 500)
    const maintenant = Date.now()
    if (engin.statut === "reforme") {
      throw new Error("Un engin réformé ne revient pas au parc : créez une nouvelle fiche.")
    }
    const ouverts = (
      await ctx.db
        .query("gmaoOrdresTravail")
        .withIndex("by_equipement", (q) => q.eq("equipementId", engin._id))
        .collect()
    ).filter((ot) => estOtOuvert(ot.statut))
    if (args.statut === "reforme") {
      if (ouverts.length > 0) {
        throw new Error(
          `Réforme refusée : ${ouverts.length} ordre(s) de travail ouvert(s) (${ouverts.map((ot) => ot.numero).join(", ")}).`
        )
      }
      await ctx.db.patch(engin._id, {
        statut: "reforme",
        motifStatut: motif,
        immobilisationManuelle: undefined,
        statutDepuis: maintenant,
        trainId: undefined,
        majLe: maintenant,
      })
      for (const rattachement of await ctx.db
        .query("gmaoPlansEquipements")
        .withIndex("by_equipement", (q) => q.eq("equipementId", engin._id))
        .collect()) {
        await ctx.db.delete(rattachement._id)
      }
    } else if (args.statut === "immobilise") {
      if (engin.immobilisationManuelle) {
        throw new Error("L'engin est déjà immobilisé sur décision : modifiez ou levez cette décision.")
      }
      await ctx.db.patch(engin._id, { immobilisationManuelle: motif, majLe: maintenant })
    } else {
      const immobilisants = ouverts.filter((ot) => ot.immobilisant)
      if (immobilisants.length > 0) {
        throw new Error(
          `Remise en service refusée : l'${immobilisants[0]!.numero} immobilise l'engin. Clôturez-le d'abord.`
        )
      }
      if (engin.statut === "en_service") throw new Error("L'engin est déjà en service.")
      await ctx.db.patch(engin._id, { immobilisationManuelle: undefined, majLe: maintenant })
    }
    await journaliserGmao(ctx, {
      entite: "equipement",
      entiteId: engin._id,
      table: "gmaoEquipements",
      type: args.statut === "reforme" ? "reforme" : args.statut === "immobilise" ? "immobilisation" : "remise_en_service",
      libelle:
        args.statut === "reforme"
          ? "Engin réformé"
          : args.statut === "immobilise"
            ? "Immobilisation décidée"
            : "Remise en service décidée",
      detail: motif,
      auteurId: user._id,
      permission: args.statut === "reforme" ? "valider" : "modifier",
      motif,
      avant: { statut: engin.statut, immobilisationManuelle: engin.immobilisationManuelle },
      apres: { statut: args.statut },
      maintenant,
    })
    if (args.statut !== "reforme") {
      await recalculerStatutEngin(ctx, engin._id, user._id, maintenant)
    }
    const apres = await ctx.db.get(engin._id)
    return { equipementId: engin._id, statut: apres?.statut ?? args.statut }
  },
})

export const releverCompteurs = mutation({
  args: {
    equipementId: v.id("gmaoEquipements"),
    km: v.number(),
    heures: v.optional(v.number()),
    releveLe: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "compteur_relever", "creer")
    const engin = await charger(ctx, args.equipementId, "Engin")
    if (engin.statut === "reforme") throw new Error("Un engin réformé ne reçoit plus de relevé.")
    const maintenant = Date.now()
    const releveLe = args.releveLe ?? maintenant
    if (releveLe > maintenant + HEURE_MS) throw new Error("Un relevé ne peut pas être daté dans le futur.")
    if (releveLe < engin.compteurReleveLe) {
      throw new Error("Un relevé plus récent existe déjà pour cet engin.")
    }
    const km = nombrePositifOuNul(args.km, "Le compteur kilométrique", 20_000_000)
    if (km < engin.compteurKm) {
      throw new Error(
        `Le compteur ne recule pas : dernier relevé à ${engin.compteurKm.toLocaleString("fr-FR")} km.`
      )
    }
    const jours = Math.max(1, (releveLe - engin.compteurReleveLe) / JOUR_MS)
    if ((km - engin.compteurKm) / jours > 2_000) {
      throw new Error("Relevé invraisemblable : plus de 2 000 km par jour depuis le dernier relevé.")
    }
    const heures = nombrePositifOuNul(args.heures ?? engin.compteurHeures, "Le compteur horaire", 1_000_000)
    if (heures < engin.compteurHeures) {
      throw new Error(`Le compteur horaire ne recule pas : dernier relevé à ${engin.compteurHeures} h.`)
    }
    await ctx.db.insert("gmaoReleves", {
      equipementId: engin._id,
      km,
      heures,
      releveLe,
      source: "saisie",
      auteurId: user._id,
    })
    await ctx.db.patch(engin._id, { compteurKm: km, compteurHeures: heures, compteurReleveLe: releveLe, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "equipement",
      entiteId: engin._id,
      table: "gmaoEquipements",
      type: "releve",
      libelle: `Relevé de compteur : ${km.toLocaleString("fr-FR")} km`,
      detail: `+${(km - engin.compteurKm).toLocaleString("fr-FR")} km depuis le précédent relevé`,
      auteurId: user._id,
      permission: "creer",
      avant: { km: engin.compteurKm, heures: engin.compteurHeures },
      apres: { km, heures },
      maintenant,
    })
    return { equipementId: engin._id, km, heures }
  },
})

/* =========================================================== Préventif */

export const creerPlan = mutation({
  args: {
    code: v.string(),
    libelle: v.string(),
    famille: gmaoFamilleValidator,
    series: v.array(v.string()),
    seuilKm: v.optional(v.number()),
    seuilJours: v.optional(v.number()),
    alertePct: v.number(),
    dureeHeures: v.number(),
    immobilisant: v.boolean(),
    operations: v.array(v.string()),
    rattacherParc: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "plan_administrer", "creer")
    const maintenant = Date.now()
    const code = texteRequis(args.code, "Le code du plan", 20).toUpperCase()
    if (await ctx.db.query("gmaoPlans").withIndex("by_code", (q) => q.eq("code", code)).first()) {
      throw new Error(`Le plan ${code} existe déjà.`)
    }
    validerSeuilsPlan(args)
    const operations = args.operations.map((operation) => operation.trim()).filter(Boolean)
    if (operations.length === 0) throw new Error("Décrivez au moins une opération de la gamme.")
    const series = args.series.map((serie) => serie.trim()).filter(Boolean)
    const planId = await ctx.db.insert("gmaoPlans", {
      code,
      libelle: texteRequis(args.libelle, "Le libellé", 160),
      famille: args.famille,
      series,
      seuilKm: args.seuilKm,
      seuilJours: args.seuilJours,
      alertePct: args.alertePct,
      dureeHeures: args.dureeHeures,
      immobilisant: args.immobilisant,
      operations,
      isActive: true,
      creeLe: maintenant,
      majLe: maintenant,
    })
    let rattaches = 0
    if (args.rattacherParc) {
      const engins = (
        await ctx.db
          .query("gmaoEquipements")
          .withIndex("by_famille", (q) => q.eq("famille", args.famille))
          .collect()
      ).filter(
        (engin) => engin.statut !== "reforme" && (series.length === 0 || series.includes(engin.serie))
      )
      for (const engin of engins) {
        await ctx.db.insert("gmaoPlansEquipements", {
          planId,
          equipementId: engin._id,
          derniereRealisationLe: maintenant,
          derniereRealisationKm: engin.compteurKm,
        })
        rattaches += 1
      }
    }
    await journaliserGmao(ctx, {
      entite: "plan",
      entiteId: planId,
      table: "gmaoPlans",
      type: "creation",
      libelle: `Création du plan ${code}`,
      detail: `${rattaches} engin(s) rattaché(s)`,
      auteurId: user._id,
      permission: "creer",
      apres: { code, seuilKm: args.seuilKm, seuilJours: args.seuilJours },
      maintenant,
    })
    return { planId, rattaches }
  },
})

export const modifierPlan = mutation({
  args: {
    planId: v.id("gmaoPlans"),
    libelle: v.optional(v.string()),
    seuilKm: v.optional(v.union(v.number(), v.null())),
    seuilJours: v.optional(v.union(v.number(), v.null())),
    alertePct: v.optional(v.number()),
    dureeHeures: v.optional(v.number()),
    immobilisant: v.optional(v.boolean()),
    operations: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "plan_administrer")
    const plan = await charger(ctx, args.planId, "Plan")
    const maintenant = Date.now()
    const suivant = {
      libelle: args.libelle !== undefined ? texteRequis(args.libelle, "Le libellé", 160) : plan.libelle,
      seuilKm: args.seuilKm === undefined ? plan.seuilKm : (args.seuilKm ?? undefined),
      seuilJours: args.seuilJours === undefined ? plan.seuilJours : (args.seuilJours ?? undefined),
      alertePct: args.alertePct ?? plan.alertePct,
      dureeHeures: args.dureeHeures ?? plan.dureeHeures,
      immobilisant: args.immobilisant ?? plan.immobilisant,
      operations:
        args.operations !== undefined
          ? args.operations.map((operation) => operation.trim()).filter(Boolean)
          : plan.operations,
      isActive: args.isActive ?? plan.isActive,
    }
    validerSeuilsPlan(suivant)
    if (suivant.operations.length === 0) throw new Error("Décrivez au moins une opération de la gamme.")
    await ctx.db.patch(plan._id, { ...suivant, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "plan",
      entiteId: plan._id,
      table: "gmaoPlans",
      type: args.isActive === false ? "desactivation" : "modification",
      libelle: args.isActive === false ? `Plan ${plan.code} désactivé` : `Plan ${plan.code} mis à jour`,
      auteurId: user._id,
      avant: { seuilKm: plan.seuilKm, seuilJours: plan.seuilJours, isActive: plan.isActive },
      apres: { seuilKm: suivant.seuilKm, seuilJours: suivant.seuilJours, isActive: suivant.isActive },
      maintenant,
    })
    return { planId: plan._id }
  },
})

export const rattacherEngins = mutation({
  args: {
    planId: v.id("gmaoPlans"),
    equipementIds: v.array(v.id("gmaoEquipements")),
    derniereRealisationLe: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "plan_administrer")
    const plan = await charger(ctx, args.planId, "Plan")
    if (args.equipementIds.length === 0) throw new Error("Choisissez au moins un engin.")
    const maintenant = Date.now()
    const le = args.derniereRealisationLe ?? maintenant
    if (le > maintenant) throw new Error("La dernière réalisation ne peut pas être future.")
    let ajoutes = 0
    for (const equipementId of args.equipementIds) {
      const engin = await charger(ctx, equipementId, "Engin")
      if (engin.famille !== plan.famille) {
        throw new Error(`${engin.numero} n'appartient pas à la famille du plan ${plan.code}.`)
      }
      if (engin.statut === "reforme") throw new Error(`${engin.numero} est réformé.`)
      const existe = await ctx.db
        .query("gmaoPlansEquipements")
        .withIndex("by_plan_equipement", (q) => q.eq("planId", plan._id).eq("equipementId", equipementId))
        .first()
      if (existe) continue
      await ctx.db.insert("gmaoPlansEquipements", {
        planId: plan._id,
        equipementId,
        derniereRealisationLe: le,
        derniereRealisationKm: engin.compteurKm,
      })
      ajoutes += 1
    }
    await journaliserGmao(ctx, {
      entite: "plan",
      entiteId: plan._id,
      table: "gmaoPlansEquipements",
      type: "rattachement",
      libelle: `${ajoutes} engin(s) rattaché(s) au plan`,
      auteurId: user._id,
      apres: { equipementIds: args.equipementIds },
      maintenant,
    })
    return { ajoutes }
  },
})

export const detacherEngin = mutation({
  args: { planEquipementId: v.id("gmaoPlansEquipements"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "plan_administrer")
    const rattachement = await ctx.db.get(args.planEquipementId)
    if (!rattachement) throw new Error("Rattachement introuvable.")
    if (rattachement.otOuvertId) {
      const ot = await ctx.db.get(rattachement.otOuvertId)
      if (ot && estOtOuvert(ot.statut)) {
        throw new Error(`Détachement refusé : l'${ot.numero} est ouvert pour cette échéance.`)
      }
    }
    const motif = texteRequis(args.motif, "Le motif", 300)
    await ctx.db.delete(rattachement._id)
    const engin = await ctx.db.get(rattachement.equipementId)
    await journaliserGmao(ctx, {
      entite: "plan",
      entiteId: rattachement.planId,
      table: "gmaoPlansEquipements",
      type: "detachement",
      libelle: `${engin?.numero ?? "Engin"} détaché du plan`,
      detail: motif,
      motif,
      auteurId: user._id,
      avant: rattachement,
    })
    return { ok: true }
  },
})

/* ===================================================== Ordres de travail */

interface CreationOt {
  equipement: Doc<"gmaoEquipements">
  type: Doc<"gmaoOrdresTravail">["type"]
  origine: Doc<"gmaoOrdresTravail">["origine"]
  priorite: Doc<"gmaoOrdresTravail">["priorite"]
  titre: string
  description: string
  atelierId: Id<"gmaoAteliers">
  immobilisant: boolean
  planId?: Id<"gmaoPlans">
  planEquipementId?: Id<"gmaoPlansEquipements">
  visiteId?: Id<"gmaoVisites">
  incidentId?: Id<"incidents">
  organe?: string
  auteurId: Id<"users">
  maintenant: number
}

async function insererOt(ctx: MutationCtx, params: CreationOt) {
  const numero = await prochainNumero(ctx, "OT", params.maintenant)
  const otId = await ctx.db.insert("gmaoOrdresTravail", {
    numero,
    equipementId: params.equipement._id,
    type: params.type,
    origine: params.origine,
    planId: params.planId,
    planEquipementId: params.planEquipementId,
    visiteId: params.visiteId,
    incidentId: params.incidentId,
    priorite: params.priorite,
    titre: params.titre,
    description: params.description,
    statut: "demande",
    atelierId: params.atelierId,
    immobilisant: params.immobilisant,
    coutMainOeuvreFcfa: 0,
    coutPiecesFcfa: 0,
    coutExterneFcfa: 0,
    heuresPassees: 0,
    organe: params.organe,
    demandeurId: params.auteurId,
    demandeLe: params.maintenant,
    majLe: params.maintenant,
  })
  if (params.planEquipementId) {
    await ctx.db.patch(params.planEquipementId, { otOuvertId: otId })
  }
  const ot = (await ctx.db.get(otId))!
  await journalOt(ctx, ot, {
    type: "creation",
    libelle: `Demande ${numero} créée`,
    detail: `${params.equipement.numero} · ${params.titre}`,
    auteurId: params.auteurId,
    permission: "creer",
    apres: { numero, priorite: params.priorite, immobilisant: params.immobilisant },
    maintenant: params.maintenant,
  })
  await journaliserGmao(ctx, {
    entite: "equipement",
    entiteId: params.equipement._id,
    table: "gmaoOrdresTravail",
    type: "ot_demande",
    libelle: `${numero} demandé`,
    detail: params.titre,
    auteurId: params.auteurId,
    permission: "creer",
    maintenant: params.maintenant,
  })
  // Un défaut urgent rend l'engin inapte sans attendre l'atelier.
  if (params.immobilisant && (params.priorite === "urgente" || params.origine === "visite_technique")) {
    await recalculerStatutEngin(ctx, params.equipement._id, params.auteurId, params.maintenant)
  }
  return { otId, numero }
}

export const creerOt = mutation({
  args: {
    equipementId: v.id("gmaoEquipements"),
    type: gmaoTypeOtValidator,
    priorite: gmaoPrioriteValidator,
    titre: v.string(),
    description: v.string(),
    atelierId: v.optional(v.id("gmaoAteliers")),
    immobilisant: v.boolean(),
    incidentId: v.optional(v.id("incidents")),
    organe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_demander", "creer")
    const engin = await charger(ctx, args.equipementId, "Engin")
    if (engin.statut === "reforme") throw new Error("Un engin réformé ne reçoit plus d'ordre de travail.")
    const atelierId = args.atelierId ?? engin.atelierId
    await charger(ctx, atelierId, "Atelier")
    if (args.incidentId && !(await ctx.db.get(args.incidentId))) {
      throw new Error("Incident introuvable.")
    }
    return await insererOt(ctx, {
      equipement: engin,
      type: args.type,
      origine: args.incidentId ? "incident" : "demande",
      priorite: args.priorite,
      titre: texteRequis(args.titre, "L'intitulé", 160),
      description: texteRequis(args.description, "La description", 4000),
      atelierId,
      immobilisant: args.immobilisant,
      incidentId: args.incidentId,
      organe: texteFacultatif(args.organe, "L'organe", 120),
      auteurId: user._id,
      maintenant: Date.now(),
    })
  },
})

/** Ouvre un OT préventif pour chaque échéance choisie qui n'en a pas. */
export const genererOtPreventifs = mutation({
  args: { planEquipementIds: v.array(v.id("gmaoPlansEquipements")) },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_planifier", "creer")
    if (args.planEquipementIds.length === 0) throw new Error("Choisissez au moins une échéance.")
    if (args.planEquipementIds.length > 100) throw new Error("Cent échéances au plus par lot.")
    const maintenant = Date.now()
    const crees: { otId: Id<"gmaoOrdresTravail">; numero: string }[] = []
    let ignores = 0
    for (const planEquipementId of args.planEquipementIds) {
      const rattachement = await ctx.db.get(planEquipementId)
      if (!rattachement) throw new Error("Échéance introuvable.")
      if (rattachement.otOuvertId) {
        const existant = await ctx.db.get(rattachement.otOuvertId)
        if (existant && estOtOuvert(existant.statut)) {
          ignores += 1
          continue
        }
      }
      const plan = await charger(ctx, rattachement.planId, "Plan")
      const engin = await charger(ctx, rattachement.equipementId, "Engin")
      if (engin.statut === "reforme" || !plan.isActive) {
        ignores += 1
        continue
      }
      crees.push(
        await insererOt(ctx, {
          equipement: engin,
          type: "preventif",
          origine: "plan",
          priorite: "normale",
          titre: `${plan.code} — ${plan.libelle}`,
          description: plan.operations.map((operation) => `• ${operation}`).join("\n"),
          atelierId: engin.atelierId,
          immobilisant: plan.immobilisant,
          planId: plan._id,
          planEquipementId,
          auteurId: user._id,
          maintenant,
        })
      )
    }
    return { crees, ignores }
  },
})

export const modifierOt = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    titre: v.optional(v.string()),
    description: v.optional(v.string()),
    priorite: v.optional(gmaoPrioriteValidator),
    immobilisant: v.optional(v.boolean()),
    organe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_planifier")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    if (ot.statut !== "demande" && ot.statut !== "planifie") {
      throw new Error(`Un OT « ${LIBELLES_STATUT_OT[ot.statut]} » n'est plus modifiable.`)
    }
    const maintenant = Date.now()
    const patch: Partial<Doc<"gmaoOrdresTravail">> = { majLe: maintenant }
    if (args.titre !== undefined) patch.titre = texteRequis(args.titre, "L'intitulé", 160)
    if (args.description !== undefined) patch.description = texteRequis(args.description, "La description", 4000)
    if (args.priorite !== undefined) patch.priorite = args.priorite
    if (args.immobilisant !== undefined) patch.immobilisant = args.immobilisant
    if (args.organe !== undefined) patch.organe = texteFacultatif(args.organe, "L'organe", 120)
    await ctx.db.patch(ot._id, patch)
    await journalOt(ctx, ot, {
      type: "modification",
      libelle: "Demande modifiée",
      detail: Object.keys(patch).filter((cle) => cle !== "majLe").join(", "),
      auteurId: user._id,
      avant: { titre: ot.titre, priorite: ot.priorite, immobilisant: ot.immobilisant },
      apres: patch,
      maintenant,
    })
    await recalculerStatutEngin(ctx, ot.equipementId, user._id, maintenant)
    return { otId: ot._id }
  },
})

export const planifierOt = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    atelierId: v.id("gmaoAteliers"),
    equipe: v.string(),
    debutPrevu: v.number(),
    finPrevue: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_planifier")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    assertTransitionOt(ot.statut, "planifie")
    await charger(ctx, args.atelierId, "Atelier")
    if (!(args.finPrevue > args.debutPrevu)) {
      throw new Error("La fin prévue doit suivre le début prévu.")
    }
    if (args.finPrevue - args.debutPrevu > 120 * JOUR_MS) {
      throw new Error("Une immobilisation planifiée ne dépasse pas 120 jours : découpez l'OT.")
    }
    const maintenant = Date.now()
    const replanification = ot.statut === "planifie"
    await ctx.db.patch(ot._id, {
      statut: "planifie",
      atelierId: args.atelierId,
      equipe: texteRequis(args.equipe, "L'équipe", 120),
      debutPrevu: args.debutPrevu,
      finPrevue: args.finPrevue,
      planifieParId: user._id,
      majLe: maintenant,
    })
    const atelier = await ctx.db.get(args.atelierId)
    await journalOt(ctx, ot, {
      type: replanification ? "replanification" : "planification",
      libelle: replanification ? "OT replanifié" : "OT planifié",
      detail: `${atelier?.nom ?? ""} · équipe ${args.equipe.trim()}`,
      auteurId: user._id,
      avant: { statut: ot.statut, debutPrevu: ot.debutPrevu, finPrevue: ot.finPrevue },
      apres: { statut: "planifie", debutPrevu: args.debutPrevu, finPrevue: args.finPrevue },
      maintenant,
    })
    return { otId: ot._id }
  },
})

export const demarrerOt = mutation({
  args: { otId: v.id("gmaoOrdresTravail") },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_executer")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    assertTransitionOt(ot.statut, "en_cours")
    const engin = await charger(ctx, ot.equipementId, "Engin")
    if (engin.statut === "reforme") throw new Error("L'engin est réformé.")
    const maintenant = Date.now()
    await ctx.db.patch(ot._id, {
      statut: "en_cours",
      debutReel: ot.debutReel ?? maintenant,
      kmDebut: ot.kmDebut ?? engin.compteurKm,
      majLe: maintenant,
    })
    await journalOt(ctx, ot, {
      type: "demarrage",
      libelle: "Travaux commencés",
      detail: ot.immobilisant ? `${engin.numero} entre en atelier` : "Intervention sans immobilisation",
      auteurId: user._id,
      avant: { statut: ot.statut },
      apres: { statut: "en_cours" },
      maintenant,
    })
    if (ot.immobilisant) await recalculerStatutEngin(ctx, engin._id, user._id, maintenant)
    return { otId: ot._id }
  },
})

export const saisirTemps = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    intervenant: v.string(),
    matricule: v.optional(v.string()),
    date: v.number(),
    heures: v.number(),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_executer", "creer")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    if (ot.statut !== "en_cours") {
      throw new Error("Le temps se saisit sur un OT en cours.")
    }
    const maintenant = Date.now()
    if (args.date > maintenant + HEURE_MS) throw new Error("Une saisie de temps ne peut pas être future.")
    if (ot.debutReel !== undefined && args.date < ot.debutReel - JOUR_MS) {
      throw new Error("Cette date précède le début des travaux.")
    }
    const heures = validerHeures(args.heures)
    const atelier = await charger(ctx, ot.atelierId, "Atelier")
    const montant = Math.round(heures * atelier.tauxHoraireFcfa)
    const intervenant = texteRequis(args.intervenant, "L'intervenant", 120)
    const tempsId = await ctx.db.insert("gmaoTempsPasses", {
      otId: ot._id,
      intervenant,
      matricule: texteFacultatif(args.matricule, "Le matricule", 40),
      date: args.date,
      heures,
      tauxHoraireFcfa: atelier.tauxHoraireFcfa,
      commentaire: texteFacultatif(args.commentaire, "Le commentaire", 500),
      saisiParId: user._id,
      saisiLe: maintenant,
    })
    await ctx.db.patch(ot._id, {
      heuresPassees: ot.heuresPassees + heures,
      coutMainOeuvreFcfa: ot.coutMainOeuvreFcfa + montant,
      majLe: maintenant,
    })
    await journalOt(ctx, ot, {
      type: "temps",
      libelle: `${heures.toLocaleString("fr-FR")} h saisies`,
      detail: intervenant,
      auteurId: user._id,
      permission: "creer",
      apres: { tempsId, heures, montant },
      maintenant,
    })
    return { tempsId, montantFcfa: montant }
  },
})

export const consommerPiece = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    articleId: v.id("gmaoArticles"),
    atelierId: v.optional(v.id("gmaoAteliers")),
    quantite: v.number(),
  },
  handler: async (ctx, args) => {
    // Le magasinier sert la pièce ou l'atelier la prélève : les deux gestes valent.
    let user: Doc<"users">
    try {
      user = await exigerGmao(ctx, "ot_executer", "creer")
    } catch {
      user = await exigerGmao(ctx, "stock_mouvementer", "creer")
    }
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    if (ot.statut !== "en_cours") throw new Error("Les pièces se consomment sur un OT en cours.")
    const quantite = quantiteValide(args.quantite)
    const maintenant = Date.now()
    const atelierId = args.atelierId ?? ot.atelierId
    const { mouvementId, valeurFcfa, article, quantiteApres } = await mouvementerStock(ctx, {
      articleId: args.articleId,
      atelierId,
      sens: "sortie",
      quantite,
      motif: `Consommation sur ${ot.numero}`,
      otId: ot._id,
      auteurId: user._id,
      maintenant,
    })
    await ctx.db.patch(ot._id, { coutPiecesFcfa: ot.coutPiecesFcfa + valeurFcfa, majLe: maintenant })
    await journalOt(ctx, ot, {
      type: "piece",
      libelle: `${quantite} ${article.unite} · ${article.reference}`,
      detail: article.designation,
      auteurId: user._id,
      permission: "creer",
      apres: { mouvementId, valeurFcfa },
      maintenant,
    })
    return { mouvementId, valeurFcfa, quantiteRestante: quantiteApres }
  },
})

export const retournerPiece = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    articleId: v.id("gmaoArticles"),
    quantite: v.number(),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users">
    try {
      user = await exigerGmao(ctx, "ot_executer")
    } catch {
      user = await exigerGmao(ctx, "stock_mouvementer")
    }
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    if (ot.statut !== "en_cours" && ot.statut !== "travaux_termines") {
      throw new Error("Un retour de pièce se fait avant la clôture de l'OT.")
    }
    const quantite = quantiteValide(args.quantite)
    const mouvements = (
      await ctx.db
        .query("gmaoMouvements")
        .withIndex("by_ot", (q) => q.eq("otId", ot._id))
        .collect()
    ).filter((mouvement) => mouvement.articleId === args.articleId)
    const sorties = mouvements.filter((m) => m.sens === "sortie")
    const net =
      sorties.reduce((total, m) => total + m.quantite, 0) -
      mouvements.filter((m) => m.sens === "entree").reduce((total, m) => total + m.quantite, 0)
    if (quantite > net) {
      throw new Error(`Retour refusé : ${net} unité(s) seulement ont été consommées sur cet OT.`)
    }
    const atelierId = sorties[0]?.atelierId ?? ot.atelierId
    const maintenant = Date.now()
    const { mouvementId, valeurFcfa, article } = await mouvementerStock(ctx, {
      articleId: args.articleId,
      atelierId,
      sens: "entree",
      quantite,
      motif: `Retour non utilisé de ${ot.numero}`,
      otId: ot._id,
      auteurId: user._id,
      maintenant,
    })
    await ctx.db.patch(ot._id, {
      coutPiecesFcfa: Math.max(0, ot.coutPiecesFcfa - valeurFcfa),
      majLe: maintenant,
    })
    await journalOt(ctx, ot, {
      type: "retour_piece",
      libelle: `Retour de ${quantite} ${article.unite} · ${article.reference}`,
      auteurId: user._id,
      apres: { mouvementId, valeurFcfa },
      maintenant,
    })
    return { mouvementId }
  },
})

export const ajouterCoutExterne = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    montantFcfa: v.number(),
    libelle: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_planifier")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    if (ot.statut !== "en_cours" && ot.statut !== "travaux_termines") {
      throw new Error("Une prestation externe s'impute sur un OT en cours ou en réception.")
    }
    const montant = entierPositif(args.montantFcfa, "Le montant", 5_000_000_000)
    const libelle = texteRequis(args.libelle, "Le libellé de la prestation", 200)
    const maintenant = Date.now()
    await ctx.db.patch(ot._id, { coutExterneFcfa: ot.coutExterneFcfa + montant, majLe: maintenant })
    await journalOt(ctx, ot, {
      type: "cout_externe",
      libelle: `Prestation externe : ${montant.toLocaleString("fr-FR")} XAF`,
      detail: libelle,
      auteurId: user._id,
      avant: { coutExterneFcfa: ot.coutExterneFcfa },
      apres: { coutExterneFcfa: ot.coutExterneFcfa + montant },
      maintenant,
    })
    return { otId: ot._id }
  },
})

export const terminerTravaux = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    compteRendu: v.string(),
    organe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_executer")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    assertTransitionOt(ot.statut, "travaux_termines")
    if (ot.heuresPassees <= 0) {
      throw new Error("Saisissez le temps passé avant de déclarer les travaux terminés.")
    }
    const maintenant = Date.now()
    const compteRendu = texteRequis(args.compteRendu, "Le compte rendu", 4000)
    await ctx.db.patch(ot._id, {
      statut: "travaux_termines",
      finReelle: maintenant,
      compteRendu,
      organe: texteFacultatif(args.organe, "L'organe", 120) ?? ot.organe,
      termineParId: user._id,
      majLe: maintenant,
    })
    await journalOt(ctx, ot, {
      type: "fin_travaux",
      libelle: "Travaux terminés — en attente de réception",
      detail: compteRendu,
      auteurId: user._id,
      avant: { statut: ot.statut },
      apres: { statut: "travaux_termines" },
      maintenant,
    })
    return { otId: ot._id }
  },
})

export const refuserReception = mutation({
  args: { otId: v.id("gmaoOrdresTravail"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_cloturer")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    assertTransitionOt(ot.statut, "en_cours")
    if (ot.statut !== "travaux_termines") throw new Error("Seul un OT en réception peut être refusé.")
    const motif = texteRequis(args.motif, "Le motif", 500)
    const maintenant = Date.now()
    await ctx.db.patch(ot._id, { statut: "en_cours", finReelle: undefined, majLe: maintenant })
    await journalOt(ctx, ot, {
      type: "reception_refusee",
      libelle: "Réception refusée — travaux à reprendre",
      detail: motif,
      motif,
      auteurId: user._id,
      permission: "valider",
      avant: { statut: ot.statut },
      apres: { statut: "en_cours" },
      maintenant,
    })
    return { otId: ot._id }
  },
})

export const cloturerOt = mutation({
  args: {
    otId: v.id("gmaoOrdresTravail"),
    kmCloture: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_cloturer")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    assertTransitionOt(ot.statut, "cloture")
    if (ot.termineParId === user._id) {
      throw new Error(
        "Séparation des tâches : la remise en service revient à un autre agent que celui qui a déclaré les travaux terminés."
      )
    }
    const maintenant = Date.now()
    const engin = await charger(ctx, ot.equipementId, "Engin")
    if (args.kmCloture !== undefined) {
      const km = nombrePositifOuNul(args.kmCloture, "Le compteur kilométrique", 20_000_000)
      if (km < engin.compteurKm) {
        throw new Error(`Le compteur ne recule pas : dernier relevé à ${engin.compteurKm.toLocaleString("fr-FR")} km.`)
      }
      if (km !== engin.compteurKm) {
        await ctx.db.insert("gmaoReleves", {
          equipementId: engin._id,
          km,
          heures: engin.compteurHeures,
          releveLe: maintenant,
          source: "cloture_ot",
          auteurId: user._id,
        })
        await ctx.db.patch(engin._id, { compteurKm: km, compteurReleveLe: maintenant, majLe: maintenant })
      }
    }
    await ctx.db.patch(ot._id, {
      statut: "cloture",
      clotureParId: user._id,
      clotureLe: maintenant,
      majLe: maintenant,
    })
    if (ot.planEquipementId) {
      const rattachement = await ctx.db.get(ot.planEquipementId)
      if (rattachement) {
        const kmActuel = (await ctx.db.get(engin._id))?.compteurKm ?? engin.compteurKm
        await ctx.db.patch(rattachement._id, {
          derniereRealisationLe: ot.finReelle ?? maintenant,
          derniereRealisationKm: kmActuel,
          otOuvertId: undefined,
        })
      }
    }
    await journalOt(ctx, ot, {
      type: "cloture",
      libelle: "OT clôturé — engin réceptionné",
      detail: `Coût total ${(ot.coutMainOeuvreFcfa + ot.coutPiecesFcfa + ot.coutExterneFcfa).toLocaleString("fr-FR")} XAF`,
      auteurId: user._id,
      permission: "valider",
      avant: { statut: ot.statut },
      apres: { statut: "cloture" },
      maintenant,
    })
    await journaliserGmao(ctx, {
      entite: "equipement",
      entiteId: engin._id,
      table: "gmaoOrdresTravail",
      type: "ot_cloture",
      libelle: `${ot.numero} clôturé`,
      detail: ot.titre,
      auteurId: user._id,
      permission: "valider",
      maintenant,
    })
    await recalculerStatutEngin(ctx, engin._id, user._id, maintenant, ot._id)
    return { otId: ot._id }
  },
})

export const annulerOt = mutation({
  args: { otId: v.id("gmaoOrdresTravail"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "ot_planifier")
    const ot = await charger(ctx, args.otId, "Ordre de travail")
    assertTransitionOt(ot.statut, "annule")
    const motif = texteRequis(args.motif, "Le motif d'annulation", 500)
    const maintenant = Date.now()
    await ctx.db.patch(ot._id, { statut: "annule", motifAnnulation: motif, majLe: maintenant })
    if (ot.planEquipementId) {
      const rattachement = await ctx.db.get(ot.planEquipementId)
      if (rattachement?.otOuvertId === ot._id) {
        await ctx.db.patch(rattachement._id, { otOuvertId: undefined })
      }
    }
    await journalOt(ctx, ot, {
      type: "annulation",
      libelle: "OT annulé",
      detail: motif,
      motif,
      auteurId: user._id,
      avant: { statut: ot.statut },
      apres: { statut: "annule" },
      maintenant,
    })
    await recalculerStatutEngin(ctx, ot.equipementId, user._id, maintenant, ot._id)
    return { otId: ot._id }
  },
})

/* =================================================== Visites avant départ */

export const ouvrirVisite = mutation({
  args: {
    tripId: v.optional(v.id("trips")),
    convoi: v.optional(v.string()),
    atelierId: v.id("gmaoAteliers"),
    equipementIds: v.array(v.id("gmaoEquipements")),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "visite_signer", "creer")
    await charger(ctx, args.atelierId, "Atelier")
    const ids = [...new Set(args.equipementIds)]
    if (ids.length === 0) throw new Error("Composez le convoi : au moins un engin.")
    if (ids.length > 150) throw new Error("Un convoi compte au plus 150 engins.")
    const engins = await Promise.all(ids.map((id) => charger(ctx, id, "Engin")))
    const reformes = engins.filter((engin) => engin.statut === "reforme")
    if (reformes.length > 0) {
      throw new Error(`Engin réformé dans le convoi : ${reformes.map((engin) => engin.numero).join(", ")}.`)
    }
    const trip = args.tripId ? await ctx.db.get(args.tripId) : null
    if (args.tripId && !trip) throw new Error("Circulation introuvable.")
    const convoi =
      texteFacultatif(args.convoi, "Le convoi", 60) ?? trip?.trainNumber ?? undefined
    if (!convoi) throw new Error("Indiquez le convoi visité (numéro de train ou de rame).")
    const maintenant = Date.now()
    const numero = await prochainNumero(ctx, "VT", maintenant)
    const familles = [...new Set(engins.map((engin) => engin.famille))] as Famille[]
    const visiteId = await ctx.db.insert("gmaoVisites", {
      numero,
      tripId: args.tripId,
      convoi,
      atelierId: args.atelierId,
      equipementIds: ids,
      controles: controlesPourFamilles(familles),
      defauts: [],
      statut: "en_cours",
      visiteurId: user._id,
      debutLe: maintenant,
      otIds: [],
    })
    await journaliserGmao(ctx, {
      entite: "visite",
      entiteId: visiteId,
      table: "gmaoVisites",
      type: "ouverture",
      libelle: `Visite ${numero} ouverte`,
      detail: `Convoi ${convoi} · ${ids.length} engin(s)`,
      auteurId: user._id,
      permission: "creer",
      maintenant,
    })
    return { visiteId, numero }
  },
})

async function chargerVisiteEnCours(ctx: MutationCtx, visiteId: Id<"gmaoVisites">) {
  const visite = await charger(ctx, visiteId, "Visite")
  if (visite.statut !== "en_cours") throw new Error("Cette visite est signée : elle n'est plus modifiable.")
  return visite
}

export const majControles = mutation({
  args: {
    visiteId: v.id("gmaoVisites"),
    controles: v.array(v.object({ code: v.string(), resultat: gmaoResultatControleValidator })),
    observations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "visite_signer")
    const visite = await chargerVisiteEnCours(ctx, args.visiteId)
    const resultats = new Map(args.controles.map((controle) => [controle.code, controle.resultat]))
    for (const code of resultats.keys()) {
      if (!visite.controles.some((controle) => controle.code === code)) {
        throw new Error(`Contrôle inconnu : ${code}.`)
      }
    }
    const controles = visite.controles.map((controle) => ({
      ...controle,
      resultat: resultats.get(controle.code) ?? controle.resultat,
    }))
    const maintenant = Date.now()
    await ctx.db.patch(visite._id, {
      controles,
      observations: args.observations !== undefined ? texteFacultatif(args.observations, "Les observations") : visite.observations,
    })
    await journaliserGmao(ctx, {
      entite: "visite",
      entiteId: visite._id,
      table: "gmaoVisites",
      type: "controles",
      libelle: "Check-list mise à jour",
      detail: `${controles.filter((controle) => controle.resultat === "defaut").length} contrôle(s) en défaut`,
      auteurId: user._id,
      maintenant,
    })
    return { visiteId: visite._id }
  },
})

export const ajouterDefaut = mutation({
  args: {
    visiteId: v.id("gmaoVisites"),
    equipementId: v.id("gmaoEquipements"),
    organe: v.string(),
    description: v.string(),
    gravite: gmaoGraviteDefautValidator,
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "visite_signer")
    const visite = await chargerVisiteEnCours(ctx, args.visiteId)
    if (!visite.equipementIds.includes(args.equipementId)) {
      throw new Error("Cet engin ne fait pas partie du convoi visité.")
    }
    if (visite.defauts.length >= 200) throw new Error("Trop de défauts sur une même visite.")
    const engin = await charger(ctx, args.equipementId, "Engin")
    const defaut = {
      equipementId: args.equipementId,
      organe: texteRequis(args.organe, "L'organe", 120),
      description: texteRequis(args.description, "La description", 1000),
      gravite: args.gravite,
    }
    const maintenant = Date.now()
    await ctx.db.patch(visite._id, { defauts: [...visite.defauts, defaut] })
    await journaliserGmao(ctx, {
      entite: "visite",
      entiteId: visite._id,
      table: "gmaoVisites",
      type: "defaut",
      libelle: `Défaut ${args.gravite} sur ${engin.numero}`,
      detail: `${defaut.organe} — ${defaut.description}`,
      auteurId: user._id,
      apres: defaut,
      maintenant,
    })
    return { visiteId: visite._id, index: visite.defauts.length }
  },
})

export const retirerDefaut = mutation({
  args: { visiteId: v.id("gmaoVisites"), index: v.number() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "visite_signer")
    const visite = await chargerVisiteEnCours(ctx, args.visiteId)
    const defaut = visite.defauts[args.index]
    if (!defaut) throw new Error("Défaut introuvable.")
    const maintenant = Date.now()
    await ctx.db.patch(visite._id, { defauts: visite.defauts.filter((_d, index) => index !== args.index) })
    await journaliserGmao(ctx, {
      entite: "visite",
      entiteId: visite._id,
      table: "gmaoVisites",
      type: "defaut_retire",
      libelle: "Défaut retiré",
      detail: `${defaut.organe} — ${defaut.description}`,
      auteurId: user._id,
      avant: defaut,
      maintenant,
    })
    return { visiteId: visite._id }
  },
})

/**
 * Signature de la visite : l'aptitude prononcée ne peut pas être plus
 * favorable que les défauts. Chaque défaut majeur ou bloquant ouvre un OT
 * correctif ; un défaut bloquant immobilise l'engin.
 */
export const signerVisite = mutation({
  args: {
    visiteId: v.id("gmaoVisites"),
    aptitude: gmaoAptitudeValidator,
    observations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "visite_signer")
    const visite = await chargerVisiteEnCours(ctx, args.visiteId)
    assertAptitudeAdmise(args.aptitude, visite.defauts)
    if (visite.controles.some((controle) => controle.resultat === "defaut") && visite.defauts.length === 0) {
      throw new Error("Un contrôle est noté en défaut : décrivez le défaut constaté avant de signer.")
    }
    const maintenant = Date.now()
    const otIds: Id<"gmaoOrdresTravail">[] = []
    for (const defaut of visite.defauts) {
      if (defaut.gravite === "mineur") continue
      const engin = await charger(ctx, defaut.equipementId, "Engin")
      const { otId } = await insererOt(ctx, {
        equipement: engin,
        type: "correctif",
        origine: "visite_technique",
        priorite: prioriteDefaut(defaut.gravite),
        titre: `${defaut.organe} — défaut ${defaut.gravite} relevé en visite`,
        description: `${defaut.description}\n\nRelevé lors de la visite ${visite.numero} (convoi ${visite.convoi}).`,
        atelierId: visite.atelierId,
        immobilisant: defaut.gravite === "bloquant",
        visiteId: visite._id,
        organe: defaut.organe,
        auteurId: user._id,
        maintenant,
      })
      otIds.push(otId)
    }
    await ctx.db.patch(visite._id, {
      statut: "signee",
      aptitude: args.aptitude,
      observations: args.observations !== undefined ? texteFacultatif(args.observations, "Les observations") : visite.observations,
      visiteurId: user._id,
      signeeLe: maintenant,
      otIds,
    })
    await journaliserGmao(ctx, {
      entite: "visite",
      entiteId: visite._id,
      table: "gmaoVisites",
      type: "signature",
      libelle: `Visite signée : ${LIBELLES_APTITUDE[args.aptitude]}`,
      detail: otIds.length > 0 ? `${otIds.length} ordre(s) de travail ouvert(s)` : undefined,
      auteurId: user._id,
      permission: "valider",
      apres: { aptitude: args.aptitude, otIds },
      maintenant,
    })
    return { visiteId: visite._id, aptitude: args.aptitude, otIds }
  },
})

/* ================================================================ Stock */

export const creerArticle = mutation({
  args: {
    reference: v.string(),
    designation: v.string(),
    famille: v.string(),
    unite: v.string(),
    prixUnitaireFcfa: v.number(),
    fournisseur: v.string(),
    delaiApproJours: v.number(),
    critique: v.boolean(),
    compatibilite: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer", "creer")
    const reference = texteRequis(args.reference, "La référence", 40).toUpperCase()
    if (await ctx.db.query("gmaoArticles").withIndex("by_reference", (q) => q.eq("reference", reference)).first()) {
      throw new Error(`La référence ${reference} existe déjà.`)
    }
    const maintenant = Date.now()
    const articleId = await ctx.db.insert("gmaoArticles", {
      reference,
      designation: texteRequis(args.designation, "La désignation", 200),
      famille: texteRequis(args.famille, "La famille", 60),
      unite: texteRequis(args.unite, "L'unité", 12),
      prixUnitaireFcfa: entierPositif(args.prixUnitaireFcfa, "Le prix unitaire", 1_000_000_000),
      fournisseur: texteRequis(args.fournisseur, "Le fournisseur", 120),
      delaiApproJours: entierPositif(args.delaiApproJours, "Le délai d'approvisionnement", 720),
      critique: args.critique,
      compatibilite: texteRequis(args.compatibilite, "La compatibilité", 300),
      isActive: true,
      creeLe: maintenant,
      majLe: maintenant,
    })
    await journaliserGmao(ctx, {
      entite: "article",
      entiteId: articleId,
      table: "gmaoArticles",
      type: "creation",
      libelle: `Article ${reference} créé`,
      auteurId: user._id,
      permission: "creer",
      apres: { reference, prix: args.prixUnitaireFcfa },
      maintenant,
    })
    return { articleId }
  },
})

export const modifierArticle = mutation({
  args: {
    articleId: v.id("gmaoArticles"),
    designation: v.optional(v.string()),
    famille: v.optional(v.string()),
    prixUnitaireFcfa: v.optional(v.number()),
    fournisseur: v.optional(v.string()),
    delaiApproJours: v.optional(v.number()),
    critique: v.optional(v.boolean()),
    compatibilite: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer")
    const article = await charger(ctx, args.articleId, "Article")
    const maintenant = Date.now()
    const patch: Partial<Doc<"gmaoArticles">> = { majLe: maintenant }
    if (args.designation !== undefined) patch.designation = texteRequis(args.designation, "La désignation", 200)
    if (args.famille !== undefined) patch.famille = texteRequis(args.famille, "La famille", 60)
    if (args.prixUnitaireFcfa !== undefined) patch.prixUnitaireFcfa = entierPositif(args.prixUnitaireFcfa, "Le prix unitaire", 1_000_000_000)
    if (args.fournisseur !== undefined) patch.fournisseur = texteRequis(args.fournisseur, "Le fournisseur", 120)
    if (args.delaiApproJours !== undefined) patch.delaiApproJours = entierPositif(args.delaiApproJours, "Le délai d'approvisionnement", 720)
    if (args.critique !== undefined) patch.critique = args.critique
    if (args.compatibilite !== undefined) patch.compatibilite = texteRequis(args.compatibilite, "La compatibilité", 300)
    if (args.isActive !== undefined) patch.isActive = args.isActive
    await ctx.db.patch(article._id, patch)
    await journaliserGmao(ctx, {
      entite: "article",
      entiteId: article._id,
      table: "gmaoArticles",
      type: args.isActive === false ? "desactivation" : "modification",
      libelle: args.isActive === false ? "Article désactivé" : "Fiche article mise à jour",
      detail: Object.keys(patch).filter((cle) => cle !== "majLe").join(", "),
      auteurId: user._id,
      avant: { prixUnitaireFcfa: article.prixUnitaireFcfa, isActive: article.isActive },
      apres: patch,
      maintenant,
    })
    return { articleId: article._id }
  },
})

export const parametrerStock = mutation({
  args: {
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    seuilReappro: v.number(),
    quantiteReappro: v.number(),
    emplacement: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer")
    await charger(ctx, args.articleId, "Article")
    await charger(ctx, args.atelierId, "Magasin")
    const seuil = nombrePositifOuNul(args.seuilReappro, "Le seuil de réapprovisionnement", 100_000)
    const quantiteReappro = nombrePositifOuNul(args.quantiteReappro, "La quantité de réapprovisionnement", 100_000)
    const emplacement = texteRequis(args.emplacement, "L'emplacement", 60)
    const maintenant = Date.now()
    const stock = await ctx.db
      .query("gmaoStocks")
      .withIndex("by_article_atelier", (q) => q.eq("articleId", args.articleId).eq("atelierId", args.atelierId))
      .unique()
    if (stock) {
      await ctx.db.patch(stock._id, { seuilReappro: seuil, quantiteReappro, emplacement, majLe: maintenant })
    } else {
      await ctx.db.insert("gmaoStocks", {
        articleId: args.articleId,
        atelierId: args.atelierId,
        quantite: 0,
        seuilReappro: seuil,
        quantiteReappro,
        emplacement,
        majLe: maintenant,
      })
    }
    const atelier = await ctx.db.get(args.atelierId)
    await journaliserGmao(ctx, {
      entite: "article",
      entiteId: args.articleId,
      table: "gmaoStocks",
      type: "parametrage",
      libelle: `Seuils du magasin ${atelier?.code ?? ""} : ${seuil} / ${quantiteReappro}`,
      detail: `Emplacement ${emplacement}`,
      auteurId: user._id,
      avant: stock ? { seuilReappro: stock.seuilReappro, quantiteReappro: stock.quantiteReappro } : null,
      apres: { seuilReappro: seuil, quantiteReappro },
      maintenant,
    })
    return { ok: true }
  },
})

export const entreeStock = mutation({
  args: {
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    quantite: v.number(),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer", "creer")
    const resultat = await mouvementerStock(ctx, {
      articleId: args.articleId,
      atelierId: args.atelierId,
      sens: "entree",
      quantite: quantiteValide(args.quantite),
      motif: texteRequis(args.motif, "Le motif", 300),
      auteurId: user._id,
      maintenant: Date.now(),
    })
    return { mouvementId: resultat.mouvementId, quantiteApres: resultat.quantiteApres }
  },
})

export const sortieStock = mutation({
  args: {
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    quantite: v.number(),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer", "creer")
    const resultat = await mouvementerStock(ctx, {
      articleId: args.articleId,
      atelierId: args.atelierId,
      sens: "sortie",
      quantite: quantiteValide(args.quantite),
      motif: texteRequis(args.motif, "Le motif", 300),
      auteurId: user._id,
      maintenant: Date.now(),
    })
    return { mouvementId: resultat.mouvementId, quantiteApres: resultat.quantiteApres }
  },
})

export const ajusterInventaire = mutation({
  args: {
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    quantiteComptee: v.number(),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer")
    const comptee = nombrePositifOuNul(args.quantiteComptee, "La quantité comptée", 100_000)
    const stock = await ctx.db
      .query("gmaoStocks")
      .withIndex("by_article_atelier", (q) => q.eq("articleId", args.articleId).eq("atelierId", args.atelierId))
      .unique()
    const ecart = Math.round((comptee - (stock?.quantite ?? 0)) * 100) / 100
    if (ecart === 0) throw new Error("Aucun écart : le stock compté est égal au stock théorique.")
    const resultat = await mouvementerStock(ctx, {
      articleId: args.articleId,
      atelierId: args.atelierId,
      sens: "ajustement",
      quantite: Math.abs(ecart),
      ecart,
      motif: texteRequis(args.motif, "Le motif", 300),
      auteurId: user._id,
      maintenant: Date.now(),
    })
    return { mouvementId: resultat.mouvementId, ecart, quantiteApres: resultat.quantiteApres }
  },
})

/* ============================================================== Achats */

async function insererDemande(
  ctx: MutationCtx,
  params: {
    article: Doc<"gmaoArticles">
    atelierId: Id<"gmaoAteliers">
    quantite: number
    motif: string
    origine: "seuil" | "manuelle" | "ot"
    otId?: Id<"gmaoOrdresTravail">
    auteurId: Id<"users">
    maintenant: number
  }
) {
  const numero = await prochainNumero(ctx, "DA", params.maintenant)
  const montant = Math.round(params.quantite * params.article.prixUnitaireFcfa)
  const demandeId = await ctx.db.insert("gmaoDemandesAchat", {
    numero,
    articleId: params.article._id,
    atelierId: params.atelierId,
    quantite: params.quantite,
    prixUnitaireFcfa: params.article.prixUnitaireFcfa,
    montantFcfa: montant,
    motif: params.motif,
    origine: params.origine,
    otId: params.otId,
    statut: "soumise",
    demandeurId: params.auteurId,
    demandeLe: params.maintenant,
    majLe: params.maintenant,
  })
  await journaliserGmao(ctx, {
    entite: "demande_achat",
    entiteId: demandeId,
    table: "gmaoDemandesAchat",
    type: "creation",
    libelle: `Demande ${numero} soumise`,
    detail: `${params.quantite} ${params.article.unite} · ${params.article.reference} · ${montant.toLocaleString("fr-FR")} XAF`,
    auteurId: params.auteurId,
    permission: "creer",
    apres: { numero, quantite: params.quantite, montant },
    maintenant: params.maintenant,
  })
  await journaliserGmao(ctx, {
    entite: "article",
    entiteId: params.article._id,
    table: "gmaoDemandesAchat",
    type: "achat_demande",
    libelle: `Demande d'achat ${numero}`,
    detail: `${params.quantite} ${params.article.unite}`,
    auteurId: params.auteurId,
    permission: "creer",
    maintenant: params.maintenant,
  })
  return { demandeId, numero }
}

async function achatEnCours(
  ctx: MutationCtx,
  articleId: Id<"gmaoArticles">,
  atelierId: Id<"gmaoAteliers">
) {
  return (
    await ctx.db
      .query("gmaoDemandesAchat")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .collect()
  ).find(
    (demande) =>
      demande.atelierId === atelierId &&
      (demande.statut === "soumise" || demande.statut === "validee" || demande.statut === "commandee")
  )
}

export const demanderAchat = mutation({
  args: {
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    quantite: v.number(),
    motif: v.string(),
    otId: v.optional(v.id("gmaoOrdresTravail")),
  },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "achat_demander", "creer")
    const article = await charger(ctx, args.articleId, "Article")
    if (!article.isActive) throw new Error(`L'article ${article.reference} est désactivé.`)
    await charger(ctx, args.atelierId, "Magasin")
    if (args.otId) await charger(ctx, args.otId, "Ordre de travail")
    return await insererDemande(ctx, {
      article,
      atelierId: args.atelierId,
      quantite: quantiteValide(args.quantite),
      motif: texteRequis(args.motif, "Le motif", 500),
      origine: args.otId ? "ot" : "manuelle",
      otId: args.otId,
      auteurId: user._id,
      maintenant: Date.now(),
    })
  },
})

/** Une demande par stock sous le seuil qui n'a pas déjà d'achat en cours. */
export const genererDemandesSousSeuil = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await exigerGmao(ctx, "achat_demander", "creer")
    const maintenant = Date.now()
    const stocks = await ctx.db.query("gmaoStocks").collect()
    const crees: string[] = []
    for (const stock of stocks) {
      if (!sousSeuil(stock) || stock.seuilReappro <= 0) continue
      const article = await ctx.db.get(stock.articleId)
      if (!article || !article.isActive) continue
      if (await achatEnCours(ctx, stock.articleId, stock.atelierId)) continue
      const quantite = Math.max(
        stock.quantiteReappro,
        Math.ceil(stock.seuilReappro * 2 - stock.quantite),
        1
      )
      const { numero } = await insererDemande(ctx, {
        article,
        atelierId: stock.atelierId,
        quantite,
        motif: `Stock sous le seuil (${stock.quantite} pour un seuil de ${stock.seuilReappro})`,
        origine: "seuil",
        auteurId: user._id,
        maintenant,
      })
      crees.push(numero)
    }
    return { crees }
  },
})

export const validerAchat = mutation({
  args: { demandeId: v.id("gmaoDemandesAchat") },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "achat_valider")
    const demande = await charger(ctx, args.demandeId, "Demande d'achat")
    if (demande.statut !== "soumise") throw new Error("Seule une demande soumise se valide.")
    if (demande.demandeurId === user._id) {
      throw new Error("Séparation des tâches : un autre agent que le demandeur valide l'achat.")
    }
    const maintenant = Date.now()
    await ctx.db.patch(demande._id, { statut: "validee", valideurId: user._id, valideLe: maintenant, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "demande_achat",
      entiteId: demande._id,
      table: "gmaoDemandesAchat",
      type: "validation",
      libelle: "Demande validée",
      detail: `${demande.montantFcfa.toLocaleString("fr-FR")} XAF engagés`,
      auteurId: user._id,
      permission: "valider",
      avant: { statut: demande.statut },
      apres: { statut: "validee" },
      maintenant,
    })
    return { demandeId: demande._id }
  },
})

export const refuserAchat = mutation({
  args: { demandeId: v.id("gmaoDemandesAchat"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "achat_valider")
    const demande = await charger(ctx, args.demandeId, "Demande d'achat")
    if (demande.statut !== "soumise") throw new Error("Seule une demande soumise se refuse.")
    const motif = texteRequis(args.motif, "Le motif de refus", 500)
    const maintenant = Date.now()
    await ctx.db.patch(demande._id, { statut: "refusee", motifRefus: motif, valideurId: user._id, valideLe: maintenant, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "demande_achat",
      entiteId: demande._id,
      table: "gmaoDemandesAchat",
      type: "refus",
      libelle: "Demande refusée",
      detail: motif,
      motif,
      auteurId: user._id,
      permission: "valider",
      avant: { statut: demande.statut },
      apres: { statut: "refusee" },
      maintenant,
    })
    return { demandeId: demande._id }
  },
})

/**
 * Transmission de la commande au fournisseur. Aucun système achats n'est
 * raccordé : la commande est simulée (numéro et date de livraison calculés
 * d'après le délai de l'article) et le dit.
 */
export const commanderAchat = mutation({
  args: { demandeId: v.id("gmaoDemandesAchat") },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "achat_valider")
    const demande = await charger(ctx, args.demandeId, "Demande d'achat")
    if (demande.statut !== "validee") throw new Error("Seule une demande validée se commande.")
    const article = await charger(ctx, demande.articleId, "Article")
    const maintenant = Date.now()
    const commande = {
      numero: await prochainNumero(ctx, "CF", maintenant),
      fournisseur: article.fournisseur,
      passeeLe: maintenant,
      livraisonPrevueLe: maintenant + article.delaiApproJours * JOUR_MS,
      simulee: true,
    }
    await ctx.db.patch(demande._id, { statut: "commandee", commande, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "demande_achat",
      entiteId: demande._id,
      table: "gmaoDemandesAchat",
      type: "commande",
      libelle: `Commande ${commande.numero} transmise (simulée)`,
      detail: `${article.fournisseur} · livraison prévue sous ${article.delaiApproJours} j`,
      auteurId: user._id,
      permission: "valider",
      apres: commande,
      maintenant,
    })
    return { demandeId: demande._id, commande }
  },
})

export const receptionnerAchat = mutation({
  args: { demandeId: v.id("gmaoDemandesAchat"), quantiteRecue: v.number() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "stock_mouvementer", "creer")
    const demande = await charger(ctx, args.demandeId, "Demande d'achat")
    if (demande.statut !== "commandee") throw new Error("Seule une commande passée se réceptionne.")
    const quantite = quantiteValide(args.quantiteRecue, "La quantité reçue")
    if (quantite > demande.quantite * 1.1) {
      throw new Error("La quantité reçue dépasse de plus de 10 % la quantité commandée.")
    }
    const maintenant = Date.now()
    const { mouvementId } = await mouvementerStock(ctx, {
      articleId: demande.articleId,
      atelierId: demande.atelierId,
      sens: "entree",
      quantite,
      motif: `Réception de la commande ${demande.commande?.numero ?? demande.numero}`,
      demandeAchatId: demande._id,
      auteurId: user._id,
      maintenant,
    })
    await ctx.db.patch(demande._id, { statut: "recue", quantiteRecue: quantite, recueLe: maintenant, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "demande_achat",
      entiteId: demande._id,
      table: "gmaoDemandesAchat",
      type: "reception",
      libelle: `Réception de ${quantite} sur ${demande.quantite}`,
      detail: quantite < demande.quantite ? "Livraison partielle : le solde est à recommander." : undefined,
      auteurId: user._id,
      permission: "creer",
      apres: { quantiteRecue: quantite, mouvementId },
      maintenant,
    })
    return { demandeId: demande._id, mouvementId }
  },
})

export const annulerAchat = mutation({
  args: { demandeId: v.id("gmaoDemandesAchat"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerGmao(ctx, "achat_demander")
    const demande = await charger(ctx, args.demandeId, "Demande d'achat")
    if (demande.statut !== "soumise" && demande.statut !== "validee") {
      throw new Error("Seule une demande non commandée s'annule.")
    }
    const motif = texteRequis(args.motif, "Le motif", 500)
    const maintenant = Date.now()
    await ctx.db.patch(demande._id, { statut: "annulee", motifRefus: motif, majLe: maintenant })
    await journaliserGmao(ctx, {
      entite: "demande_achat",
      entiteId: demande._id,
      table: "gmaoDemandesAchat",
      type: "annulation",
      libelle: "Demande annulée",
      detail: motif,
      motif,
      auteurId: user._id,
      avant: { statut: demande.statut },
      apres: { statut: "annulee" },
      maintenant,
    })
    return { demandeId: demande._id }
  },
})
