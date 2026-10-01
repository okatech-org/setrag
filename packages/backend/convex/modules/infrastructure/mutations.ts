import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, type MutationCtx } from "../../_generated/server"
import {
  exigerInfra,
  journaliserInfra,
  nomAgent,
  prochainNumero,
  type CapaciteInfra,
} from "./acces"
import {
  ajouterMois,
  anomalieOuverte,
  assertPk,
  assertPlagePk,
  avancement,
  DUREE_MAX_INTERVENTION_MS,
  echeanceAnomalie,
  erreurSituation,
  erreurVitesseLtv,
  HEURE,
  interventionsEnConflit,
  JOUR,
  LIBELLES_COTATION,
  LIBELLES_ETAT_EQUIPEMENT,
  LIBELLES_ETAT_VOIE,
  LIBELLES_GRAVITE,
  LIBELLES_STATUT_ANOMALIE,
  LIBELLES_STATUT_CHANTIER,
  LIBELLES_STATUT_INTERVENTION,
  periodeLibreville,
  periodeValide,
  plagesSeChevauchent,
  sectionDuPk,
  sectionsRecoupees,
  surveillanceIqoa,
  transitionChantierPermise,
  typeTraverseDepuisPart,
  type CategorieEquipement,
} from "./model"
import {
  infraBailleurValidator,
  infraCategorieAnomalieValidator,
  infraCategorieEquipementValidator,
  infraCotationValidator,
  infraEtatEquipementValidator,
  infraEtatVoieValidator,
  infraGraviteValidator,
  infraNatureChantierValidator,
  infraStatutChantierValidator,
  infraTypeInspectionValidator,
  infraTypeInterventionValidator,
  infraTypeOuvrageValidator,
} from "./tables"

/**
 * Écritures du module Infrastructures. Chaque mutation :
 * 1. exige la capacité métier (`exigerInfra`) ;
 * 2. valide ses entrées et la transition d'état, avec un refus explicite ;
 * 3. inscrit l'événement dans la chronologie et l'audit (`journaliserInfra`).
 */

/* ─────────────────────────── Utilitaires ──────────────────────────────── */

function texte(valeur: string, champ: string, max = 2000): string {
  const propre = valeur.trim()
  if (!propre) throw new Error(`${champ} est obligatoire.`)
  if (propre.length > max) {
    throw new Error(`${champ} ne doit pas dépasser ${max} caractères.`)
  }
  return propre
}

function texteOptionnel(valeur: string | undefined, champ: string, max = 2000) {
  if (valeur === undefined) return undefined
  const propre = valeur.trim()
  if (!propre) return undefined
  if (propre.length > max) {
    throw new Error(`${champ} ne doit pas dépasser ${max} caractères.`)
  }
  return propre
}

function positif(valeur: number, champ: string, strict = false): number {
  if (!Number.isFinite(valeur) || valeur < 0 || (strict && valeur === 0)) {
    throw new Error(
      `${champ} doit être un nombre ${strict ? "strictement positif" : "positif ou nul"}.`
    )
  }
  return valeur
}

async function chargerSections(ctx: MutationCtx) {
  return await ctx.db.query("infraSections").withIndex("by_pk").collect()
}

async function exigerAnomalie(ctx: MutationCtx, id: Id<"infraAnomalies">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Anomalie introuvable.")
  return doc
}

async function exigerLtv(ctx: MutationCtx, id: Id<"infraLtv">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Limitation de vitesse introuvable.")
  return doc
}

async function exigerOuvrage(ctx: MutationCtx, id: Id<"infraOuvrages">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Ouvrage introuvable.")
  return doc
}

async function exigerInspection(ctx: MutationCtx, id: Id<"infraInspections">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Inspection introuvable.")
  return doc
}

async function exigerEquipement(ctx: MutationCtx, id: Id<"infraEquipements">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Équipement introuvable.")
  return doc
}

async function exigerChantier(ctx: MutationCtx, id: Id<"infraChantiers">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Chantier introuvable.")
  return doc
}

async function exigerIntervention(ctx: MutationCtx, id: Id<"infraInterventions">) {
  const doc = await ctx.db.get(id)
  if (!doc) throw new Error("Plage travaux introuvable.")
  return doc
}

function capaciteEquipement(categorie: CategorieEquipement): CapaciteInfra {
  return categorie === "telecoms" ? "equipement_telecoms" : "equipement_signalisation"
}

function refusTransition(objet: string, statut: string, geste: string): never {
  throw new Error(`Transition refusée : ${objet} est « ${statut} », impossible de ${geste}.`)
}

/* ─────────────────────────── Photos ───────────────────────────────────── */

export const genererUrlTeleversement = mutation({
  args: {},
  handler: async (ctx) => {
    await exigerInfra(ctx, "anomalie_signaler", "creer")
    return await ctx.storage.generateUploadUrl()
  },
})

const MAX_PHOTOS = 10

/* ─────────────────────────── Anomalies ────────────────────────────────── */

export const signalerAnomalie = mutation({
  args: {
    pk: v.number(),
    categorie: infraCategorieAnomalieValidator,
    gravite: infraGraviteValidator,
    description: v.string(),
    photoIds: v.optional(v.array(v.id("_storage"))),
    ouvrageId: v.optional(v.id("infraOuvrages")),
    equipementId: v.optional(v.id("infraEquipements")),
    incidentId: v.optional(v.id("incidents")),
    brigade: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "anomalie_signaler", "creer")
    assertPk(args.pk)
    const description = texte(args.description, "La description")
    const photoIds = args.photoIds ?? []
    if (photoIds.length > MAX_PHOTOS) {
      throw new Error(`Au plus ${MAX_PHOTOS} photos par anomalie.`)
    }
    if (args.ouvrageId) await exigerOuvrage(ctx, args.ouvrageId)
    if (args.equipementId) await exigerEquipement(ctx, args.equipementId)
    if (args.incidentId && !(await ctx.db.get(args.incidentId))) {
      throw new Error("Incident introuvable.")
    }
    const maintenant = Date.now()
    const section = sectionDuPk(await chargerSections(ctx), args.pk)
    const numero = await prochainNumero(ctx, "AN", maintenant)
    const doc = {
      numero,
      pk: args.pk,
      sectionId: section?._id,
      categorie: args.categorie,
      gravite: args.gravite,
      description,
      photoIds,
      ouvrageId: args.ouvrageId,
      equipementId: args.equipementId,
      incidentId: args.incidentId,
      brigade: texteOptionnel(args.brigade, "La brigade", 120) ?? section?.brigade,
      signaleParId: user._id,
      signaleLe: maintenant,
      echeanceLe: echeanceAnomalie(args.gravite, maintenant),
      statut: "signalee" as const,
      majLe: maintenant,
    }
    const anomalieId = await ctx.db.insert("infraAnomalies", doc)
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: anomalieId,
      table: "infraAnomalies",
      type: "anomalie_signalee",
      libelle: `Anomalie ${LIBELLES_GRAVITE[args.gravite].toLowerCase()} signalée au PK ${args.pk}`,
      detail: description,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    return { anomalieId, numero }
  },
})

export const ajouterPhotosAnomalie = mutation({
  args: { anomalieId: v.id("infraAnomalies"), photoIds: v.array(v.id("_storage")) },
  handler: async (ctx, { anomalieId, photoIds }) => {
    const user = await exigerInfra(ctx, "anomalie_signaler")
    const anomalie = await exigerAnomalie(ctx, anomalieId)
    if (!anomalieOuverte(anomalie.statut)) {
      refusTransition("l'anomalie", LIBELLES_STATUT_ANOMALIE[anomalie.statut], "ajouter des photos")
    }
    if (photoIds.length === 0) throw new Error("Aucune photo à ajouter.")
    const toutes = [...anomalie.photoIds, ...photoIds.filter((id) => !anomalie.photoIds.includes(id))]
    if (toutes.length > MAX_PHOTOS) {
      throw new Error(`Au plus ${MAX_PHOTOS} photos par anomalie.`)
    }
    const maintenant = Date.now()
    await ctx.db.patch(anomalieId, { photoIds: toutes, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: anomalieId,
      table: "infraAnomalies",
      type: "anomalie_photos",
      libelle: `${toutes.length - anomalie.photoIds.length} photo(s) ajoutée(s)`,
      auteurId: user._id,
      avant: { photos: anomalie.photoIds.length },
      apres: { photos: toutes.length },
      maintenant,
    })
    return { nbPhotos: toutes.length }
  },
})

