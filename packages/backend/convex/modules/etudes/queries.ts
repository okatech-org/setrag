import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { query } from "../../_generated/server"
import { agentsInternes } from "../ged/acces"
import { jourLibreville, lecteurEtudes, nomsDe } from "./outils"
import { constatEnRetard, constatOuvert, decouperSections, extrait } from "./model"

function droitsDe(lecteur: Awaited<ReturnType<typeof lecteurEtudes>>) {
  return {
    userId: lecteur.user._id,
    peutGererPlan: lecteur.auditeur,
    peutTraiterAnnotations: lecteur.referent,
    peutAnnoter: true,
  }
}

/** Bibliothèque : études publiées, avec leur activité. */
export const bibliotheque = query({
  args: {},
  handler: async (ctx) => {
    const lecteur = await lecteurEtudes(ctx)
    const [documents, annotations, constats] = await Promise.all([
      ctx.db.query("etudesDocuments").collect(),
      ctx.db.query("etudesAnnotations").collect(),
      ctx.db.query("etudesConstats").collect(),
    ])
    const aujourdhui = jourLibreville(Date.now())
    const constatsOuverts = constats.filter((constat) => constatOuvert(constat.statut))
    const noms = await nomsDe(ctx, constatsOuverts.map((constat) => constat.responsableId))
    return {
      droits: droitsDe(lecteur),
      etudes: documents
        .sort((a, b) => a.ordre - b.ordre)
        .map((document) => ({
          _id: document._id,
          code: document.code,
          numero: document.numero,
          titre: document.titre,
          categorie: document.categorie,
          resume: document.resume,
          fichierPdf: document.fichierPdf ?? null,
          mots: document.mots,
          publieLe: document.publieLe,
          updatedAt: document.updatedAt,
          annotationsOuvertes: annotations.filter(
            (annotation) => annotation.documentId === document._id && annotation.statut === "ouverte"
          ).length,
          constatsOuverts: constatsOuverts.filter((constat) => constat.documentId === document._id).length,
        })),
      indicateurs: {
        etudes: documents.length,
        annotationsOuvertes: annotations.filter((annotation) => annotation.statut === "ouverte").length,
        constatsOuverts: constatsOuverts.length,
        constatsEnRetard: constats.filter((constat) => constatEnRetard(constat, aujourdhui)).length,
        majeursOuverts: constatsOuverts.filter((constat) => constat.gravite === "majeure").length,
        aVerifier: constats.filter((constat) => constat.statut === "realisee").length,
      },
      priorites: constatsOuverts
        .filter((constat) => constat.statut !== "realisee" || lecteur.auditeur)
        .sort((a, b) => a.echeance.localeCompare(b.echeance))
        .slice(0, 6)
        .map((constat) => ({
          _id: constat._id,
          reference: constat.reference,
          titre: constat.titre,
          gravite: constat.gravite,
          statut: constat.statut,
          echeance: constat.echeance,
          enRetard: constatEnRetard(constat, aujourdhui),
          responsable: noms.get(constat.responsableId) ?? "—",
          aMoi: constat.responsableId === lecteur.user._id,
        })),
    }
  },
})

/** Une étude, découpée en sections, avec ses annotations et ses constats. */
export const etude = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    const document = await ctx.db
      .query("etudesDocuments")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique()
    if (!document) return null
    const [annotations, constats] = await Promise.all([
      ctx.db
        .query("etudesAnnotations")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .order("asc")
        .collect(),
      ctx.db
        .query("etudesConstats")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .collect(),
    ])
    const noms = await nomsDe(ctx, [
      ...annotations.flatMap((annotation) => [annotation.auteurId, annotation.traitePar]),
      ...constats.map((constat) => constat.responsableId),
    ])
    const aujourdhui = jourLibreville(Date.now())
    return {
      droits: droitsDe(lecteur),
      etude: {
        _id: document._id,
        code: document.code,
        numero: document.numero,
        titre: document.titre,
        categorie: document.categorie,
        resume: document.resume,
        fichierMd: document.fichierMd,
        fichierPdf: document.fichierPdf ?? null,
        contenu: document.contenu,
        empreinte: document.empreinte,
        mots: document.mots,
        publieLe: document.publieLe,
        updatedAt: document.updatedAt,
      },
      sections: decouperSections(document.contenu).map((section) => ({
        rang: section.rang,
        ancre: section.ancre,
        titre: section.titre,
        niveau: section.niveau,
        corps: section.corps,
      })),
      annotations: annotations.map((annotation) => ({
        _id: annotation._id,
        ancre: annotation.ancre ?? null,
        nature: annotation.nature,
        texte: annotation.texte,
        statut: annotation.statut,
        auteur: noms.get(annotation.auteurId) ?? "—",
        aMoi: annotation.auteurId === lecteur.user._id,
        reponse: annotation.reponse ?? null,
        traitePar: annotation.traitePar ? (noms.get(annotation.traitePar) ?? "—") : null,
        traiteLe: annotation.traiteLe ?? null,
        origine: annotation.origine,
        createdAt: annotation.createdAt,
      })),
      constats: constats.map((constat) => ({
        _id: constat._id,
        reference: constat.reference,
        titre: constat.titre,
        gravite: constat.gravite,
        statut: constat.statut,
        echeance: constat.echeance,
        ancre: constat.ancre ?? null,
        enRetard: constatEnRetard(constat, aujourdhui),
        responsable: noms.get(constat.responsableId) ?? "—",
      })),
    }
  },
})

