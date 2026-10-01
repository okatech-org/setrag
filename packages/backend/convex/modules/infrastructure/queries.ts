import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { lireInfra } from "./acces"
import {
  anomalieEnRetard,
  anomalieOuverte,
  avancement,
  bornesJourLibreville,
  COTATIONS_GRAVES,
  gareMajeure,
  JOUR,
  LIBELLES_BAILLEUR,
  LIBELLES_COTATION,
  LIBELLES_GRAVITE,
  LIBELLES_NATURE_CHANTIER,
  LIBELLES_STATUT_AVANCEMENT,
  LIBELLES_STATUT_CHANTIER,
  LIBELLES_STATUT_JALON,
  LIBELLES_TYPE_INSPECTION,
  LONGUEUR_LIGNE_KM,
  maintenanceEnRetard,
  partBetonPonderee,
  perteTempsLtvMinutes,
  pourcentage,
  RANG_GRAVITE,
  statutJalon,
  surveillanceIqoa,
  interventionsEnConflit,
  type Bailleur,
} from "./model"
import {
  chronologie,
  creerContexte,
  dansSection,
  presenterAnomalie,
  presenterEquipement,
  presenterInspectionResume,
  presenterIntervention,
  presenterLtv,
  presenterOuvrage,
  presenterSection,
  recoupe,
  trainsImpactes,
  type Contexte,
} from "./presentation"
import {
  infraBailleurValidator,
  infraCategorieEquipementValidator,
  infraStatutAnomalieValidator,
} from "./tables"

/**
 * Lectures du module Infrastructures. Toutes passent par `lireInfra` :
 * module activé et accès au moins « lecture ».
 */

/* ─────────────────────────── Chargements communs ──────────────────────── */

async function anomaliesOuvertes(ctx: QueryCtx): Promise<Doc<"infraAnomalies">[]> {
  const parStatut = await Promise.all(
    (["signalee", "prise_en_charge", "traitee"] as const).map((statut) =>
      ctx.db
        .query("infraAnomalies")
        .withIndex("by_statut", (q) => q.eq("statut", statut))
        .collect()
    )
  )
  return parStatut.flat()
}

async function ltvActives(ctx: QueryCtx): Promise<Doc<"infraLtv">[]> {
  return await ctx.db
    .query("infraLtv")
    .withIndex("by_statut", (q) => q.eq("statut", "active"))
    .collect()
}

async function longueurLigne(ctx: QueryCtx, c: Contexte): Promise<number> {
  const terminus = await ctx.db
    .query("stations")
    .withIndex("by_kilometerPoint")
    .order("desc")
    .first()
  const finSections = c.sections.reduce((max, s) => Math.max(max, s.pkFin), 0)
  return terminus?.kilometerPoint || finSections || LONGUEUR_LIGNE_KM
}

type SituationDoc = Doc<"infraAvancements">

function grouperPar<T, K extends string>(elements: readonly T[], cle: (e: T) => K) {
  const groupes = new Map<K, T[]>()
  for (const element of elements) {
    const k = cle(element)
    const groupe = groupes.get(k)
    if (groupe) groupe.push(element)
    else groupes.set(k, [element])
  }
  return groupes
}

function presenterJalon(jalon: Doc<"infraJalons">, maintenant: number) {
  const statut = statutJalon(jalon, maintenant)
  return {
    id: jalon._id,
    chantierId: jalon.chantierId,
    libelle: jalon.libelle,
    prevuLe: jalon.prevuLe,
    atteintLe: jalon.atteintLe ?? null,
    statut,
    statutLibelle: LIBELLES_STATUT_JALON[statut],
    conditionDecaissement: jalon.conditionDecaissement,
    bailleur: jalon.bailleur ?? null,
    bailleurLibelle: jalon.bailleur ? LIBELLES_BAILLEUR[jalon.bailleur] : null,
    preuve: jalon.preuve ?? null,
  }
}

async function presenterChantier(
  c: Contexte,
  chantier: Doc<"infraChantiers">,
  situations: readonly SituationDoc[],
  jalons: readonly Doc<"infraJalons">[]
) {
  const av = avancement(chantier, situations)
  return {
    id: chantier._id,
    code: chantier.code,
    libelle: chantier.libelle,
    description: chantier.description,
    nature: chantier.nature,
    natureLibelle: LIBELLES_NATURE_CHANTIER[chantier.nature],
    pkDebut: chantier.pkDebut,
    pkFin: chantier.pkFin,
    entreprise: chantier.entreprise,
    maitreOeuvre: chantier.maitreOeuvre,
    budgetFcfa: chantier.budgetFcfa,
    financements: chantier.financements.map((financement) => ({
      bailleur: financement.bailleur,
      bailleurLibelle: LIBELLES_BAILLEUR[financement.bailleur],
      montantFcfa: financement.montantFcfa,
      partPct: pourcentage(financement.montantFcfa, chantier.budgetFcfa),
    })),
    uniteQuantite: chantier.uniteQuantite,
    quantitePrevue: chantier.quantitePrevue,
    quantiteRealisee: av.quantiteRealisee,
    avancementPhysiquePct: av.avancementPhysiquePct,
    avancementFinancierPct: av.avancementFinancierPct,
    engageFcfa: av.engageFcfa,
    payeFcfa: av.payeFcfa,
    statut: chantier.statut,
    statutLibelle: LIBELLES_STATUT_CHANTIER[chantier.statut],
    debutLe: chantier.debutLe,
    finPrevueLe: chantier.finPrevueLe,
    finReelleLe: chantier.finReelleLe ?? null,
    responsableId: chantier.responsableId ?? null,
    responsableNom: await c.nom(chantier.responsableId),
    jalonsEnRetard: jalons.filter((j) => statutJalon(j, c.maintenant) === "en_retard")
      .length,
    situationsEnAttente: situations.filter((s) => s.statut === "saisie").length,
    majLe: chantier.majLe,
  }
}