export const prendreEnChargeAnomalie = mutation({
  args: { anomalieId: v.id("infraAnomalies") },
  handler: async (ctx, { anomalieId }) => {
    const user = await exigerInfra(ctx, "anomalie_traiter")
    const anomalie = await exigerAnomalie(ctx, anomalieId)
    if (anomalie.statut !== "signalee") {
      refusTransition("l'anomalie", LIBELLES_STATUT_ANOMALIE[anomalie.statut], "la prendre en charge")
    }
    const maintenant = Date.now()
    await ctx.db.patch(anomalieId, {
      statut: "prise_en_charge",
      priseEnChargeParId: user._id,
      priseEnChargeLe: maintenant,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: anomalieId,
      table: "infraAnomalies",
      type: "anomalie_prise_en_charge",
      libelle: `Prise en charge par ${nomAgent(user)}`,
      auteurId: user._id,
      avant: { statut: anomalie.statut },
      apres: { statut: "prise_en_charge" },
      maintenant,
    })
    return { statut: "prise_en_charge" as const }
  },
})

export const traiterAnomalie = mutation({
  args: { anomalieId: v.id("infraAnomalies"), traitement: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "anomalie_traiter")
    const anomalie = await exigerAnomalie(ctx, args.anomalieId)
    if (anomalie.statut !== "prise_en_charge") {
      refusTransition(
        "l'anomalie",
        LIBELLES_STATUT_ANOMALIE[anomalie.statut],
        "la déclarer traitée (prise en charge préalable requise)"
      )
    }
    const traitement = texte(args.traitement, "Le compte rendu de traitement")
    const maintenant = Date.now()
    await ctx.db.patch(args.anomalieId, {
      statut: "traitee",
      traitement,
      traiteParId: user._id,
      traiteLe: maintenant,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: args.anomalieId,
      table: "infraAnomalies",
      type: "anomalie_traitee",
      libelle: "Anomalie traitée, en attente de clôture",
      detail: traitement,
      auteurId: user._id,
      avant: { statut: anomalie.statut },
      apres: { statut: "traitee", traitement },
      maintenant,
    })
    return { statut: "traitee" as const }
  },
})

export const cloreAnomalie = mutation({
  args: { anomalieId: v.id("infraAnomalies") },
  handler: async (ctx, { anomalieId }) => {
    const user = await exigerInfra(ctx, "anomalie_clore")
    const anomalie = await exigerAnomalie(ctx, anomalieId)
    if (anomalie.statut !== "traitee") {
      refusTransition("l'anomalie", LIBELLES_STATUT_ANOMALIE[anomalie.statut], "la clore")
    }
    if (anomalie.traiteParId === user._id) {
      throw new Error(
        "Séparation des tâches : l'agent qui a traité l'anomalie ne peut pas la clore."
      )
    }
    const maintenant = Date.now()
    await ctx.db.patch(anomalieId, {
      statut: "close",
      closParId: user._id,
      closLe: maintenant,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: anomalieId,
      table: "infraAnomalies",
      type: "anomalie_close",
      libelle: `Anomalie close par ${nomAgent(user)}`,
      auteurId: user._id,
      avant: { statut: anomalie.statut },
      apres: { statut: "close" },
      permission: "valider",
      maintenant,
    })
    return { statut: "close" as const }
  },
})

export const rejeterAnomalie = mutation({
  args: { anomalieId: v.id("infraAnomalies"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "anomalie_traiter")
    const anomalie = await exigerAnomalie(ctx, args.anomalieId)
    if (anomalie.statut !== "signalee" && anomalie.statut !== "prise_en_charge") {
      refusTransition("l'anomalie", LIBELLES_STATUT_ANOMALIE[anomalie.statut], "la rejeter")
    }
    const motif = texte(args.motif, "Le motif du rejet", 500)
    const maintenant = Date.now()
    await ctx.db.patch(args.anomalieId, {
      statut: "rejetee",
      motifRejet: motif,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: args.anomalieId,
      table: "infraAnomalies",
      type: "anomalie_rejetee",
      libelle: "Anomalie rejetée",
      detail: motif,
      auteurId: user._id,
      avant: { statut: anomalie.statut },
      apres: { statut: "rejetee" },
      motif,
      maintenant,
    })
    return { statut: "rejetee" as const }
  },
})

export const requalifierAnomalie = mutation({
  args: {
    anomalieId: v.id("infraAnomalies"),
    gravite: infraGraviteValidator,
    categorie: infraCategorieAnomalieValidator,
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "anomalie_traiter")
    const anomalie = await exigerAnomalie(ctx, args.anomalieId)
    if (anomalie.statut !== "signalee" && anomalie.statut !== "prise_en_charge") {
      refusTransition("l'anomalie", LIBELLES_STATUT_ANOMALIE[anomalie.statut], "la requalifier")
    }
    if (anomalie.gravite === args.gravite && anomalie.categorie === args.categorie) {
      throw new Error("Aucun changement : gravité et catégorie identiques.")
    }
    const maintenant = Date.now()
    const echeanceLe = echeanceAnomalie(args.gravite, anomalie.signaleLe)
    await ctx.db.patch(args.anomalieId, {
      gravite: args.gravite,
      categorie: args.categorie,
      echeanceLe,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "anomalie",
      entiteId: args.anomalieId,
      table: "infraAnomalies",
      type: "anomalie_requalifiee",
      libelle: `Requalifiée : gravité ${LIBELLES_GRAVITE[anomalie.gravite].toLowerCase()} → ${LIBELLES_GRAVITE[args.gravite].toLowerCase()}`,
      auteurId: user._id,
      avant: {
        gravite: anomalie.gravite,
        categorie: anomalie.categorie,
        echeanceLe: anomalie.echeanceLe,
      },
      apres: { gravite: args.gravite, categorie: args.categorie, echeanceLe },
      maintenant,
    })
    return { echeanceLe }
  },
})

/* ─────────────────────────── LTV ──────────────────────────────────────── */

