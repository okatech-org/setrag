import { v } from "convex/values"

import { mutation } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { texteFacultatif, texteLongRequis } from "../ged/model"
import {
  etudeParCode,
  inscrireConstat,
  normaliserConstat,
  responsableValide,
  verifierAncre,
} from "./ecriture"
import { avancementPour, verifierTransition } from "./model"
import { lecteurEtudes } from "./outils"
import { etudesGraviteValidator, etudesStatutConstatValidator } from "./tables"

/** Annoter une étude ou une section : commentaire, question ou réserve. */
export const annoter = mutation({
  args: {
    code: v.string(),
    ancre: v.optional(v.string()),
    nature: v.union(v.literal("commentaire"), v.literal("question"), v.literal("reserve")),
    texte: v.string(),
  },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    const document = await etudeParCode(ctx, args.code)
    const ancre = verifierAncre(document, args.ancre)
    const texte = texteLongRequis(args.texte, "L'annotation", 2_000, 3)
    const annotationId = await ctx.db.insert("etudesAnnotations", {
      documentId: document._id,
      ancre,
      auteurId: lecteur.user._id,
      nature: args.nature,
      texte,
      statut: "ouverte",
      origine: "reel",
      createdAt: Date.now(),
    })
    await audit(ctx, {
      actorId: lecteur.user._id,
      action: "etudes.annotation.creer",
      entityTable: "etudesAnnotations",
      entityId: annotationId,
      classification: "interne",
      after: { etude: document.code, ancre, nature: args.nature },
    })
    return { annotationId }
  },
})

/** Un référent répond à l'annotation et la clôt. */
export const traiterAnnotation = mutation({
  args: { annotationId: v.id("etudesAnnotations"), reponse: v.string() },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    if (!lecteur.referent) {
      throw new Error("Accès refusé : seuls les référents des études traitent les annotations.")
    }
    const annotation = await ctx.db.get(args.annotationId)
    if (!annotation) throw new Error("Annotation introuvable.")
    if (annotation.statut === "traitee") throw new Error("Cette annotation est déjà traitée.")
    const reponse = texteLongRequis(args.reponse, "La réponse", 2_000, 2)
    const now = Date.now()
    await ctx.db.patch(annotation._id, {
      statut: "traitee",
      reponse,
      traitePar: lecteur.user._id,
      traiteLe: now,
    })
    await audit(ctx, {
      actorId: lecteur.user._id,
      action: "etudes.annotation.traiter",
      entityTable: "etudesAnnotations",
      entityId: annotation._id,
      classification: "interne",
      before: { statut: "ouverte" },
      after: { statut: "traitee" },
    })
    return { traiteLe: now }
  },
})

const champsConstat = {
  titre: v.string(),
  constat: v.string(),
  recommandation: v.string(),
  gravite: etudesGraviteValidator,
  direction: v.string(),
  responsableId: v.id("users"),
  echeance: v.string(),
}

/** Inscrit un constat au plan d'actions (fonctions d'audit). */
export const creerConstat = mutation({
  args: {
    ...champsConstat,
    code: v.optional(v.string()),
    ancre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    if (!lecteur.auditeur) {
      throw new Error("Accès refusé : le plan d'actions est tenu par la fonction audit et risques.")
    }
    return await inscrireConstat(ctx, lecteur.user._id, args)
  },
})