/* ─────────────────────────── Droits ───────────────────────────────────── */

export const droits = query({
  args: {},
  handler: async (ctx) => {
    const acces = await lireInfra(ctx)
    return {
      peutEcrire: acces.peutEcrire,
      capacites: acces.capacites,
      partenaire: acces.partenaire,
      role: acces.user.role,
    }
  },
})

/* ─────────────────────────── Accueil ──────────────────────────────────── */

type Priorite = {
  type: "anomalie" | "ltv" | "inspection" | "jalon" | "intervention"
  id: string
  titre: string
  detail: string
  niveau: "critique" | "haute" | "normale"
  pk?: number
  echeance?: number
  /** Jalon : chantier dont le dossier porte le jalon. */
  chantierId?: string
}

export const accueil = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const maintenant = c.maintenant
    const [ouvertes, actives, ouvrages, equipements, chantiers, situations, jalons, stations] =
      await Promise.all([
        anomaliesOuvertes(ctx),
        ltvActives(ctx),
        ctx.db.query("infraOuvrages").collect(),
        ctx.db.query("infraEquipements").collect(),
        ctx.db.query("infraChantiers").collect(),
        ctx.db
          .query("infraAvancements")
          .withIndex("by_statut", (q) => q.eq("statut", "validee"))
          .collect(),
        ctx.db.query("infraJalons").collect(),
        ctx.db.query("stations").withIndex("by_kilometerPoint").collect(),
      ])
    const jour = bornesJourLibreville(maintenant)
    const interventionsJour = (
      await ctx.db
        .query("infraInterventions")
        .withIndex("by_debut", (q) =>
          q.gte("debutLe", jour.debut - 3 * JOUR).lt("debutLe", jour.fin)
        )
        .collect()
    ).filter(
      (i) =>
        i.finLe > jour.debut &&
        (i.statut === "demandee" || i.statut === "accordee" || i.statut === "en_cours")
    )

    /* Voie */
    const longueurKm = await longueurLigne(ctx, c)
    const sectionsParEtat = { bon: 0, moyen: 0, degrade: 0, critique: 0 }
    for (const section of c.sections) sectionsParEtat[section.etat] += 1

    /* Anomalies */
    const parGravite = { critique: 0, elevee: 0, moyenne: 0, faible: 0 }
    for (const anomalie of ouvertes) parGravite[anomalie.gravite] += 1
    const anomaliesEnRetard = ouvertes.filter((a) => anomalieEnRetard(a, maintenant))

    /* LTV */
    const ltvPresentees = await Promise.all(actives.map((l) => presenterLtv(c, l)))
    const kmSousLtv =
      Math.round(ltvPresentees.reduce((somme, l) => somme + l.longueurKm, 0) * 10) / 10
    const perteTemps =
      Math.round(ltvPresentees.reduce((somme, l) => somme + l.perteTempsMinutes, 0) * 10) /
      10

    /* Ouvrages et équipements */
    const ouvragesGraves = ouvrages.filter((o) => COTATIONS_GRAVES.has(o.cotation))
    const inspectionsEnRetard = ouvrages.filter((o) => o.prochaineInspectionLe < maintenant)
    const degrades = equipements.filter((e) => e.etat === "degrade").length
    const horsService = equipements.filter((e) => e.etat === "hors_service").length

    /* PRN */
    const situationsParChantier = grouperPar(situations, (s) => s.chantierId as string)
    let budget = 0
    let engage = 0
    let paye = 0
    let physiquePondere = 0
    for (const chantier of chantiers) {
      const av = avancement(chantier, situationsParChantier.get(chantier._id) ?? [])
      budget += chantier.budgetFcfa
      engage += av.engageFcfa
      paye += av.payeFcfa
      physiquePondere += av.avancementPhysiquePct * chantier.budgetFcfa
    }
    const jalonsEnRetard = jalons.filter((j) => statutJalon(j, maintenant) === "en_retard")
    const chantierParId = new Map(chantiers.map((ch) => [ch._id as string, ch]))

    /* Priorités */
    const priorites: (Priorite & { rang: number })[] = []
    for (const anomalie of ouvertes) {
      if (anomalie.statut === "traitee") continue
      if (anomalie.gravite !== "critique" && anomalie.gravite !== "elevee") continue
      const enRetard = anomalieEnRetard(anomalie, maintenant)
      priorites.push({
        rang: anomalie.gravite === "critique" ? 0 : 2,
        type: "anomalie",
        id: anomalie._id,
        titre: `${anomalie.numero} — anomalie ${LIBELLES_GRAVITE[anomalie.gravite].toLowerCase()}`,
        detail: `${anomalie.description}${enRetard ? " (échéance dépassée)" : ""}`,
        niveau: anomalie.gravite === "critique" ? "critique" : "haute",
        pk: anomalie.pk,
        echeance: anomalie.echeanceLe,
      })
    }
    for (const ltv of ltvPresentees) {
      if (!ltv.echeanceDepassee || ltv.finPrevueLe === null) continue
      priorites.push({
        rang: 1,
        type: "ltv",
        id: ltv.id,
        titre: `${ltv.numero} — LTV à ${ltv.vitesseKmh} km/h au-delà de sa fin prévue`,
        detail: `PK ${ltv.pkDebut} à ${ltv.pkFin} : ${ltv.motif}`,
        niveau: "haute",
        pk: ltv.pkDebut,
        echeance: ltv.finPrevueLe,
      })
    }
    for (const ouvrage of inspectionsEnRetard) {
      const grave = COTATIONS_GRAVES.has(ouvrage.cotation)
      priorites.push({
        rang: grave ? 1 : 3,
        type: "inspection",
        id: ouvrage._id,
        titre: `${ouvrage.code} — inspection en retard`,
        detail: `${ouvrage.nom}, cotation ${LIBELLES_COTATION[ouvrage.cotation]}`,
        niveau: grave ? "critique" : "normale",
        pk: ouvrage.pk,
        echeance: ouvrage.prochaineInspectionLe,
      })
    }
    for (const jalon of jalonsEnRetard) {
      const chantier = chantierParId.get(jalon.chantierId)
      priorites.push({
        rang: jalon.conditionDecaissement ? 3 : 4,
        type: "jalon",
        id: jalon._id,
        chantierId: jalon.chantierId,
        titre: `${chantier?.code ?? "Chantier"} — jalon en retard`,
        detail: `${jalon.libelle}${jalon.conditionDecaissement ? " (conditionne un décaissement)" : ""}`,
        niveau: jalon.conditionDecaissement ? "haute" : "normale",
        pk: chantier?.pkDebut,
        echeance: jalon.prevuLe,
      })
    }
    for (const intervention of interventionsJour) {
      priorites.push({
        rang: intervention.interruption ? 2 : 5,
        type: "intervention",
        id: intervention._id,
        titre: `${intervention.numero} — ${intervention.interruption ? "coupure de voie" : "travaux sous circulation"} aujourd'hui`,
        detail: `${intervention.libelle}${intervention.statut === "demandee" ? " (en attente d'accord)" : ""}`,
        niveau: intervention.interruption ? "haute" : "normale",
        pk: intervention.pkDebut,
        echeance: intervention.debutLe,
      })
    }
    priorites.sort(
      (a, b) => a.rang - b.rang || (a.echeance ?? Infinity) - (b.echeance ?? Infinity)
    )

    return {
      genereLe: maintenant,
      indicateurs: {
        longueurKm,
        partBetonPct: partBetonPonderee(c.sections),
        nbSections: c.sections.length,
        sectionsParEtat,
        anomalies: {
          ouvertes: ouvertes.length,
          parGravite,
          enRetard: anomaliesEnRetard.length,
          aClore: ouvertes.filter((a) => a.statut === "traitee").length,
        },
        ltv: {
          actives: actives.length,
          kmSousLtv,
          perteTempsMinutes: perteTemps,
        },
        ouvrages: {
          total: ouvrages.length,
          cotes3: ouvragesGraves.filter((o) => o.cotation === "3").length,
          cotes3U: ouvragesGraves.filter((o) => o.cotation === "3U").length,
          inspectionsEnRetard: inspectionsEnRetard.length,
        },
        equipements: {
          total: equipements.length,
          degrades,
          horsService,
          maintenancesEnRetard: equipements.filter((e) =>
            maintenanceEnRetard(e.derniereMaintenanceLe, e.periodiciteJours, maintenant)
          ).length,
        },
        prn: {
          chantiers: chantiers.length,
          chantiersEnCours: chantiers.filter((ch) => ch.statut === "en_cours").length,
          budgetFcfa: budget,
          engageFcfa: engage,
          payeFcfa: paye,
          avancementPhysiquePct:
            budget > 0 ? Math.round((physiquePondere / budget) * 10) / 10 : 0,
          avancementFinancierPct: pourcentage(paye, budget),
          jalonsEnRetard: jalonsEnRetard.length,
        },
      },
      priorites: priorites.slice(0, 40).map(({ rang: _rang, ...priorite }) => priorite),
      ligne: {
        longueurKm,
        gares: stations
          .filter((station) => station.isActive)
          .map((station, index, liste) => ({
            id: station._id,
            code: station.code,
            nom: station.name,
            km: station.kilometerPoint,
            majeure: index === 0 || index === liste.length - 1 || gareMajeure(station),
          })),
        ltv: ltvPresentees
          .sort((a, b) => a.pkDebut - b.pkDebut)
          .map((l) => ({
            id: l.id,
            numero: l.numero,
            pkDebut: l.pkDebut,
            pkFin: l.pkFin,
            vitesseKmh: l.vitesseKmh,
          })),
      },
    }
  },
})