export const poserLtv = mutation({
  args: {
    pkDebut: v.number(),
    pkFin: v.number(),
    vitesseKmh: v.number(),
    motif: v.string(),
    anomalieId: v.optional(v.id("infraAnomalies")),
    finPrevueLe: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ltv_gerer", "creer")
    assertPlagePk(args.pkDebut, args.pkFin)
    const motif = texte(args.motif, "Le motif", 500)
    const maintenant = Date.now()
    if (args.finPrevueLe !== undefined && args.finPrevueLe <= maintenant) {
      throw new Error("La fin prévue doit être dans le futur.")
    }
    const sections = await chargerSections(ctx)
    const recoupees = sectionsRecoupees(sections, { debut: args.pkDebut, fin: args.pkFin })
    if (recoupees.length === 0) {
      throw new Error("Aucune section de voie ne couvre cette plage : renseignez d'abord les sections.")
    }
    const vitesseNominaleKmh = Math.min(...recoupees.map((s) => s.vitesseNominaleKmh))
    const erreur = erreurVitesseLtv(args.vitesseKmh, vitesseNominaleKmh)
    if (erreur) throw new Error(erreur)

    const actives = await ctx.db
      .query("infraLtv")
      .withIndex("by_statut", (q) => q.eq("statut", "active"))
      .collect()
    const chevauchee = actives.find((l) =>
      plagesSeChevauchent(
        { debut: l.pkDebut, fin: l.pkFin },
        { debut: args.pkDebut, fin: args.pkFin }
      )
    )
    if (chevauchee) {
      throw new Error(
        `La LTV active ${chevauchee.numero} (PK ${chevauchee.pkDebut} à ${chevauchee.pkFin}) recouvre déjà cette plage : modifiez-la plutôt que d'en poser une seconde.`
      )
    }
    let anomalie: Doc<"infraAnomalies"> | null = null
    if (args.anomalieId) {
      anomalie = await exigerAnomalie(ctx, args.anomalieId)
      if (!anomalieOuverte(anomalie.statut)) {
        throw new Error(`L'anomalie ${anomalie.numero} n'est plus ouverte.`)
      }
    }
    const numero = await prochainNumero(ctx, "LTV", maintenant)
    const doc = {
      numero,
      pkDebut: args.pkDebut,
      pkFin: args.pkFin,
      sectionId: sectionDuPk(sections, args.pkDebut)?._id,
      vitesseKmh: args.vitesseKmh,
      vitesseNominaleKmh,
      motif,
      anomalieId: args.anomalieId,
      statut: "active" as const,
      debutLe: maintenant,
      finPrevueLe: args.finPrevueLe,
      poseeParId: user._id,
      majLe: maintenant,
    }
    const ltvId = await ctx.db.insert("infraLtv", doc)
    await journaliserInfra(ctx, {
      entite: "ltv",
      entiteId: ltvId,
      table: "infraLtv",
      type: "ltv_posee",
      libelle: `LTV à ${args.vitesseKmh} km/h posée du PK ${args.pkDebut} au PK ${args.pkFin}`,
      detail: motif,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    if (anomalie) {
      await ctx.db.patch(anomalie._id, { ltvId, majLe: maintenant })
      await journaliserInfra(ctx, {
        entite: "anomalie",
        entiteId: anomalie._id,
        table: "infraAnomalies",
        type: "anomalie_ltv_liee",
        libelle: `Couverte par la LTV ${numero} à ${args.vitesseKmh} km/h`,
        auteurId: user._id,
        avant: { ltvId: anomalie.ltvId },
        apres: { ltvId },
        maintenant,
      })
    }
    return { ltvId, numero, vitesseNominaleKmh }
  },
})

export const modifierLtv = mutation({
  args: {
    ltvId: v.id("infraLtv"),
    vitesseKmh: v.optional(v.number()),
    finPrevueLe: v.optional(v.number()),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ltv_gerer")
    const ltv = await exigerLtv(ctx, args.ltvId)
    if (ltv.statut !== "active") refusTransition("la LTV", "levée", "la modifier")
    const motif = texte(args.motif, "Le motif de la modification", 500)
    if (args.vitesseKmh === undefined && args.finPrevueLe === undefined) {
      throw new Error("Indiquez une nouvelle vitesse ou une nouvelle fin prévue.")
    }
    const maintenant = Date.now()
    if (args.vitesseKmh !== undefined) {
      const erreur = erreurVitesseLtv(args.vitesseKmh, ltv.vitesseNominaleKmh)
      if (erreur) throw new Error(erreur)
    }
    if (args.finPrevueLe !== undefined && args.finPrevueLe <= maintenant) {
      throw new Error("La fin prévue doit être dans le futur.")
    }
    const avant = { vitesseKmh: ltv.vitesseKmh, finPrevueLe: ltv.finPrevueLe }
    const apres = {
      vitesseKmh: args.vitesseKmh ?? ltv.vitesseKmh,
      finPrevueLe: args.finPrevueLe ?? ltv.finPrevueLe,
    }
    await ctx.db.patch(args.ltvId, { ...apres, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "ltv",
      entiteId: args.ltvId,
      table: "infraLtv",
      type: "ltv_modifiee",
      libelle:
        args.vitesseKmh !== undefined
          ? `Vitesse portée de ${ltv.vitesseKmh} à ${args.vitesseKmh} km/h`
          : "Fin prévue reportée",
      detail: motif,
      auteurId: user._id,
      avant,
      apres,
      motif,
      maintenant,
    })
    return apres
  },
})

export const leverLtv = mutation({
  args: { ltvId: v.id("infraLtv"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ltv_gerer")
    const ltv = await exigerLtv(ctx, args.ltvId)
    if (ltv.statut !== "active") refusTransition("la LTV", "levée", "la lever")
    const motif = texte(args.motif, "Le motif de la levée", 500)
    const maintenant = Date.now()
    await ctx.db.patch(args.ltvId, {
      statut: "levee",
      leveeLe: maintenant,
      leveeParId: user._id,
      motifLevee: motif,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "ltv",
      entiteId: args.ltvId,
      table: "infraLtv",
      type: "ltv_levee",
      libelle: `LTV levée, retour à ${ltv.vitesseNominaleKmh} km/h`,
      detail: motif,
      auteurId: user._id,
      avant: { statut: "active" },
      apres: { statut: "levee" },
      motif,
      maintenant,
    })
    return { statut: "levee" as const }
  },
})

/* ─────────────────────────── Voie ─────────────────────────────────────── */

export const majEtatSection = mutation({
  args: {
    sectionId: v.id("infraSections"),
    etat: infraEtatVoieValidator,
    noteEtat: v.optional(v.string()),
    partBetonPct: v.optional(v.number()),
    auscultationLe: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "voie_gerer")
    const section = await ctx.db.get(args.sectionId)
    if (!section) throw new Error("Section introuvable.")
    const maintenant = Date.now()
    if (args.partBetonPct !== undefined) {
      if (!Number.isFinite(args.partBetonPct) || args.partBetonPct < 0 || args.partBetonPct > 100) {
        throw new Error("La part de traverses béton doit être comprise entre 0 et 100 %.")
      }
    }
    if (args.auscultationLe !== undefined && args.auscultationLe > maintenant + HEURE) {
      throw new Error("La date d'auscultation ne peut pas être dans le futur.")
    }
    const noteEtat = texteOptionnel(args.noteEtat, "La note d'état", 1000)
    const avant = {
      etat: section.etat,
      noteEtat: section.noteEtat,
      partBetonPct: section.partBetonPct,
      derniereAuscultationLe: section.derniereAuscultationLe,
    }
    const partBetonPct = args.partBetonPct ?? section.partBetonPct
    const apres = {
      etat: args.etat,
      noteEtat: noteEtat ?? section.noteEtat,
      partBetonPct,
      typeTraverse: typeTraverseDepuisPart(partBetonPct),
      derniereAuscultationLe: args.auscultationLe ?? section.derniereAuscultationLe,
    }
    await ctx.db.patch(args.sectionId, { ...apres, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "section",
      entiteId: args.sectionId,
      table: "infraSections",
      type: args.auscultationLe !== undefined ? "section_auscultee" : "section_etat",
      libelle:
        section.etat === args.etat
          ? `État confirmé : ${LIBELLES_ETAT_VOIE[args.etat].toLowerCase()}`
          : `État ${LIBELLES_ETAT_VOIE[section.etat].toLowerCase()} → ${LIBELLES_ETAT_VOIE[args.etat].toLowerCase()}`,
      detail: noteEtat,
      auteurId: user._id,
      avant,
      apres,
      maintenant,
    })
    return apres
  },
})

/* ─────────────────────────── Ouvrages d'art ───────────────────────────── */

/** Délai d'une première inspection après inscription à l'inventaire. */
const DELAI_INSPECTION_INITIALE_MS = 90 * JOUR

export const creerOuvrage = mutation({
  args: {
    code: v.string(),
    nom: v.string(),
    type: infraTypeOuvrageValidator,
    pk: v.number(),
    longueurM: v.number(),
    materiau: v.string(),
    anneeConstruction: v.number(),
    franchissement: v.optional(v.string()),
    cotation: v.optional(infraCotationValidator),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ouvrage_inspecter", "creer")
    const code = texte(args.code, "Le code", 40).toUpperCase()
    const existant = await ctx.db
      .query("infraOuvrages")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (existant) throw new Error(`Le code ${code} est déjà attribué à « ${existant.nom} ».`)
    assertPk(args.pk)
    positif(args.longueurM, "La longueur", true)
    const annee = new Date().getUTCFullYear()
    if (!Number.isInteger(args.anneeConstruction) || args.anneeConstruction < 1880 || args.anneeConstruction > annee) {
      throw new Error(`L'année de construction doit être comprise entre 1880 et ${annee}.`)
    }
    const maintenant = Date.now()
    const cotation = args.cotation ?? "1"
    const surveillance = surveillanceIqoa(cotation)
    const doc = {
      code,
      nom: texte(args.nom, "Le nom", 200),
      type: args.type,
      pk: args.pk,
      sectionId: sectionDuPk(await chargerSections(ctx), args.pk)?._id,
      longueurM: args.longueurM,
      materiau: texte(args.materiau, "Le matériau", 120),
      anneeConstruction: args.anneeConstruction,
      franchissement: texteOptionnel(args.franchissement, "Le franchissement", 200),
      cotation,
      surveillanceRenforcee: surveillance.surveillanceRenforcee,
      periodiciteMois: surveillance.periodiciteMois,
      prochaineInspectionLe: maintenant + DELAI_INSPECTION_INITIALE_MS,
      majLe: maintenant,
    }
    const ouvrageId = await ctx.db.insert("infraOuvrages", doc)
    await journaliserInfra(ctx, {
      entite: "ouvrage",
      entiteId: ouvrageId,
      table: "infraOuvrages",
      type: "ouvrage_cree",
      libelle: `Ouvrage ${code} inscrit à l'inventaire`,
      detail: "Inspection initiale à réaliser sous trois mois.",
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    return { ouvrageId }
  },
})

export const modifierOuvrage = mutation({
  args: {
    ouvrageId: v.id("infraOuvrages"),
    nom: v.optional(v.string()),
    longueurM: v.optional(v.number()),
    materiau: v.optional(v.string()),
    anneeConstruction: v.optional(v.number()),
    franchissement: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ouvrage_inspecter")
    const ouvrage = await exigerOuvrage(ctx, args.ouvrageId)
    const patch: Partial<Doc<"infraOuvrages">> = {}
    if (args.nom !== undefined) patch.nom = texte(args.nom, "Le nom", 200)
    if (args.longueurM !== undefined) patch.longueurM = positif(args.longueurM, "La longueur", true)
    if (args.materiau !== undefined) patch.materiau = texte(args.materiau, "Le matériau", 120)
    if (args.anneeConstruction !== undefined) {
      const annee = new Date().getUTCFullYear()
      if (!Number.isInteger(args.anneeConstruction) || args.anneeConstruction < 1880 || args.anneeConstruction > annee) {
        throw new Error(`L'année de construction doit être comprise entre 1880 et ${annee}.`)
      }
      patch.anneeConstruction = args.anneeConstruction
    }
    if (args.franchissement !== undefined) {
      patch.franchissement = texteOptionnel(args.franchissement, "Le franchissement", 200)
    }
    if (Object.keys(patch).length === 0) throw new Error("Aucune modification fournie.")
    const maintenant = Date.now()
    const avant = Object.fromEntries(
      Object.keys(patch).map((cle) => [cle, ouvrage[cle as keyof typeof ouvrage]])
    )
    await ctx.db.patch(args.ouvrageId, { ...patch, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "ouvrage",
      entiteId: args.ouvrageId,
      table: "infraOuvrages",
      type: "ouvrage_modifie",
      libelle: "Fiche de l'ouvrage mise à jour",
      auteurId: user._id,
      avant,
      apres: patch,
      maintenant,
    })
    return { ok: true as const }
  },
})

const desordreValidator = v.object({
  partie: v.string(),
  description: v.string(),
  gravite: infraGraviteValidator,
})

function validerDesordres(desordres: { partie: string; description: string; gravite: Doc<"infraInspections">["desordres"][number]["gravite"] }[]) {
  if (desordres.length > 50) throw new Error("Au plus 50 désordres par inspection.")
  return desordres.map((d, index) => ({
    partie: texte(d.partie, `La partie d'ouvrage du désordre ${index + 1}`, 120),
    description: texte(d.description, `La description du désordre ${index + 1}`, 1000),
    gravite: d.gravite,
  }))
}

export const creerInspection = mutation({
  args: {
    ouvrageId: v.id("infraOuvrages"),
    type: infraTypeInspectionValidator,
    dateInspection: v.number(),
    constats: v.string(),
    desordres: v.array(desordreValidator),
    cotationProposee: infraCotationValidator,
    recommandations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ouvrage_inspecter", "creer")
    const ouvrage = await exigerOuvrage(ctx, args.ouvrageId)
    const maintenant = Date.now()
    if (args.dateInspection > maintenant + JOUR) {
      throw new Error("La date d'inspection ne peut pas être dans le futur.")
    }
    const numero = await prochainNumero(ctx, "INS", maintenant)
    const doc = {
      numero,
      ouvrageId: args.ouvrageId,
      type: args.type,
      dateInspection: args.dateInspection,
      inspecteurId: user._id,
      inspecteurNom: nomAgent(user) ?? "Agent SETRAG",
      constats: texte(args.constats, "Les constats", 5000),
      desordres: validerDesordres(args.desordres),
      cotationAvant: ouvrage.cotation,
      cotationProposee: args.cotationProposee,
      recommandations: texteOptionnel(args.recommandations, "Les recommandations", 3000),
      statut: "brouillon" as const,
      creeLe: maintenant,
    }
    const inspectionId = await ctx.db.insert("infraInspections", doc)
    await journaliserInfra(ctx, {
      entite: "inspection",
      entiteId: inspectionId,
      table: "infraInspections",
      type: "inspection_redigee",
      libelle: `Inspection ${numero} rédigée (brouillon)`,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "ouvrage",
      entiteId: args.ouvrageId,
      table: "infraOuvrages",
      type: "ouvrage_inspection_redigee",
      libelle: `Inspection ${numero} en brouillon, cotation proposée ${args.cotationProposee}`,
      auteurId: user._id,
      apres: { inspectionId },
      maintenant,
    })
    return { inspectionId, numero }
  },
})

export const modifierInspection = mutation({
  args: {
    inspectionId: v.id("infraInspections"),
    type: v.optional(infraTypeInspectionValidator),
    dateInspection: v.optional(v.number()),
    constats: v.optional(v.string()),
    desordres: v.optional(v.array(desordreValidator)),
    cotationProposee: v.optional(infraCotationValidator),
    recommandations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "ouvrage_inspecter")
    const inspection = await exigerInspection(ctx, args.inspectionId)
    if (inspection.statut !== "brouillon") {
      refusTransition("l'inspection", "validée", "la modifier")
    }
    if (inspection.inspecteurId && inspection.inspecteurId !== user._id) {
      throw new Error("Seul l'inspecteur auteur peut modifier son brouillon.")
    }
    const maintenant = Date.now()
    const patch: Partial<Doc<"infraInspections">> = {}
    if (args.type !== undefined) patch.type = args.type
    if (args.dateInspection !== undefined) {
      if (args.dateInspection > maintenant + JOUR) {
        throw new Error("La date d'inspection ne peut pas être dans le futur.")
      }
      patch.dateInspection = args.dateInspection
    }
    if (args.constats !== undefined) patch.constats = texte(args.constats, "Les constats", 5000)
    if (args.desordres !== undefined) patch.desordres = validerDesordres(args.desordres)
    if (args.cotationProposee !== undefined) patch.cotationProposee = args.cotationProposee
    if (args.recommandations !== undefined) {
      patch.recommandations = texteOptionnel(args.recommandations, "Les recommandations", 3000)
    }
    if (Object.keys(patch).length === 0) throw new Error("Aucune modification fournie.")
    const avant = Object.fromEntries(
      Object.keys(patch).map((cle) => [cle, inspection[cle as keyof typeof inspection]])
    )
    await ctx.db.patch(args.inspectionId, patch)
    await journaliserInfra(ctx, {
      entite: "inspection",
      entiteId: args.inspectionId,
      table: "infraInspections",
      type: "inspection_modifiee",
      libelle: "Brouillon d'inspection modifié",
      auteurId: user._id,
      avant,
      apres: patch,
      maintenant,
    })
    return { ok: true as const }
  },
})

export const validerInspection = mutation({
  args: { inspectionId: v.id("infraInspections") },
  handler: async (ctx, { inspectionId }) => {
    const user = await exigerInfra(ctx, "inspection_valider")
    const inspection = await exigerInspection(ctx, inspectionId)
    if (inspection.statut !== "brouillon") {
      refusTransition("l'inspection", "validée", "la valider de nouveau")
    }
    if (inspection.inspecteurId === user._id) {
      throw new Error(
        "Séparation des tâches : l'inspecteur ne peut pas valider sa propre inspection."
      )
    }
    const ouvrage = await exigerOuvrage(ctx, inspection.ouvrageId)
    const maintenant = Date.now()
    const surveillance = surveillanceIqoa(inspection.cotationProposee, inspection.type)
    const derniereInspectionLe = Math.max(
      ouvrage.derniereInspectionLe ?? 0,
      inspection.dateInspection
    )
    const avantOuvrage = {
      cotation: ouvrage.cotation,
      surveillanceRenforcee: ouvrage.surveillanceRenforcee,
      periodiciteMois: ouvrage.periodiciteMois,
      derniereInspectionLe: ouvrage.derniereInspectionLe,
      prochaineInspectionLe: ouvrage.prochaineInspectionLe,
    }
    const apresOuvrage = {
      cotation: inspection.cotationProposee,
      surveillanceRenforcee: surveillance.surveillanceRenforcee,
      periodiciteMois: surveillance.periodiciteMois,
      derniereInspectionLe,
      prochaineInspectionLe: ajouterMois(derniereInspectionLe, surveillance.periodiciteMois),
    }
    await ctx.db.patch(inspectionId, {
      statut: "validee",
      valideParId: user._id,
      valideLe: maintenant,
    })
    await ctx.db.patch(ouvrage._id, { ...apresOuvrage, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "inspection",
      entiteId: inspectionId,
      table: "infraInspections",
      type: "inspection_validee",
      libelle: `Inspection validée par ${nomAgent(user)}`,
      auteurId: user._id,
      avant: { statut: "brouillon" },
      apres: { statut: "validee" },
      permission: "valider",
      maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "ouvrage",
      entiteId: ouvrage._id,
      table: "infraOuvrages",
      type: "ouvrage_cotation",
      libelle:
        ouvrage.cotation === inspection.cotationProposee
          ? `Cotation ${inspection.cotationProposee} confirmée (${inspection.numero})`
          : `Cotation ${ouvrage.cotation} → ${inspection.cotationProposee} (${inspection.numero})`,
      detail: `${LIBELLES_COTATION[inspection.cotationProposee]}. Prochaine inspection sous ${surveillance.periodiciteMois} mois${surveillance.surveillanceRenforcee ? ", surveillance renforcée" : ""}.`,
      auteurId: user._id,
      avant: avantOuvrage,
      apres: apresOuvrage,
      permission: "valider",
      maintenant,
    })
    return apresOuvrage
  },
})

/* ─────────────────────────── Équipements ──────────────────────────────── */

export const creerEquipement = mutation({
  args: {
    code: v.string(),
    libelle: v.string(),
    categorie: infraCategorieEquipementValidator,
    type: v.string(),
    pk: v.number(),
    pkFin: v.optional(v.number()),
    alimentation: v.optional(v.string()),
    periodiciteJours: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, capaciteEquipement(args.categorie), "creer")
    const code = texte(args.code, "Le code", 40).toUpperCase()
    const existant = await ctx.db
      .query("infraEquipements")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (existant) throw new Error(`Le code ${code} est déjà attribué à « ${existant.libelle} ».`)
    if (args.pkFin !== undefined) assertPlagePk(args.pk, args.pkFin)
    else assertPk(args.pk)
    if (!Number.isInteger(args.periodiciteJours) || args.periodiciteJours < 1 || args.periodiciteJours > 1830) {
      throw new Error("La périodicité de maintenance doit être comprise entre 1 et 1 830 jours.")
    }
    const maintenant = Date.now()
    const doc = {
      code,
      libelle: texte(args.libelle, "Le libellé", 200),
      categorie: args.categorie,
      type: texte(args.type, "Le type", 120),
      pk: args.pk,
      pkFin: args.pkFin,
      sectionId: sectionDuPk(await chargerSections(ctx), args.pk)?._id,
      etat: "en_service" as const,
      alimentation: texteOptionnel(args.alimentation, "L'alimentation", 120),
      periodiciteJours: args.periodiciteJours,
      notes: texteOptionnel(args.notes, "Les notes", 2000),
      majLe: maintenant,
    }
    const equipementId = await ctx.db.insert("infraEquipements", doc)
    await journaliserInfra(ctx, {
      entite: "equipement",
      entiteId: equipementId,
      table: "infraEquipements",
      type: "equipement_cree",
      libelle: `Équipement ${code} inscrit à l'inventaire`,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    return { equipementId }
  },
})

export const majEtatEquipement = mutation({
  args: {
    equipementId: v.id("infraEquipements"),
    etat: infraEtatEquipementValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const equipement = await exigerEquipement(ctx, args.equipementId)
    const user = await exigerInfra(ctx, capaciteEquipement(equipement.categorie))
    const notes = texteOptionnel(args.notes, "Les notes", 2000)
    if (equipement.etat === args.etat && notes === undefined) {
      throw new Error("Aucun changement : l'équipement est déjà dans cet état.")
    }
    const maintenant = Date.now()
    await ctx.db.patch(args.equipementId, {
      etat: args.etat,
      notes: notes ?? equipement.notes,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "equipement",
      entiteId: args.equipementId,
      table: "infraEquipements",
      type: "equipement_etat",
      libelle: `État ${LIBELLES_ETAT_EQUIPEMENT[equipement.etat].toLowerCase()} → ${LIBELLES_ETAT_EQUIPEMENT[args.etat].toLowerCase()}`,
      detail: notes,
      auteurId: user._id,
      avant: { etat: equipement.etat, notes: equipement.notes },
      apres: { etat: args.etat, notes: notes ?? equipement.notes },
      maintenant,
    })
    return { etat: args.etat }
  },
})

export const enregistrerMaintenanceEquipement = mutation({
  args: {
    equipementId: v.id("infraEquipements"),
    realiseeLe: v.number(),
    compteRendu: v.string(),
    etat: infraEtatEquipementValidator,
  },
  handler: async (ctx, args) => {
    const equipement = await exigerEquipement(ctx, args.equipementId)
    const user = await exigerInfra(ctx, capaciteEquipement(equipement.categorie))
    const maintenant = Date.now()
    if (args.realiseeLe > maintenant + HEURE) {
      throw new Error("La date de maintenance ne peut pas être dans le futur.")
    }
    if (equipement.derniereMaintenanceLe !== undefined && args.realiseeLe < equipement.derniereMaintenanceLe) {
      throw new Error("Une maintenance plus récente est déjà enregistrée.")
    }
    const compteRendu = texte(args.compteRendu, "Le compte rendu", 3000)
    const apres = { derniereMaintenanceLe: args.realiseeLe, etat: args.etat }
    await ctx.db.patch(args.equipementId, { ...apres, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "equipement",
      entiteId: args.equipementId,
      table: "infraEquipements",
      type: "equipement_maintenance",
      libelle: `Maintenance réalisée, état ${LIBELLES_ETAT_EQUIPEMENT[args.etat].toLowerCase()}`,
      detail: compteRendu,
      auteurId: user._id,
      avant: { derniereMaintenanceLe: equipement.derniereMaintenanceLe, etat: equipement.etat },
      apres,
      maintenant,
    })
    return apres
  },
})

/* ─────────────────────────── Chantiers PRN ────────────────────────────── */

const financementValidator = v.object({
  bailleur: infraBailleurValidator,
  montantFcfa: v.number(),
})

function validerFinancements(
  financements: { bailleur: Doc<"infraChantiers">["financements"][number]["bailleur"]; montantFcfa: number }[],
  budgetFcfa: number
) {
  const vus = new Set<string>()
  let total = 0
  for (const f of financements) {
    if (vus.has(f.bailleur)) throw new Error(`Le bailleur ${f.bailleur} figure deux fois.`)
    vus.add(f.bailleur)
    positif(f.montantFcfa, "Le montant d'un financement", true)
    total += f.montantFcfa
  }
  if (total > budgetFcfa) {
    throw new Error("La somme des financements dépasse le budget du chantier.")
  }
  return financements
}

export const creerChantier = mutation({
  args: {
    code: v.string(),
    libelle: v.string(),
    description: v.string(),
    nature: infraNatureChantierValidator,
    pkDebut: v.number(),
    pkFin: v.number(),
    entreprise: v.string(),
    maitreOeuvre: v.string(),
    budgetFcfa: v.number(),
    financements: v.array(financementValidator),
    uniteQuantite: v.string(),
    quantitePrevue: v.number(),
    debutLe: v.number(),
    finPrevueLe: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_gerer", "creer")
    const code = texte(args.code, "Le code", 40).toUpperCase()
    const existant = await ctx.db
      .query("infraChantiers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (existant) throw new Error(`Le code ${code} est déjà attribué au chantier « ${existant.libelle} ».`)
    assertPlagePk(args.pkDebut, args.pkFin)
    positif(args.budgetFcfa, "Le budget", true)
    positif(args.quantitePrevue, "La quantité prévue", true)
    if (args.finPrevueLe <= args.debutLe) {
      throw new Error("La fin prévue doit suivre le début du chantier.")
    }
    const maintenant = Date.now()
    const doc = {
      code,
      libelle: texte(args.libelle, "Le libellé", 200),
      description: texte(args.description, "La description", 3000),
      nature: args.nature,
      pkDebut: args.pkDebut,
      pkFin: args.pkFin,
      entreprise: texte(args.entreprise, "L'entreprise", 200),
      maitreOeuvre: texte(args.maitreOeuvre, "Le maître d'œuvre", 200),
      budgetFcfa: args.budgetFcfa,
      financements: validerFinancements(args.financements, args.budgetFcfa),
      uniteQuantite: texte(args.uniteQuantite, "L'unité", 20),
      quantitePrevue: args.quantitePrevue,
      statut: "etude" as const,
      debutLe: args.debutLe,
      finPrevueLe: args.finPrevueLe,
      responsableId: user._id,
      majLe: maintenant,
    }
    const chantierId = await ctx.db.insert("infraChantiers", doc)
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: chantierId,
      table: "infraChantiers",
      type: "chantier_cree",
      libelle: `Chantier ${code} inscrit au programme (en étude)`,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    return { chantierId }
  },
})

export const modifierChantier = mutation({
  args: {
    chantierId: v.id("infraChantiers"),
    libelle: v.optional(v.string()),
    description: v.optional(v.string()),
    entreprise: v.optional(v.string()),
    maitreOeuvre: v.optional(v.string()),
    budgetFcfa: v.optional(v.number()),
    financements: v.optional(v.array(financementValidator)),
    finPrevueLe: v.optional(v.number()),
    statut: v.optional(infraStatutChantierValidator),
    motif: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_gerer")
    const chantier = await exigerChantier(ctx, args.chantierId)
    if (chantier.statut === "receptionne") {
      refusTransition("le chantier", "réceptionné", "le modifier")
    }
    const maintenant = Date.now()
    const motif = texteOptionnel(args.motif, "Le motif", 500)
    const patch: Partial<Doc<"infraChantiers">> = {}
    if (args.libelle !== undefined) patch.libelle = texte(args.libelle, "Le libellé", 200)
    if (args.description !== undefined) patch.description = texte(args.description, "La description", 3000)
    if (args.entreprise !== undefined) patch.entreprise = texte(args.entreprise, "L'entreprise", 200)
    if (args.maitreOeuvre !== undefined) patch.maitreOeuvre = texte(args.maitreOeuvre, "Le maître d'œuvre", 200)
    const budget = args.budgetFcfa ?? chantier.budgetFcfa
    if (args.budgetFcfa !== undefined) {
      positif(args.budgetFcfa, "Le budget", true)
      const situations = await ctx.db
        .query("infraAvancements")
        .withIndex("by_chantier", (q) => q.eq("chantierId", chantier._id))
        .collect()
      const paye = avancement(chantier, situations).payeFcfa
      if (args.budgetFcfa < paye) {
        throw new Error("Le budget ne peut pas être inférieur au montant déjà payé.")
      }
      patch.budgetFcfa = args.budgetFcfa
    }
    if (args.financements !== undefined) {
      patch.financements = validerFinancements(args.financements, budget)
    } else if (args.budgetFcfa !== undefined) {
      validerFinancements(chantier.financements, budget)
    }
    if (args.finPrevueLe !== undefined) {
      if (args.finPrevueLe <= chantier.debutLe) {
        throw new Error("La fin prévue doit suivre le début du chantier.")
      }
      patch.finPrevueLe = args.finPrevueLe
    }
    if (args.statut !== undefined && args.statut !== chantier.statut) {
      if (!transitionChantierPermise(chantier.statut, args.statut)) {
        throw new Error(
          `Transition refusée : un chantier « ${LIBELLES_STATUT_CHANTIER[chantier.statut]} » ne peut pas passer à « ${LIBELLES_STATUT_CHANTIER[args.statut]} ».`
        )
      }
      if (args.statut === "suspendu" && !motif) {
        throw new Error("Le motif de la suspension est obligatoire.")
      }
      patch.statut = args.statut
      if (args.statut === "receptionne") patch.finReelleLe = maintenant
    }
    if (Object.keys(patch).length === 0) throw new Error("Aucune modification fournie.")
    const avant = Object.fromEntries(
      Object.keys(patch).map((cle) => [cle, chantier[cle as keyof typeof chantier]])
    )
    await ctx.db.patch(args.chantierId, { ...patch, majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: args.chantierId,
      table: "infraChantiers",
      type: patch.statut ? `chantier_${patch.statut}` : "chantier_modifie",
      libelle: patch.statut
        ? `Chantier ${LIBELLES_STATUT_CHANTIER[chantier.statut].toLowerCase()} → ${LIBELLES_STATUT_CHANTIER[patch.statut].toLowerCase()}`
        : "Fiche du chantier mise à jour",
      detail: motif,
      auteurId: user._id,
      avant,
      apres: patch,
      motif,
      permission: patch.statut === "receptionne" ? "valider" : "modifier",
      maintenant,
    })
    return { statut: patch.statut ?? chantier.statut }
  },
})

export const ajouterLot = mutation({
  args: {
    chantierId: v.id("infraChantiers"),
    code: v.string(),
    libelle: v.string(),
    entreprise: v.string(),
    montantFcfa: v.number(),
    pkDebut: v.number(),
    pkFin: v.number(),
    quantitePrevue: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_gerer", "creer")
    const chantier = await exigerChantier(ctx, args.chantierId)
    if (chantier.statut === "receptionne") {
      refusTransition("le chantier", "réceptionné", "y ajouter un lot")
    }
    assertPlagePk(args.pkDebut, args.pkFin)
    if (args.pkDebut < chantier.pkDebut || args.pkFin > chantier.pkFin) {
      throw new Error(
        `La plage du lot doit rester dans celle du chantier (PK ${chantier.pkDebut} à ${chantier.pkFin}).`
      )
    }
    positif(args.montantFcfa, "Le montant du lot", true)
    positif(args.quantitePrevue, "La quantité prévue", true)
    const lots = await ctx.db
      .query("infraLots")
      .withIndex("by_chantier", (q) => q.eq("chantierId", args.chantierId))
      .collect()
    const code = texte(args.code, "Le code du lot", 40).toUpperCase()
    if (lots.some((lot) => lot.code === code)) {
      throw new Error(`Le lot ${code} existe déjà sur ce chantier.`)
    }
    const totalLots = lots.reduce((s, lot) => s + lot.montantFcfa, 0) + args.montantFcfa
    if (totalLots > chantier.budgetFcfa) {
      throw new Error("La somme des lots dépasserait le budget du chantier.")
    }
    const doc = {
      chantierId: args.chantierId,
      code,
      libelle: texte(args.libelle, "Le libellé du lot", 200),
      entreprise: texte(args.entreprise, "L'entreprise", 200),
      montantFcfa: args.montantFcfa,
      pkDebut: args.pkDebut,
      pkFin: args.pkFin,
      quantitePrevue: args.quantitePrevue,
    }
    const lotId = await ctx.db.insert("infraLots", doc)
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: args.chantierId,
      table: "infraLots",
      type: "chantier_lot_ajoute",
      libelle: `Lot ${code} ajouté : ${doc.libelle}`,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
    })
    return { lotId }
  },
})

async function controlerSituation(
  ctx: MutationCtx,
  chantier: Doc<"infraChantiers">,
  lot: Doc<"infraLots"> | null,
  situation: { quantite: number; montantPayeFcfa: number },
  exclure?: Id<"infraAvancements">
) {
  const situations = (
    await ctx.db
      .query("infraAvancements")
      .withIndex("by_chantier", (q) => q.eq("chantierId", chantier._id))
      .collect()
  ).filter((s) => s._id !== exclure)
  const duChantier = avancement(chantier, situations)
  const erreurChantier = erreurSituation({
    quantitePrevue: chantier.quantitePrevue,
    budgetFcfa: chantier.budgetFcfa,
    quantiteValidee: duChantier.quantiteRealisee,
    payeValide: duChantier.payeFcfa,
    quantite: situation.quantite,
    montantPayeFcfa: situation.montantPayeFcfa,
    unite: chantier.uniteQuantite,
    portee: `le chantier ${chantier.code}`,
  })
  if (erreurChantier) throw new Error(erreurChantier)
  if (lot) {
    const duLot = avancement(
      { quantitePrevue: lot.quantitePrevue, budgetFcfa: lot.montantFcfa },
      situations.filter((s) => s.lotId === lot._id)
    )
    const erreurLot = erreurSituation({
      quantitePrevue: lot.quantitePrevue,
      budgetFcfa: lot.montantFcfa,
      quantiteValidee: duLot.quantiteRealisee,
      payeValide: duLot.payeFcfa,
      quantite: situation.quantite,
      montantPayeFcfa: situation.montantPayeFcfa,
      unite: chantier.uniteQuantite,
      portee: `le lot ${lot.code}`,
    })
    if (erreurLot) throw new Error(erreurLot)
  }
}

export const saisirAvancement = mutation({
  args: {
    chantierId: v.id("infraChantiers"),
    lotId: v.optional(v.id("infraLots")),
    periode: v.string(),
    quantite: v.number(),
    montantTravauxFcfa: v.number(),
    montantPayeFcfa: v.number(),
    bailleur: v.optional(infraBailleurValidator),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_avancement_saisir", "creer")
    const chantier = await exigerChantier(ctx, args.chantierId)
    if (chantier.statut !== "en_cours") {
      throw new Error(
        `Saisie refusée : le chantier est « ${LIBELLES_STATUT_CHANTIER[chantier.statut]} », l'avancement se saisit sur un chantier en cours.`
      )
    }
    const maintenant = Date.now()
    if (!periodeValide(args.periode)) {
      throw new Error("La période doit être au format AAAA-MM (par exemple 2026-09).")
    }
    if (args.periode > periodeLibreville(maintenant)) {
      throw new Error("On ne saisit pas l'avancement d'une période future.")
    }
    positif(args.quantite, "La quantité")
    positif(args.montantTravauxFcfa, "Le montant des travaux")
    positif(args.montantPayeFcfa, "Le montant payé")
    if (args.quantite === 0 && args.montantTravauxFcfa === 0 && args.montantPayeFcfa === 0) {
      throw new Error("La situation est vide : renseignez une quantité ou un montant.")
    }
    let lot: Doc<"infraLots"> | null = null
    if (args.lotId) {
      lot = await ctx.db.get(args.lotId)
      if (!lot || lot.chantierId !== chantier._id) {
        throw new Error("Ce lot n'appartient pas au chantier.")
      }
    }
    if (args.bailleur && !chantier.financements.some((f) => f.bailleur === args.bailleur)) {
      throw new Error("Ce bailleur ne finance pas le chantier.")
    }
    await controlerSituation(ctx, chantier, lot, args)
    const doc = {
      chantierId: args.chantierId,
      lotId: args.lotId,
      periode: args.periode,
      quantite: args.quantite,
      montantTravauxFcfa: args.montantTravauxFcfa,
      montantPayeFcfa: args.montantPayeFcfa,
      bailleur: args.bailleur,
      commentaire: texteOptionnel(args.commentaire, "Le commentaire", 1000),
      statut: "saisie" as const,
      saisiParId: user._id,
      saisiLe: maintenant,
    }
    const avancementId = await ctx.db.insert("infraAvancements", doc)
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: args.chantierId,
      table: "infraAvancements",
      type: "chantier_avancement_saisi",
      libelle: `Situation ${args.periode}${lot ? ` (lot ${lot.code})` : ""} saisie : ${args.quantite} ${chantier.uniteQuantite}`,
      detail: doc.commentaire,
      auteurId: user._id,
      apres: { avancementId, ...doc },
      permission: "creer",
      maintenant,
    })
    return { avancementId }
  },
})

export const validerAvancement = mutation({
  args: { avancementId: v.id("infraAvancements") },
  handler: async (ctx, { avancementId }) => {
    const user = await exigerInfra(ctx, "prn_valider")
    const situation = await ctx.db.get(avancementId)
    if (!situation) throw new Error("Situation d'avancement introuvable.")
    if (situation.statut !== "saisie") {
      refusTransition("la situation", situation.statut === "validee" ? "validée" : "rejetée", "la valider")
    }
    if (situation.saisiParId === user._id) {
      throw new Error(
        "Séparation des tâches : l'auteur de la saisie ne peut pas valider sa propre situation."
      )
    }
    const chantier = await exigerChantier(ctx, situation.chantierId)
    const lot = situation.lotId ? await ctx.db.get(situation.lotId) : null
    await controlerSituation(ctx, chantier, lot, situation, avancementId)
    const maintenant = Date.now()
    await ctx.db.patch(avancementId, {
      statut: "validee",
      valideParId: user._id,
      valideLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: chantier._id,
      table: "infraAvancements",
      type: "chantier_avancement_valide",
      libelle: `Situation ${situation.periode} validée par ${nomAgent(user)}`,
      auteurId: user._id,
      avant: { avancementId, statut: "saisie" },
      apres: { avancementId, statut: "validee" },
      permission: "valider",
      maintenant,
    })
    return { statut: "validee" as const }
  },
})

export const rejeterAvancement = mutation({
  args: { avancementId: v.id("infraAvancements"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_valider")
    const situation = await ctx.db.get(args.avancementId)
    if (!situation) throw new Error("Situation d'avancement introuvable.")
    if (situation.statut !== "saisie") {
      refusTransition("la situation", situation.statut === "validee" ? "validée" : "rejetée", "la rejeter")
    }
    const motif = texte(args.motif, "Le motif du rejet", 500)
    const maintenant = Date.now()
    await ctx.db.patch(args.avancementId, {
      statut: "rejetee",
      motifRejet: motif,
      valideParId: user._id,
      valideLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: situation.chantierId,
      table: "infraAvancements",
      type: "chantier_avancement_rejete",
      libelle: `Situation ${situation.periode} rejetée`,
      detail: motif,
      auteurId: user._id,
      avant: { avancementId: args.avancementId, statut: "saisie" },
      apres: { avancementId: args.avancementId, statut: "rejetee" },
      motif,
      permission: "valider",
      maintenant,
    })
    return { statut: "rejetee" as const }
  },
})

export const ajouterJalon = mutation({
  args: {
    chantierId: v.id("infraChantiers"),
    libelle: v.string(),
    prevuLe: v.number(),
    conditionDecaissement: v.boolean(),
    bailleur: v.optional(infraBailleurValidator),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_gerer", "creer")
    const chantier = await exigerChantier(ctx, args.chantierId)
    if (chantier.statut === "receptionne") {
      refusTransition("le chantier", "réceptionné", "y ajouter un jalon")
    }
    if (args.conditionDecaissement && !args.bailleur) {
      throw new Error("Un jalon de décaissement doit désigner le bailleur concerné.")
    }
    if (args.bailleur && !chantier.financements.some((f) => f.bailleur === args.bailleur)) {
      throw new Error("Ce bailleur ne finance pas le chantier.")
    }
    const doc = {
      chantierId: args.chantierId,
      libelle: texte(args.libelle, "Le libellé du jalon", 200),
      prevuLe: args.prevuLe,
      conditionDecaissement: args.conditionDecaissement,
      bailleur: args.bailleur,
    }
    const jalonId = await ctx.db.insert("infraJalons", doc)
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: args.chantierId,
      table: "infraJalons",
      type: "chantier_jalon_ajoute",
      libelle: `Jalon ajouté : ${doc.libelle}`,
      auteurId: user._id,
      apres: { jalonId, ...doc },
      permission: "creer",
    })
    return { jalonId }
  },
})