export const modifierConstat = mutation({
  args: { constatId: v.id("etudesConstats"), ...champsConstat },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    if (!lecteur.auditeur) {
      throw new Error("Accès refusé : le plan d'actions est tenu par la fonction audit et risques.")
    }
    const avant = await ctx.db.get(args.constatId)
    if (!avant) throw new Error("Constat introuvable.")
    if (avant.statut === "verifiee" || avant.statut === "abandonnee") {
      throw new Error("Une action close ne se modifie plus.")
    }
    const valeurs = normaliserConstat(args)
    await responsableValide(ctx, args.responsableId)
    const now = Date.now()
    await ctx.db.patch(avant._id, {
      ...valeurs,
      gravite: args.gravite,
      responsableId: args.responsableId,
      updatedAt: now,
    })
    const changements = [
      avant.echeance !== valeurs.echeance ? `échéance ${avant.echeance} → ${valeurs.echeance}` : null,
      avant.responsableId !== args.responsableId ? "responsable changé" : null,
      avant.gravite !== args.gravite ? `gravité ${avant.gravite} → ${args.gravite}` : null,
    ].filter(Boolean)
    await ctx.db.insert("etudesSuivis", {
      constatId: avant._id,
      auteurId: lecteur.user._id,
      nature: "modification",
      texte: changements.length ? changements.join(" ; ") : "Rédaction précisée.",
      at: now,
    })
    await audit(ctx, {
      actorId: lecteur.user._id,
      action: "etudes.constat.modifier",
      entityTable: "etudesConstats",
      entityId: avant._id,
      classification: "interne",
      before: { echeance: avant.echeance, responsableId: avant.responsableId, gravite: avant.gravite },
      after: { echeance: valeurs.echeance, responsableId: args.responsableId, gravite: args.gravite },
    })
    return { constatId: avant._id }
  },
})

/** Suivi : changer le statut, l'avancement, ou commenter. Tout est horodaté. */
export const suivreConstat = mutation({
  args: {
    constatId: v.id("etudesConstats"),
    statut: v.optional(etudesStatutConstatValidator),
    avancement: v.optional(v.number()),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lecteur = await lecteurEtudes(ctx)
    const fiche = await ctx.db.get(args.constatId)
    if (!fiche) throw new Error("Constat introuvable.")
    const responsable = fiche.responsableId === lecteur.user._id
    const statut = args.statut ?? fiche.statut
    verifierTransition(fiche.statut, statut, { auditeur: lecteur.auditeur, responsable })
    const commentaire = texteFacultatif(args.commentaire, "Le commentaire", 2_000)
    const reouverture = fiche.statut === "realisee" && statut === "en_cours"
    if ((statut === "abandonnee" || reouverture) && (!commentaire || commentaire.length < 5)) {
      throw new Error("Un abandon ou une réouverture se motive (5 caractères au moins).")
    }
    const avancement = avancementPour(statut, args.avancement, fiche.avancement)
    if (statut === fiche.statut && avancement === fiche.avancement && !commentaire) {
      throw new Error("Rien à enregistrer : changez le statut, l'avancement ou ajoutez un commentaire.")
    }
    if (
      statut === fiche.statut &&
      avancement !== fiche.avancement &&
      !responsable &&
      !lecteur.auditeur
    ) {
      throw new Error("Accès refusé : seul le responsable ou l'audit met à jour l'avancement.")
    }
    if (fiche.statut === "verifiee" || fiche.statut === "abandonnee") {
      if (statut !== fiche.statut || avancement !== fiche.avancement) {
        throw new Error("Une action vérifiée ou abandonnée est close.")
      }
    }
    const now = Date.now()
    await ctx.db.patch(fiche._id, { statut, avancement, updatedAt: now })
    if (statut !== fiche.statut) {
      await ctx.db.insert("etudesSuivis", {
        constatId: fiche._id,
        auteurId: lecteur.user._id,
        nature: "statut",
        avant: fiche.statut,
        apres: statut,
        texte: commentaire,
        at: now,
      })
    } else if (avancement !== fiche.avancement) {
      await ctx.db.insert("etudesSuivis", {
        constatId: fiche._id,
        auteurId: lecteur.user._id,
        nature: "avancement",
        avant: `${fiche.avancement} %`,
        apres: `${avancement} %`,
        texte: commentaire,
        at: now,
      })
    } else {
      await ctx.db.insert("etudesSuivis", {
        constatId: fiche._id,
        auteurId: lecteur.user._id,
        nature: "commentaire",
        texte: commentaire,
        at: now,
      })
    }
    await audit(ctx, {
      actorId: lecteur.user._id,
      action: "etudes.constat.suivre",
      entityTable: "etudesConstats",
      entityId: fiche._id,
      classification: "interne",
      reason: commentaire,
      before: { statut: fiche.statut, avancement: fiche.avancement },
      after: { statut, avancement },
    })
    return { statut, avancement }
  },
})