/* ─────────────────────────── Sections ─────────────────────────────────── */

export const sections = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const [actives, ouvertes, ouvrages] = await Promise.all([
      ltvActives(ctx),
      anomaliesOuvertes(ctx),
      ctx.db.query("infraOuvrages").collect(),
    ])
    return c.sections.map((section) =>
      presenterSection(c, section, actives, ouvertes, ouvrages)
    )
  },
})

export const section = query({
  args: { sectionId: v.id("infraSections") },
  handler: async (ctx, { sectionId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = c.sectionParId.get(sectionId)
    if (!doc) return null
    const [toutesLtv, anomalies, ouvrages, equipements, interventions, chantiers] =
      await Promise.all([
        ctx.db.query("infraLtv").collect(),
        ctx.db.query("infraAnomalies").withIndex("by_signalement").order("desc").collect(),
        ctx.db.query("infraOuvrages").withIndex("by_pk").collect(),
        ctx.db.query("infraEquipements").collect(),
        ctx.db.query("infraInterventions").withIndex("by_debut").order("desc").collect(),
        ctx.db.query("infraChantiers").collect(),
      ])
    const ltvSection = toutesLtv.filter((l) => recoupe(l, doc))
    const anomaliesSection = anomalies.filter((a) => dansSection(doc, a))
    const ouvragesSection = ouvrages.filter((o) => dansSection(doc, o))
    const ouvertesParOuvrage = grouperPar(
      anomalies.filter((a) => a.ouvrageId && anomalieOuverte(a.statut)),
      (a) => a.ouvrageId as string
    )
    const situations = await ctx.db.query("infraAvancements").collect()
    const situationsParChantier = grouperPar(situations, (s) => s.chantierId as string)
    const jalons = await ctx.db.query("infraJalons").collect()
    const jalonsParChantier = grouperPar(jalons, (j) => j.chantierId as string)
    return {
      section: presenterSection(
        c,
        doc,
        ltvSection.filter((l) => l.statut === "active"),
        anomaliesSection.filter((a) => anomalieOuverte(a.statut)),
        ouvragesSection
      ),
      ouvrages: ouvragesSection.map((o) =>
        presenterOuvrage(c, o, ouvertesParOuvrage.get(o._id)?.length ?? 0)
      ),
      equipements: equipements
        .filter((e) =>
          e.sectionId
            ? e.sectionId === doc._id ||
              (e.pkFin !== undefined && recoupe({ pkDebut: e.pk, pkFin: e.pkFin }, doc))
            : e.pk >= doc.pkDebut && e.pk <= doc.pkFin
        )
        .sort((a, b) => a.pk - b.pk)
        .map((e) => presenterEquipement(c, e)),
      anomalies: await Promise.all(anomaliesSection.map((a) => presenterAnomalie(c, a))),
      ltv: await Promise.all(
        ltvSection
          .sort(
            (a, b) =>
              (a.statut === "active" ? 0 : 1) - (b.statut === "active" ? 0 : 1) ||
              b.debutLe - a.debutLe
          )
          .map((l) => presenterLtv(c, l))
      ),
      interventions: await Promise.all(
        interventions.filter((i) => recoupe(i, doc)).map((i) => presenterIntervention(c, i))
      ),
      chantiers: await Promise.all(
        chantiers
          .filter((ch) => recoupe(ch, doc))
          .map((ch) =>
            presenterChantier(
              c,
              ch,
              situationsParChantier.get(ch._id) ?? [],
              jalonsParChantier.get(ch._id) ?? []
            )
          )
      ),
      chronologie: await chronologie(c, "section", doc._id),
    }
  },
})

/* ─────────────────────────── Ouvrages ─────────────────────────────────── */

export const ouvrages = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const [liste, ouvertes] = await Promise.all([
      ctx.db.query("infraOuvrages").withIndex("by_pk").collect(),
      anomaliesOuvertes(ctx),
    ])
    const parOuvrage = grouperPar(
      ouvertes.filter((a) => a.ouvrageId),
      (a) => a.ouvrageId as string
    )
    return liste.map((o) => presenterOuvrage(c, o, parOuvrage.get(o._id)?.length ?? 0))
  },
})