export const atteindreJalon = mutation({
  args: { jalonId: v.id("infraJalons"), atteintLe: v.number(), preuve: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "prn_gerer")
    const jalon = await ctx.db.get(args.jalonId)
    if (!jalon) throw new Error("Jalon introuvable.")
    if (jalon.atteintLe !== undefined) throw new Error("Ce jalon est déjà atteint.")
    const maintenant = Date.now()
    if (args.atteintLe > maintenant + HEURE) {
      throw new Error("La date d'atteinte ne peut pas être dans le futur.")
    }
    const preuve = texte(args.preuve, "La preuve (procès-verbal, référence…)", 1000)
    await ctx.db.patch(args.jalonId, { atteintLe: args.atteintLe, preuve })
    await journaliserInfra(ctx, {
      entite: "chantier",
      entiteId: jalon.chantierId,
      table: "infraJalons",
      type: "chantier_jalon_atteint",
      libelle: `Jalon atteint : ${jalon.libelle}`,
      detail: preuve,
      auteurId: user._id,
      avant: { jalonId: args.jalonId, atteintLe: null },
      apres: { jalonId: args.jalonId, atteintLe: args.atteintLe, preuve },
      permission: "valider",
      maintenant,
    })
    return { atteintLe: args.atteintLe }
  },
})