/** Recherche plein texte dans les sections de toutes les études. */
export const rechercher = query({
  args: { texte: v.string() },
  handler: async (ctx, args) => {
    await lecteurEtudes(ctx)
    const texte = args.texte.trim().slice(0, 200)
    if (texte.length < 2) return []
    const sections = await ctx.db
      .query("etudesSections")
      .withSearchIndex("recherche", (q) => q.search("texte", texte))
      .take(40)
    const documents = new Map<string, Doc<"etudesDocuments"> | null>()
    const resultats = []
    for (const section of sections) {
      if (!documents.has(section.documentId)) {
        documents.set(section.documentId, await ctx.db.get(section.documentId))
      }
      const document = documents.get(section.documentId)
      if (!document) continue
      resultats.push({
        _id: section._id,
        code: document.code,
        numero: document.numero,
        etude: document.titre,
        ancre: section.ancre,
        section: section.titre,
        extrait: extrait(section.texte, texte),
      })
    }
    return resultats
  },
})

/** Plan d'actions d'audit complet. */
export const planActions = query({
  args: {},
  handler: async (ctx) => {
    const lecteur = await lecteurEtudes(ctx)
    const [constats, documents] = await Promise.all([
      ctx.db.query("etudesConstats").collect(),
      ctx.db.query("etudesDocuments").collect(),
    ])
    const titres = new Map(documents.map((document) => [document._id as string, document]))
    const noms = await nomsDe(ctx, constats.flatMap((constat) => [constat.responsableId, constat.creePar]))
    const aujourdhui = jourLibreville(Date.now())
    return {
      droits: droitsDe(lecteur),
      lignes: constats
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((constat) => {
          const source = constat.documentId ? titres.get(constat.documentId) : undefined
          return {
            _id: constat._id,
            reference: constat.reference,
            titre: constat.titre,
            constat: constat.constat,
            recommandation: constat.recommandation,
            gravite: constat.gravite,
            statut: constat.statut,
            avancement: constat.avancement,
            direction: constat.direction,
            echeance: constat.echeance,
            enRetard: constatEnRetard(constat, aujourdhui),
            responsable: noms.get(constat.responsableId) ?? "—",
            aMoi: constat.responsableId === lecteur.user._id,
            creePar: noms.get(constat.creePar) ?? "—",
            source: source ? { code: source.code, numero: source.numero, titre: source.titre } : null,
            origine: constat.origine,
            createdAt: constat.createdAt,
            updatedAt: constat.updatedAt,
          }
        }),
    }
  },
})

/** Fiche d'un constat et son suivi complet. */
export const constat = query({
  args: { constatId: v.id("etudesConstats") },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    const fiche = await ctx.db.get(args.constatId)
    if (!fiche) return null
    const [suivis, source] = await Promise.all([
      ctx.db
        .query("etudesSuivis")
        .withIndex("by_constat", (q) => q.eq("constatId", fiche._id))
        .order("desc")
        .collect(),
      fiche.documentId ? ctx.db.get(fiche.documentId) : null,
    ])
    const noms = await nomsDe(ctx, [fiche.responsableId, fiche.creePar, ...suivis.map((suivi) => suivi.auteurId)])
    const aujourdhui = jourLibreville(Date.now())
    const responsable = fiche.responsableId === lecteur.user._id
    return {
      droits: {
        ...droitsDe(lecteur),
        estResponsable: responsable,
        peutFaireAvancer: constatOuvert(fiche.statut) && fiche.statut !== "realisee" && (responsable || lecteur.auditeur),
        peutVerifier: fiche.statut === "realisee" && lecteur.auditeur && !responsable,
        peutRouvrir: fiche.statut === "realisee" && lecteur.auditeur,
        peutAbandonner: constatOuvert(fiche.statut) && lecteur.auditeur,
        peutModifier: constatOuvert(fiche.statut) && lecteur.auditeur,
      },
      constat: {
        _id: fiche._id,
        reference: fiche.reference,
        titre: fiche.titre,
        constat: fiche.constat,
        recommandation: fiche.recommandation,
        gravite: fiche.gravite,
        statut: fiche.statut,
        avancement: fiche.avancement,
        direction: fiche.direction,
        echeance: fiche.echeance,
        enRetard: constatEnRetard(fiche, aujourdhui),
        responsableId: fiche.responsableId,
        responsable: noms.get(fiche.responsableId) ?? "—",
        creePar: noms.get(fiche.creePar) ?? "—",
        ancre: fiche.ancre ?? null,
        source: source ? { code: source.code, numero: source.numero, titre: source.titre } : null,
        origine: fiche.origine,
        createdAt: fiche.createdAt,
        updatedAt: fiche.updatedAt,
      },
      suivis: suivis.map((suivi) => ({
        _id: suivi._id,
        nature: suivi.nature,
        texte: suivi.texte ?? null,
        avant: suivi.avant ?? null,
        apres: suivi.apres ?? null,
        auteur: noms.get(suivi.auteurId) ?? "—",
        at: suivi.at,
      })),
    }
  },
})

/** Personnel interne actif, pour désigner un responsable d'action. */
export const responsables = query({
  args: {},
  handler: async (ctx) => {
    await lecteurEtudes(ctx)
    const users = await agentsInternes(ctx)
    return users
      .map((user) => ({
        _id: user._id as Id<"users">,
        nom: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Agent SETRAG",
        role: user.role,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
  },
})