async function anomaliesLiees(
  ctx: QueryCtx,
  filtre: (a: Doc<"infraAnomalies">) => boolean
): Promise<Doc<"infraAnomalies">[]> {
  const toutes = await ctx.db
    .query("infraAnomalies")
    .withIndex("by_signalement")
    .order("desc")
    .collect()
  return toutes.filter(filtre)
}

export const ouvrage = query({
  args: { ouvrageId: v.id("infraOuvrages") },
  handler: async (ctx, { ouvrageId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(ouvrageId)
    if (!doc) return null
    const [inspections, anomalies] = await Promise.all([
      ctx.db
        .query("infraInspections")
        .withIndex("by_ouvrage", (q) => q.eq("ouvrageId", ouvrageId))
        .order("desc")
        .collect(),
      anomaliesLiees(ctx, (a) => a.ouvrageId === ouvrageId),
    ])
    return {
      ouvrage: presenterOuvrage(
        c,
        doc,
        anomalies.filter((a) => anomalieOuverte(a.statut)).length
      ),
      inspections: await Promise.all(inspections.map((i) => presenterInspectionResume(c, i))),
      anomalies: await Promise.all(anomalies.map((a) => presenterAnomalie(c, a))),
      chronologie: await chronologie(c, "ouvrage", ouvrageId),
    }
  },
})

export const inspection = query({
  args: { inspectionId: v.id("infraInspections") },
  handler: async (ctx, { inspectionId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(inspectionId)
    if (!doc) return null
    const ouvrageDoc = await ctx.db.get(doc.ouvrageId)
    const proposition = surveillanceIqoa(doc.cotationProposee, doc.type)
    return {
      inspection: {
        id: doc._id,
        numero: doc.numero,
        type: doc.type,
        typeLibelle: LIBELLES_TYPE_INSPECTION[doc.type],
        dateInspection: doc.dateInspection,
        inspecteurId: doc.inspecteurId ?? null,
        inspecteurNom: doc.inspecteurNom,
        constats: doc.constats,
        desordres: doc.desordres.map((d) => ({
          partie: d.partie,
          description: d.description,
          gravite: d.gravite,
          graviteLibelle: LIBELLES_GRAVITE[d.gravite],
        })),
        cotationAvant: doc.cotationAvant,
        cotationAvantLibelle: LIBELLES_COTATION[doc.cotationAvant],
        cotationProposee: doc.cotationProposee,
        cotationProposeeLibelle: LIBELLES_COTATION[doc.cotationProposee],
        surveillanceRenforceeProposee: proposition.surveillanceRenforcee,
        periodiciteProposeeMois: proposition.periodiciteMois,
        recommandations: doc.recommandations ?? null,
        statut: doc.statut,
        statutLibelle: doc.statut === "validee" ? "Validée" : "Brouillon",
        valideParId: doc.valideParId ?? null,
        valideParNom: await c.nom(doc.valideParId),
        valideLe: doc.valideLe ?? null,
        creeLe: doc.creeLe,
      },
      ouvrage: ouvrageDoc ? presenterOuvrage(c, ouvrageDoc) : null,
      chronologie: await chronologie(c, "inspection", doc._id),
    }
  },
})

/* ─────────────────────────── Équipements ──────────────────────────────── */

export const equipements = query({
  args: { categorie: v.optional(infraCategorieEquipementValidator) },
  handler: async (ctx, { categorie }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const liste = categorie
      ? await ctx.db
          .query("infraEquipements")
          .withIndex("by_categorie", (q) => q.eq("categorie", categorie))
          .collect()
      : await ctx.db.query("infraEquipements").collect()
    return liste.sort((a, b) => a.pk - b.pk).map((e) => presenterEquipement(c, e))
  },
})

export const equipement = query({
  args: { equipementId: v.id("infraEquipements") },
  handler: async (ctx, { equipementId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(equipementId)
    if (!doc) return null
    const anomalies = await anomaliesLiees(ctx, (a) => a.equipementId === equipementId)
    return {
      equipement: presenterEquipement(c, doc),
      anomalies: await Promise.all(anomalies.map((a) => presenterAnomalie(c, a))),
      chronologie: await chronologie(c, "equipement", equipementId),
    }
  },
})

/* ─────────────────────────── Anomalies ────────────────────────────────── */

export const anomalies = query({
  args: { statut: v.optional(infraStatutAnomalieValidator) },
  handler: async (ctx, { statut }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const liste = statut
      ? await ctx.db
          .query("infraAnomalies")
          .withIndex("by_statut", (q) => q.eq("statut", statut))
          .collect()
      : await ctx.db.query("infraAnomalies").collect()
    liste.sort((a, b) => {
      const ouvA = anomalieOuverte(a.statut) ? 0 : 1
      const ouvB = anomalieOuverte(b.statut) ? 0 : 1
      if (ouvA !== ouvB) return ouvA - ouvB
      if (ouvA === 0) {
        return (
          RANG_GRAVITE[a.gravite] - RANG_GRAVITE[b.gravite] || a.echeanceLe - b.echeanceLe
        )
      }
      return b.signaleLe - a.signaleLe
    })
    return await Promise.all(liste.map((a) => presenterAnomalie(c, a)))
  },
})

export const anomalie = query({
  args: { anomalieId: v.id("infraAnomalies") },
  handler: async (ctx, { anomalieId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(anomalieId)
    if (!doc) return null
    const [ouvrageDoc, equipementDoc, incidentDoc, ltvDoc, interventionDoc] =
      await Promise.all([
        doc.ouvrageId ? ctx.db.get(doc.ouvrageId) : null,
        doc.equipementId ? ctx.db.get(doc.equipementId) : null,
        doc.incidentId ? ctx.db.get(doc.incidentId) : null,
        doc.ltvId ? ctx.db.get(doc.ltvId) : null,
        doc.interventionId ? ctx.db.get(doc.interventionId) : null,
      ])
    const photos = await Promise.all(
      doc.photoIds.map(async (id) => ({ id, url: await ctx.storage.getUrl(id) }))
    )
    return {
      anomalie: {
        ...(await presenterAnomalie(c, doc)),
        priseEnChargeParNom: await c.nom(doc.priseEnChargeParId),
        priseEnChargeLe: doc.priseEnChargeLe ?? null,
        traitement: doc.traitement ?? null,
        traiteParId: doc.traiteParId ?? null,
        traiteParNom: await c.nom(doc.traiteParId),
        traiteLe: doc.traiteLe ?? null,
        closParNom: await c.nom(doc.closParId),
        closLe: doc.closLe ?? null,
        motifRejet: doc.motifRejet ?? null,
      },
      photos,
      ouvrage: ouvrageDoc
        ? { id: ouvrageDoc._id, code: ouvrageDoc.code, nom: ouvrageDoc.nom, pk: ouvrageDoc.pk }
        : null,
      equipement: equipementDoc
        ? {
            id: equipementDoc._id,
            code: equipementDoc.code,
            libelle: equipementDoc.libelle,
            pk: equipementDoc.pk,
          }
        : null,
      incident: incidentDoc
        ? {
            id: incidentDoc._id,
            number: incidentDoc.number ?? null,
            description: incidentDoc.description,
            status: incidentDoc.status,
          }
        : null,
      ltv: ltvDoc ? await presenterLtv(c, ltvDoc) : null,
      intervention: interventionDoc ? await presenterIntervention(c, interventionDoc) : null,
      chronologie: await chronologie(c, "anomalie", doc._id),
    }
  },
})

/* ─────────────────────────── LTV ──────────────────────────────────────── */

export const ltvs = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const liste = await ctx.db.query("infraLtv").collect()
    liste.sort((a, b) => {
      if (a.statut !== b.statut) return a.statut === "active" ? -1 : 1
      return a.statut === "active"
        ? a.pkDebut - b.pkDebut
        : (b.leveeLe ?? b.debutLe) - (a.leveeLe ?? a.debutLe)
    })
    return await Promise.all(liste.map((l) => presenterLtv(c, l)))
  },
})

export const ltv = query({
  args: { ltvId: v.id("infraLtv") },
  handler: async (ctx, { ltvId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(ltvId)
    if (!doc) return null
    const presentee = await presenterLtv(c, doc)
    const anomalieDoc = doc.anomalieId ? await ctx.db.get(doc.anomalieId) : null
    const trains =
      doc.statut === "active"
        ? await trainsImpactes(ctx, {
            plage: { debut: doc.pkDebut, fin: doc.pkFin },
            depuis: c.maintenant,
            jusqua: c.maintenant + 7 * JOUR,
          })
        : []
    return {
      ltv: presentee,
      anomalie: anomalieDoc ? await presenterAnomalie(c, anomalieDoc) : null,
      trainsImpactes: trains.map((train) => ({
        ...train,
        perteTempsMinutes: presentee.perteTempsMinutes,
      })),
      perteTempsCumuleeMinutes:
        Math.round(trains.length * presentee.perteTempsMinutes * 10) / 10,
      chronologie: await chronologie(c, "ltv", doc._id),
    }
  },
})

/* ─────────────────────────── Chantiers PRN ────────────────────────────── */

export const chantiers = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const [liste, situations, jalons] = await Promise.all([
      ctx.db.query("infraChantiers").collect(),
      ctx.db.query("infraAvancements").collect(),
      ctx.db.query("infraJalons").collect(),
    ])
    const situationsParChantier = grouperPar(situations, (s) => s.chantierId as string)
    const jalonsParChantier = grouperPar(jalons, (j) => j.chantierId as string)
    liste.sort((a, b) => a.code.localeCompare(b.code))
    return await Promise.all(
      liste.map((ch) =>
        presenterChantier(
          c,
          ch,
          situationsParChantier.get(ch._id) ?? [],
          jalonsParChantier.get(ch._id) ?? []
        )
      )
    )
  },
})