/* ─────────────────────────── Interventions ────────────────────────────── */

export const demanderIntervention = mutation({
  args: {
    libelle: v.string(),
    type: infraTypeInterventionValidator,
    pkDebut: v.number(),
    pkFin: v.number(),
    debutLe: v.number(),
    finLe: v.number(),
    interruption: v.boolean(),
    equipe: v.string(),
    chantierId: v.optional(v.id("infraChantiers")),
    anomalieId: v.optional(v.id("infraAnomalies")),
  },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "intervention_demander", "creer")
    assertPlagePk(args.pkDebut, args.pkFin)
    if (args.finLe <= args.debutLe) {
      throw new Error("La fin de la plage travaux doit suivre son début.")
    }
    if (args.finLe - args.debutLe > DUREE_MAX_INTERVENTION_MS) {
      throw new Error("Une plage travaux ne dépasse pas 72 heures : scindez la demande.")
    }
    const maintenant = Date.now()
    if (args.finLe <= maintenant) {
      throw new Error("La plage travaux est entièrement dans le passé.")
    }
    if (args.chantierId) {
      const chantier = await exigerChantier(ctx, args.chantierId)
      if (chantier.statut === "receptionne") {
        throw new Error(`Le chantier ${chantier.code} est réceptionné.`)
      }
    }
    let anomalie: Doc<"infraAnomalies"> | null = null
    if (args.anomalieId) {
      anomalie = await exigerAnomalie(ctx, args.anomalieId)
      if (!anomalieOuverte(anomalie.statut)) {
        throw new Error(`L'anomalie ${anomalie.numero} n'est plus ouverte.`)
      }
    }
    const numero = await prochainNumero(ctx, "INT", maintenant)
    const doc = {
      numero,
      libelle: texte(args.libelle, "Le libellé", 200),
      type: args.type,
      pkDebut: args.pkDebut,
      pkFin: args.pkFin,
      debutLe: args.debutLe,
      finLe: args.finLe,
      interruption: args.interruption,
      equipe: texte(args.equipe, "L'équipe", 200),
      statut: "demandee" as const,
      chantierId: args.chantierId,
      anomalieId: args.anomalieId,
      demandeurId: user._id,
      demandeLe: maintenant,
      majLe: maintenant,
    }
    const interventionId = await ctx.db.insert("infraInterventions", doc)
    await journaliserInfra(ctx, {
      entite: "intervention",
      entiteId: interventionId,
      table: "infraInterventions",
      type: "intervention_demandee",
      libelle: `Plage travaux demandée du PK ${args.pkDebut} au PK ${args.pkFin}${args.interruption ? " avec coupure de voie" : ""}`,
      auteurId: user._id,
      apres: doc,
      permission: "creer",
      maintenant,
    })
    if (anomalie) {
      await ctx.db.patch(anomalie._id, { interventionId, majLe: maintenant })
      await journaliserInfra(ctx, {
        entite: "anomalie",
        entiteId: anomalie._id,
        table: "infraAnomalies",
        type: "anomalie_intervention_liee",
        libelle: `Plage travaux ${numero} demandée pour le traitement`,
        auteurId: user._id,
        avant: { interventionId: anomalie.interventionId },
        apres: { interventionId },
        maintenant,
      })
    }
    return { interventionId, numero }
  },
})

