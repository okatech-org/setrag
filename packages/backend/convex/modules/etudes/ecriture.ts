import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { isInternalRole } from "../../model/permissions"
import { anneeLibreville, dateIso, estDirection, texteLongRequis, texteRequis } from "../ged/model"
import { decouperSections, referenceConstat } from "./model"
import { prochainRang } from "./outils"

/** Écritures partagées du plan d'actions (mutations publiques et Copilot). */

export async function etudeParCode(ctx: MutationCtx, code: string) {
  const document = await ctx.db
    .query("etudesDocuments")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique()
  if (!document) throw new Error("Étude introuvable.")
  return document
}

export function verifierAncre(document: Doc<"etudesDocuments">, ancre: string | undefined) {
  if (ancre === undefined) return undefined
  if (!decouperSections(document.contenu).some((section) => section.ancre === ancre)) {
    throw new Error("Cette section n'existe pas dans l'étude.")
  }
  return ancre
}

export async function responsableValide(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId)
  if (!user || !user.isActive || !isInternalRole(user.role)) {
    throw new Error("Le responsable doit être un agent SETRAG actif.")
  }
  return user
}

export function normaliserConstat(args: {
  titre: string
  constat: string
  recommandation: string
  direction: string
  echeance: string
}) {
  if (!estDirection(args.direction)) throw new Error("Direction inconnue.")
  return {
    titre: texteRequis(args.titre, "Le titre", 160, 5),
    constat: texteLongRequis(args.constat, "Le constat", 3_000, 10),
    recommandation: texteLongRequis(args.recommandation, "La recommandation", 3_000, 10),
    direction: args.direction,
    echeance: dateIso(args.echeance, "L'échéance"),
  }
}

/**
 * Création d'un constat, partagée avec Copilot (après confirmation explicite
 * de l'utilisateur). L'appelant a déjà vérifié le droit.
 */
export async function inscrireConstat(
  ctx: MutationCtx,
  auteurId: Id<"users">,
  args: {
    titre: string
    constat: string
    recommandation: string
    gravite: "majeure" | "moderee" | "mineure"
    direction: string
    responsableId: Id<"users">
    echeance: string
    code?: string
    ancre?: string
  },
  provenance = "saisie"
) {
  const valeurs = normaliserConstat(args)
  await responsableValide(ctx, args.responsableId)
  const document = args.code ? await etudeParCode(ctx, args.code) : null
  const ancre = document ? verifierAncre(document, args.ancre) : undefined
  const now = Date.now()
  const annee = anneeLibreville(now)
  const reference = referenceConstat(annee, await prochainRang(ctx, `constat-${annee}`))
  const constatId = await ctx.db.insert("etudesConstats", {
    reference,
    ...valeurs,
    gravite: args.gravite,
    documentId: document?._id,
    ancre,
    responsableId: args.responsableId,
    statut: "a_lancer",
    avancement: 0,
    creePar: auteurId,
    origine: "reel",
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert("etudesSuivis", {
    constatId,
    auteurId,
    nature: "creation",
    texte: provenance === "copilot" ? "Constat proposé par Copilot et confirmé." : "Constat inscrit au plan d'actions.",
    at: now,
  })
  await audit(ctx, {
    actorId: auteurId,
    action: "etudes.constat.creer",
    entityTable: "etudesConstats",
    entityId: constatId,
    classification: "interne",
    after: { reference, gravite: args.gravite, echeance: valeurs.echeance, provenance },
  })
  return { constatId, reference }
}