export const chantier = query({
  args: { chantierId: v.id("infraChantiers") },
  handler: async (ctx, { chantierId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(chantierId)
    if (!doc) return null
    const [lots, situations, jalons, interventions] = await Promise.all([
      ctx.db
        .query("infraLots")
        .withIndex("by_chantier", (q) => q.eq("chantierId", chantierId))
        .collect(),
      ctx.db
        .query("infraAvancements")
        .withIndex("by_chantier", (q) => q.eq("chantierId", chantierId))
        .order("desc")
        .collect(),
      ctx.db
        .query("infraJalons")
        .withIndex("by_chantier", (q) => q.eq("chantierId", chantierId))
        .collect(),
      ctx.db.query("infraInterventions").withIndex("by_debut").order("desc").collect(),
    ])
    const lotParId = new Map(lots.map((lot) => [lot._id as string, lot]))
    const situationsParLot = grouperPar(
      situations.filter((s) => s.lotId),
      (s) => s.lotId as string
    )
    lots.sort((a, b) => a.code.localeCompare(b.code))
    return {
      chantier: await presenterChantier(c, doc, situations, jalons),
      lots: lots.map((lot) => {
        const av = avancement(
          { quantitePrevue: lot.quantitePrevue, budgetFcfa: lot.montantFcfa },
          situationsParLot.get(lot._id) ?? []
        )
        return {
          id: lot._id,
          code: lot.code,
          libelle: lot.libelle,
          entreprise: lot.entreprise,
          montantFcfa: lot.montantFcfa,
          pkDebut: lot.pkDebut,
          pkFin: lot.pkFin,
          quantitePrevue: lot.quantitePrevue,
          quantiteRealisee: av.quantiteRealisee,
          avancementPhysiquePct: av.avancementPhysiquePct,
          avancementFinancierPct: av.avancementFinancierPct,
          engageFcfa: av.engageFcfa,
          payeFcfa: av.payeFcfa,
        }
      }),
      avancements: await Promise.all(
        situations.map(async (s) => ({
          id: s._id,
          lotId: s.lotId ?? null,
          lotCode: s.lotId ? (lotParId.get(s.lotId)?.code ?? null) : null,
          periode: s.periode,
          quantite: s.quantite,
          montantTravauxFcfa: s.montantTravauxFcfa,
          montantPayeFcfa: s.montantPayeFcfa,
          bailleur: s.bailleur ?? null,
          bailleurLibelle: s.bailleur ? LIBELLES_BAILLEUR[s.bailleur] : null,
          commentaire: s.commentaire ?? null,
          statut: s.statut,
          statutLibelle: LIBELLES_STATUT_AVANCEMENT[s.statut],
          saisiParId: s.saisiParId ?? null,
          saisiParNom: await c.nom(s.saisiParId),
          saisiLe: s.saisiLe,
          valideParNom: await c.nom(s.valideParId),
          valideLe: s.valideLe ?? null,
          motifRejet: s.motifRejet ?? null,
        }))
      ),
      jalons: jalons.map((j) => presenterJalon(j, c.maintenant)),
      interventions: await Promise.all(
        interventions
          .filter((i) => i.chantierId === chantierId)
          .map((i) => presenterIntervention(c, i))
      ),
      chronologie: await chronologie(c, "chantier", doc._id),
    }
  },
})

/* ─────────────────────────── Rapport bailleurs ────────────────────────── */

export const rapportBailleur = query({
  args: { bailleur: v.optional(infraBailleurValidator) },
  handler: async (ctx, { bailleur }) => {
    await lireInfra(ctx)
    const maintenant = Date.now()
    const [liste, situations, jalons] = await Promise.all([
      ctx.db.query("infraChantiers").collect(),
      ctx.db
        .query("infraAvancements")
        .withIndex("by_statut", (q) => q.eq("statut", "validee"))
        .collect(),
      ctx.db.query("infraJalons").collect(),
    ])
    const situationsParChantier = grouperPar(situations, (s) => s.chantierId as string)
    const jalonsParChantier = grouperPar(jalons, (j) => j.chantierId as string)
    const finances = liste
      .filter((ch) =>
        bailleur
          ? ch.financements.some((f) => f.bailleur === bailleur && f.montantFcfa > 0)
          : ch.financements.length > 0
      )
      .sort((a, b) => a.code.localeCompare(b.code))

    const contributions = new Map<Bailleur, number>()
    const lignes = finances.map((ch) => {
      const av = avancement(ch, situationsParChantier.get(ch._id) ?? [])
      const montantBailleurFcfa = bailleur
        ? ch.financements
            .filter((f) => f.bailleur === bailleur)
            .reduce((somme, f) => somme + f.montantFcfa, 0)
        : ch.financements.reduce((somme, f) => somme + f.montantFcfa, 0)
      for (const f of ch.financements) {
        contributions.set(f.bailleur, (contributions.get(f.bailleur) ?? 0) + f.montantFcfa)
      }
      const jalonsChantier = (jalonsParChantier.get(ch._id) ?? [])
        .sort((a, b) => a.prevuLe - b.prevuLe)
        .map((j) => presenterJalon(j, maintenant))
      return {
        id: ch._id,
        code: ch.code,
        libelle: ch.libelle,
        nature: ch.nature,
        natureLibelle: LIBELLES_NATURE_CHANTIER[ch.nature],
        statut: ch.statut,
        statutLibelle: LIBELLES_STATUT_CHANTIER[ch.statut],
        pkDebut: ch.pkDebut,
        pkFin: ch.pkFin,
        entreprise: ch.entreprise,
        debutLe: ch.debutLe,
        finPrevueLe: ch.finPrevueLe,
        finReelleLe: ch.finReelleLe ?? null,
        budgetFcfa: ch.budgetFcfa,
        montantBailleurFcfa,
        partBailleurPct: pourcentage(montantBailleurFcfa, ch.budgetFcfa),
        financements: ch.financements.map((f) => ({
          bailleur: f.bailleur,
          bailleurLibelle: LIBELLES_BAILLEUR[f.bailleur],
          montantFcfa: f.montantFcfa,
          partPct: pourcentage(f.montantFcfa, ch.budgetFcfa),
        })),
        uniteQuantite: ch.uniteQuantite,
        quantitePrevue: ch.quantitePrevue,
        quantiteRealisee: av.quantiteRealisee,
        engageFcfa: av.engageFcfa,
        payeFcfa: av.payeFcfa,
        avancementPhysiquePct: av.avancementPhysiquePct,
        avancementFinancierPct: av.avancementFinancierPct,
        jalons: jalonsChantier,
        jalonsDecaissement: jalonsChantier.filter(
          (j) =>
            j.conditionDecaissement && (!bailleur || j.bailleur === null || j.bailleur === bailleur)
        ),
      }
    })

    const budgetFcfa = lignes.reduce((s, l) => s + l.budgetFcfa, 0)
    const payeFcfa = lignes.reduce((s, l) => s + l.payeFcfa, 0)
    const physiquePondere = lignes.reduce(
      (s, l) => s + l.avancementPhysiquePct * l.budgetFcfa,
      0
    )
    const montantBailleurFcfa = lignes.reduce((s, l) => s + l.montantBailleurFcfa, 0)
    const totalFinancements = [...contributions.values()].reduce((s, m) => s + m, 0)
    return {
      genereLe: maintenant,
      bailleur: bailleur ?? null,
      bailleurLibelle: bailleur ? LIBELLES_BAILLEUR[bailleur] : null,
      perimetre:
        "Avancement établi sur les seules situations validées par le responsable PRN.",
      chantiers: lignes,
      totaux: {
        chantiers: lignes.length,
        montantBailleurFcfa,
        budgetFcfa,
        engageFcfa: lignes.reduce((s, l) => s + l.engageFcfa, 0),
        payeFcfa,
        avancementPhysiquePct:
          budgetFcfa > 0 ? Math.round((physiquePondere / budgetFcfa) * 10) / 10 : 0,
        avancementFinancierPct: pourcentage(payeFcfa, budgetFcfa),
        jalonsEnRetard: lignes.reduce(
          (s, l) => s + l.jalons.filter((j) => j.statut === "en_retard").length,
          0
        ),
        jalonsDecaissementEnAttente: lignes.reduce(
          (s, l) => s + l.jalonsDecaissement.filter((j) => j.statut !== "atteint").length,
          0
        ),
      },
      parBailleur: [...contributions.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, montantFcfa]) => ({
          bailleur: code,
          bailleurLibelle: LIBELLES_BAILLEUR[code],
          montantFcfa,
          partPct: pourcentage(montantFcfa, totalFinancements),
        })),
    }
  },
})