export const accorderIntervention = mutation({
  args: { interventionId: v.id("infraInterventions") },
  handler: async (ctx, { interventionId }) => {
    const user = await exigerInfra(ctx, "intervention_accorder")
    const intervention = await exigerIntervention(ctx, interventionId)
    if (intervention.statut !== "demandee") {
      refusTransition(
        "la plage travaux",
        LIBELLES_STATUT_INTERVENTION[intervention.statut],
        "l'accorder"
      )
    }
    if (intervention.demandeurId === user._id) {
      throw new Error(
        "Séparation des tâches : le demandeur ne peut pas accorder sa propre plage travaux."
      )
    }
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
      (autre) => autre._id !== interventionId && interventionsEnConflit(intervention, autre)
    )
    if (conflits.length > 0) {
      throw new Error(
        `Conflit : la plage recoupe ${conflits.map((c) => c.numero).join(", ")} sur le même créneau, avec coupure de voie.`
      )
    }
    const maintenant = Date.now()
    await ctx.db.patch(interventionId, {
      statut: "accordee",
      accordeParId: user._id,
      accordeLe: maintenant,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "intervention",
      entiteId: interventionId,
      table: "infraInterventions",
      type: "intervention_accordee",
      libelle: `Plage travaux accordée par ${nomAgent(user)}`,
      auteurId: user._id,
      avant: { statut: "demandee" },
      apres: { statut: "accordee" },
      permission: "valider",
      maintenant,
    })
    return { statut: "accordee" as const }
  },
})