/* ─────────────────────────── Interventions ────────────────────────────── */

export const interventions = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const liste = await ctx.db
      .query("infraInterventions")
      .withIndex("by_debut")
      .order("desc")
      .collect()
    return await Promise.all(liste.map((i) => presenterIntervention(c, i)))
  },
})

export const intervention = query({
  args: { interventionId: v.id("infraInterventions") },
  handler: async (ctx, { interventionId }) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const doc = await ctx.db.get(interventionId)
    if (!doc) return null
    const actives = (
      await Promise.all(
        (["accordee", "en_cours"] as const).map((statut) =>
          ctx.db
            .query("infraInterventions")
            .withIndex("by_statut", (q) => q.eq("statut", statut))
            .collect()
        )
      )
    ).flat()
    const conflits = actives.filter(
      (autre) => autre._id !== doc._id && interventionsEnConflit(doc, autre)
    )
    const trains = doc.interruption
      ? await trainsImpactes(ctx, {
          plage: { debut: doc.pkDebut, fin: doc.pkFin },
          depuis: doc.debutLe,
          jusqua: doc.finLe,
          creneau: { debut: doc.debutLe, fin: doc.finLe },
        })
      : []
    const [chantierDoc, anomalieDoc] = await Promise.all([
      doc.chantierId ? ctx.db.get(doc.chantierId) : null,
      doc.anomalieId ? ctx.db.get(doc.anomalieId) : null,
    ])
    return {
      intervention: await presenterIntervention(c, doc),
      trainsImpactes: trains,
      conflits: await Promise.all(conflits.map((i) => presenterIntervention(c, i))),
      chantier: chantierDoc
        ? { id: chantierDoc._id, code: chantierDoc.code, libelle: chantierDoc.libelle }
        : null,
      anomalie: anomalieDoc ? await presenterAnomalie(c, anomalieDoc) : null,
      chronologie: await chronologie(c, "intervention", doc._id),
    }
  },
})

/* ─────────────────────────── Formulaires ──────────────────────────────── */

export const formulaires = query({
  args: {},
  handler: async (ctx) => {
    await lireInfra(ctx)
    const c = await creerContexte(ctx)
    const [ouvragesListe, equipementsListe, chantiersListe, ouvertes, incidents] =
      await Promise.all([
        ctx.db.query("infraOuvrages").withIndex("by_pk").collect(),
        ctx.db.query("infraEquipements").collect(),
        ctx.db.query("infraChantiers").collect(),
        anomaliesOuvertes(ctx),
        Promise.all(
          (["ouvert", "en_cours"] as const).map((status) =>
            ctx.db
              .query("incidents")
              .withIndex("by_status", (q) => q.eq("status", status))
              .collect()
          )
        ),
      ])
    return {
      sections: c.sections.map((s) => ({
        id: s._id,
        code: s.code,
        libelle: s.libelle,
        pkDebut: s.pkDebut,
        pkFin: s.pkFin,
        vitesseNominaleKmh: s.vitesseNominaleKmh,
      })),
      ouvrages: ouvragesListe.map((o) => ({ id: o._id, code: o.code, nom: o.nom, pk: o.pk })),
      equipements: equipementsListe
        .sort((a, b) => a.pk - b.pk)
        .map((e) => ({
          id: e._id,
          code: e.code,
          libelle: e.libelle,
          pk: e.pk,
          categorie: e.categorie,
        })),
      chantiers: chantiersListe
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((ch) => ({
          id: ch._id,
          code: ch.code,
          libelle: ch.libelle,
          statut: ch.statut,
          pkDebut: ch.pkDebut,
          pkFin: ch.pkFin,
        })),
      anomaliesOuvertes: ouvertes
        .sort((a, b) => a.pk - b.pk)
        .map((a) => ({
          id: a._id,
          numero: a.numero,
          pk: a.pk,
          gravite: a.gravite,
          description: a.description,
        })),
      incidents: incidents
        .flat()
        .filter((i) => i.category === "technique" || i.category === "securite")
        .sort((a, b) => b.reportedAt - a.reportedAt)
        .map((i) => ({
          id: i._id as Id<"incidents">,
          number: i.number ?? null,
          description: i.description,
        })),
    }
  },
})