export const refuserIntervention = mutation({
  args: { interventionId: v.id("infraInterventions"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "intervention_accorder")
    const intervention = await exigerIntervention(ctx, args.interventionId)
    if (intervention.statut !== "demandee") {
      refusTransition(
        "la plage travaux",
        LIBELLES_STATUT_INTERVENTION[intervention.statut],
        "la refuser"
      )
    }
    const motif = texte(args.motif, "Le motif du refus", 500)
    const maintenant = Date.now()
    await ctx.db.patch(args.interventionId, {
      statut: "refusee",
      motifRefus: motif,
      accordeParId: user._id,
      accordeLe: maintenant,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "intervention",
      entiteId: args.interventionId,
      table: "infraInterventions",
      type: "intervention_refusee",
      libelle: "Plage travaux refusée",
      detail: motif,
      auteurId: user._id,
      avant: { statut: "demandee" },
      apres: { statut: "refusee" },
      motif,
      permission: "valider",
      maintenant,
    })
    return { statut: "refusee" as const }
  },
})

export const demarrerIntervention = mutation({
  args: { interventionId: v.id("infraInterventions") },
  handler: async (ctx, { interventionId }) => {
    const user = await exigerInfra(ctx, "intervention_demander")
    const intervention = await exigerIntervention(ctx, interventionId)
    if (intervention.statut !== "accordee") {
      refusTransition(
        "la plage travaux",
        LIBELLES_STATUT_INTERVENTION[intervention.statut],
        "la démarrer"
      )
    }
    const maintenant = Date.now()
    if (maintenant < intervention.debutLe - HEURE) {
      throw new Error("La plage travaux ne peut pas démarrer plus d'une heure avant son créneau.")
    }
    await ctx.db.patch(interventionId, { statut: "en_cours", majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "intervention",
      entiteId: interventionId,
      table: "infraInterventions",
      type: "intervention_demarree",
      libelle: "Travaux démarrés, voie remise à l'équipe",
      auteurId: user._id,
      avant: { statut: "accordee" },
      apres: { statut: "en_cours" },
      maintenant,
    })
    return { statut: "en_cours" as const }
  },
})

export const terminerIntervention = mutation({
  args: { interventionId: v.id("infraInterventions"), compteRendu: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "intervention_demander")
    const intervention = await exigerIntervention(ctx, args.interventionId)
    if (intervention.statut !== "en_cours") {
      refusTransition(
        "la plage travaux",
        LIBELLES_STATUT_INTERVENTION[intervention.statut],
        "la terminer"
      )
    }
    const compteRendu = texte(args.compteRendu, "Le compte rendu", 3000)
    const maintenant = Date.now()
    await ctx.db.patch(args.interventionId, {
      statut: "terminee",
      compteRendu,
      majLe: maintenant,
    })
    await journaliserInfra(ctx, {
      entite: "intervention",
      entiteId: args.interventionId,
      table: "infraInterventions",
      type: "intervention_terminee",
      libelle: "Travaux terminés, voie restituée à la circulation",
      detail: compteRendu,
      auteurId: user._id,
      avant: { statut: "en_cours" },
      apres: { statut: "terminee" },
      maintenant,
    })
    return { statut: "terminee" as const }
  },
})

export const annulerIntervention = mutation({
  args: { interventionId: v.id("infraInterventions"), motif: v.string() },
  handler: async (ctx, args) => {
    const user = await exigerInfra(ctx, "intervention_demander")
    const intervention = await exigerIntervention(ctx, args.interventionId)
    if (intervention.statut !== "demandee" && intervention.statut !== "accordee") {
      refusTransition(
        "la plage travaux",
        LIBELLES_STATUT_INTERVENTION[intervention.statut],
        "l'annuler"
      )
    }
    const motif = texte(args.motif, "Le motif de l'annulation", 500)
    const maintenant = Date.now()
    await ctx.db.patch(args.interventionId, { statut: "annulee", majLe: maintenant })
    await journaliserInfra(ctx, {
      entite: "intervention",
      entiteId: args.interventionId,
      table: "infraInterventions",
      type: "intervention_annulee",
      libelle: "Plage travaux annulée",
      detail: motif,
      auteurId: user._id,
      avant: { statut: intervention.statut },
      apres: { statut: "annulee" },
      motif,
      maintenant,
    })
    return { statut: "annulee" as const }
  },
})
