import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, type MutationCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { isInternalRole, type AppRole } from "../../model/permissions"
import {
  normalizedFileName,
  normalizedMimeType,
  normalizedStoredSha256,
  validDocumentSize,
} from "../platform/documentModel"
import { appRoleValidator } from "../platform/validators"
import {
  documentVisible,
  droitsGed,
  exigerCreation,
  peutIntervenir,
  prochainRang,
  type DroitsGed,
} from "./acces"
import {
  anneeLibreville,
  conservationEchue,
  dateIso,
  estDirection,
  finConservation,
  jourLibreville,
  motsClesNormalises,
  numeroCourrier,
  referenceDocument,
  statutApresDecision,
  statutDocumentFinCircuit,
  texteFacultatif,
  texteLongRequis,
  texteRecherche,
  texteRequis,
  validerCircuit,
} from "./model"
import {
  gedClassificationValidator,
  gedNatureEtapeValidator,
  gedTypeDocumentValidator,
} from "./tables"

const fichierValidator = v.object({
  storageId: v.id("_storage"),
  nomFichier: v.string(),
  typeMime: v.string(),
  taille: v.number(),
})

const accesValidator = v.object({
  userId: v.optional(v.id("users")),
  role: v.optional(appRoleValidator),
  droit: v.union(v.literal("lecture"), v.literal("edition")),
})

type FichierDemande = {
  storageId: Id<"_storage">
  nomFichier: string
  typeMime: string
  taille: number
}

/**
 * Vérifie le fichier réellement stocké : taille, type, empreinte, et qu'il
 * n'est pas déjà rattaché à une autre version.
 */
async function verifierFichier(ctx: MutationCtx, fichier: FichierDemande) {
  const nomFichier = normalizedFileName(fichier.nomFichier)
  const typeMime = normalizedMimeType(fichier.typeMime)
  const taille = validDocumentSize(fichier.taille)
  const meta = await ctx.db.system.get("_storage", fichier.storageId)
  if (!meta) throw new Error("Le fichier téléversé est introuvable : recommencez le dépôt.")
  if (meta.size !== taille) {
    throw new Error("La taille déclarée ne correspond pas au fichier téléversé.")
  }
  const typeStocke = meta.contentType?.split(";")[0]?.trim().toLowerCase()
  if (typeStocke && typeStocke !== typeMime) {
    throw new Error("Le type du fichier téléversé ne correspond pas au type déclaré.")
  }
  const dejaRattache = await ctx.db
    .query("gedVersions")
    .withIndex("by_storage", (q) => q.eq("storageId", fichier.storageId))
    .first()
  if (dejaRattache) throw new Error("Ce fichier est déjà rattaché à une version.")
  return {
    storageId: fichier.storageId,
    nomFichier,
    typeMime,
    taille,
    sha256: normalizedStoredSha256(meta.sha256),
  }
}

async function classementActif(ctx: MutationCtx, classementId: Id<"gedClassement">) {
  const classement = await ctx.db.get(classementId)
  if (!classement || !classement.actif) {
    throw new Error("Série du plan de classement introuvable ou inactive.")
  }
  return classement
}

async function verifierAcces(
  ctx: MutationCtx,
  entrees: readonly { userId?: Id<"users">; role?: AppRole; droit: "lecture" | "edition" }[]
) {
  if (entrees.length > 50) throw new Error("Cinquante accès au plus par document.")
  const vus = new Set<string>()
  for (const entree of entrees) {
    if ((entree.userId === undefined) === (entree.role === undefined)) {
      throw new Error("Un accès désigne soit une personne, soit une fonction.")
    }
    const cle = entree.userId ?? `role:${entree.role}`
    if (vus.has(cle)) throw new Error("Un même bénéficiaire ne figure qu'une fois.")
    vus.add(cle)
    if (entree.userId) {
      const user = await ctx.db.get(entree.userId)
      if (!user || !(await peutIntervenir(ctx, user))) {
        throw new Error("Un bénéficiaire n'a pas accès au module GED.")
      }
    }
    if (entree.role && !isInternalRole(entree.role)) {
      throw new Error("Seules les fonctions internes peuvent recevoir un accès.")
    }
  }
}

function texteDeRecherche(
  piece: Pick<
    Doc<"gedDocuments">,
    "reference" | "titre" | "description" | "motsCles" | "correspondant" | "direction"
  >,
  classement: Pick<Doc<"gedClassement">, "code" | "libelle">
) {
  return texteRecherche([
    piece.reference,
    piece.titre,
    piece.description,
    piece.motsCles.join(" "),
    piece.correspondant,
    piece.direction,
    classement.code,
    classement.libelle,
  ])
}

/** URL de téléversement : seuls les comptes qui peuvent déposer l'obtiennent. */
export const genererUrlTeleversement = mutation({
  args: {},
  handler: async (ctx) => {
    await exigerCreation(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

/** Enregistre une pièce, avec ou sans fichier, dans le plan de classement. */
export const deposerDocument = mutation({
  args: {
    titre: v.string(),
    description: v.optional(v.string()),
    type: gedTypeDocumentValidator,
    classementId: v.id("gedClassement"),
    motsCles: v.array(v.string()),
    classification: gedClassificationValidator,
    dateDocument: v.string(),
    correspondant: v.optional(v.string()),
    fichier: v.optional(fichierValidator),
    acces: v.optional(v.array(accesValidator)),
  },
  handler: async (ctx, args) => {
    const droits = await exigerCreation(ctx)
    const classement = await classementActif(ctx, args.classementId)
    const titre = texteRequis(args.titre, "Le titre", 200, 3)
    const description = texteFacultatif(args.description, "La description", 2_000)
    const motsCles = motsClesNormalises(args.motsCles)
    const dateDocument = dateIso(args.dateDocument, "La date du document")
    const correspondant = texteFacultatif(args.correspondant, "Le correspondant", 200)
    const acces = args.acces ?? []
    await verifierAcces(ctx, acces)
    const fichier = args.fichier ? await verifierFichier(ctx, args.fichier) : null

    const now = Date.now()
    const annee = anneeLibreville(now)
    const reference = referenceDocument(annee, await prochainRang(ctx, `document-${annee}`))
    const conservationJusquau = finConservation(dateDocument, classement.conservationAnnees)
    const piece = {
      reference,
      titre,
      description,
      motsCles,
      correspondant,
      direction: classement.direction,
    }
    const documentId = await ctx.db.insert("gedDocuments", {
      ...piece,
      type: args.type,
      classementId: classement._id,
      classification: args.classification,
      statut: "brouillon",
      dateDocument,
      versionCourante: fichier ? 1 : 0,
      auteurId: droits.user._id,
      ...(conservationJusquau ? { conservationJusquau } : {}),
      texteRecherche: texteDeRecherche(piece, classement),
      origine: "reel",
      createdAt: now,
      updatedAt: now,
    })
    if (fichier) {
      await ctx.db.insert("gedVersions", {
        documentId,
        numero: 1,
        ...fichier,
        deposePar: droits.user._id,
        deposeLe: now,
      })
    }
    for (const entree of acces) {
      await ctx.db.insert("gedAcces", {
        documentId,
        ...entree,
        accordePar: droits.user._id,
        accordeLe: now,
      })
    }
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.deposer",
      entityTable: "gedDocuments",
      entityId: documentId,
      permission: "creer",
      classification: args.classification,
      after: { reference, titre, type: args.type, classement: classement.code },
      metadata: fichier
        ? { nomFichier: fichier.nomFichier, taille: fichier.taille, sha256: fichier.sha256 }
        : { sansFichier: true },
    })
    return { documentId, reference }
  },
})

async function documentModifiable(ctx: MutationCtx, droits: DroitsGed, documentId: Id<"gedDocuments">) {
  const contexte = await documentVisible(ctx, droits, documentId)
  if (!contexte.modifiable) {
    throw new Error(
      contexte.document.statut === "brouillon" || contexte.document.statut === "refuse"
        ? "Accès refusé : seuls l'auteur et les éditeurs désignés modifient cette pièce."
        : "Une pièce en circuit, validée ou archivée n'est plus modifiable."
    )
  }
  return contexte.document
}

export const modifierMetadonnees = mutation({
  args: {
    documentId: v.id("gedDocuments"),
    titre: v.string(),
    description: v.optional(v.string()),
    type: gedTypeDocumentValidator,
    classementId: v.id("gedClassement"),
    motsCles: v.array(v.string()),
    classification: gedClassificationValidator,
    dateDocument: v.string(),
    correspondant: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const droits = await exigerCreation(ctx)
    const avant = await documentModifiable(ctx, droits, args.documentId)
    const classement = await classementActif(ctx, args.classementId)
    const dateDocument = dateIso(args.dateDocument, "La date du document")
    const piece = {
      reference: avant.reference,
      titre: texteRequis(args.titre, "Le titre", 200, 3),
      description: texteFacultatif(args.description, "La description", 2_000),
      motsCles: motsClesNormalises(args.motsCles),
      correspondant: texteFacultatif(args.correspondant, "Le correspondant", 200),
      direction: classement.direction,
    }
    const conservationJusquau = finConservation(dateDocument, classement.conservationAnnees)
    await ctx.db.patch(avant._id, {
      ...piece,
      type: args.type,
      classementId: classement._id,
      classification: args.classification,
      dateDocument,
      conservationJusquau: conservationJusquau ?? undefined,
      texteRecherche: texteDeRecherche(piece, classement),
      updatedAt: Date.now(),
    })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.modifier",
      entityTable: "gedDocuments",
      entityId: avant._id,
      permission: "modifier",
      classification: args.classification,
      before: { titre: avant.titre, type: avant.type, classification: avant.classification },
      after: { titre: piece.titre, type: args.type, classification: args.classification },
    })
    return { documentId: avant._id }
  },
})

/** Nouvelle version : la précédente reste consultable, rien n'est écrasé. */
export const ajouterVersion = mutation({
  args: {
    documentId: v.id("gedDocuments"),
    fichier: fichierValidator,
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const droits = await exigerCreation(ctx)
    const piece = await documentModifiable(ctx, droits, args.documentId)
    const fichier = await verifierFichier(ctx, args.fichier)
    const commentaire = texteFacultatif(args.commentaire, "Le commentaire de version", 500)
    const numero = piece.versionCourante + 1
    const now = Date.now()
    await ctx.db.insert("gedVersions", {
      documentId: piece._id,
      numero,
      ...fichier,
      commentaire,
      deposePar: droits.user._id,
      deposeLe: now,
    })
    await ctx.db.patch(piece._id, { versionCourante: numero, updatedAt: now })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.version",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "modifier",
      classification: piece.classification,
      before: { versionCourante: piece.versionCourante },
      after: { versionCourante: numero },
      metadata: { nomFichier: fichier.nomFichier, taille: fichier.taille, sha256: fichier.sha256 },
    })
    return { numero }
  },
})

/** Remplace la liste des accès explicites (auteur ou gestionnaire). */
export const definirAcces = mutation({
  args: { documentId: v.id("gedDocuments"), acces: v.array(accesValidator) },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { document: piece, acces: avant } = await documentVisible(ctx, droits, args.documentId)
    if (piece.auteurId !== droits.user._id && !droits.gestionnaire) {
      throw new Error("Accès refusé : seuls l'auteur et les gestionnaires documentaires gèrent les accès.")
    }
    if (piece.statut === "elimine") throw new Error("Une pièce éliminée n'a plus d'accès à gérer.")
    await verifierAcces(ctx, args.acces)
    for (const entree of avant) await ctx.db.delete(entree._id)
    const now = Date.now()
    for (const entree of args.acces) {
      await ctx.db.insert("gedAcces", {
        documentId: piece._id,
        ...entree,
        accordePar: droits.user._id,
        accordeLe: now,
      })
    }
    await ctx.db.patch(piece._id, { updatedAt: now })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.acces",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "modifier",
      classification: piece.classification,
      before: avant.map((entree) => ({ userId: entree.userId, role: entree.role, droit: entree.droit })),
      after: args.acces,
    })
    return { total: args.acces.length }
  },
})

/**
 * Ouvre un fichier (aperçu ou téléchargement) : contrôle les droits, inscrit
 * la consultation au journal et rend une URL signée de courte durée.
 */
export const ouvrirFichier = mutation({
  args: {
    documentId: v.id("gedDocuments"),
    versionNumero: v.optional(v.number()),
    nature: v.union(v.literal("apercu"), v.literal("telechargement")),
  },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { document: piece } = await documentVisible(ctx, droits, args.documentId)
    if (piece.statut === "elimine") {
      throw new Error("Cette pièce a été éliminée en fin de conservation : son fichier n'existe plus.")
    }
    const numero = args.versionNumero ?? piece.versionCourante
    if (numero < 1) throw new Error("Aucun fichier n'a été déposé pour cette pièce.")
    const version = await ctx.db
      .query("gedVersions")
      .withIndex("by_document_numero", (q) => q.eq("documentId", piece._id).eq("numero", numero))
      .unique()
    if (!version) throw new Error("Version introuvable.")
    const url = await ctx.storage.getUrl(version.storageId)
    if (!url) throw new Error("Le fichier n'est plus disponible dans le stockage.")
    await ctx.db.insert("gedConsultations", {
      documentId: piece._id,
      userId: droits.user._id,
      nature: args.nature,
      versionNumero: numero,
      at: Date.now(),
    })
    if (piece.classification === "confidentiel" || piece.classification === "restreint") {
      await audit(ctx, {
        actorId: droits.user._id,
        action: `ged.document.${args.nature}`,
        entityTable: "gedDocuments",
        entityId: piece._id,
        permission: "consulter",
        classification: piece.classification,
        metadata: { versionNumero: numero },
      })
    }
    return { url, nomFichier: version.nomFichier, typeMime: version.typeMime }
  },
})

const INTERVALLE_FICHE_MS = 10 * 60 * 1000

/** Inscrit l'ouverture d'une fiche au journal (une fois par 10 minutes). */
export const journaliserConsultation = mutation({
  args: { documentId: v.id("gedDocuments") },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { document: piece } = await documentVisible(ctx, droits, args.documentId)
    const now = Date.now()
    const derniere = await ctx.db
      .query("gedConsultations")
      .withIndex("by_user_document_at", (q) =>
        q.eq("userId", droits.user._id).eq("documentId", piece._id).gte("at", now - INTERVALLE_FICHE_MS)
      )
      .first()
    if (derniere) return { inscrit: false }
    await ctx.db.insert("gedConsultations", {
      documentId: piece._id,
      userId: droits.user._id,
      nature: "fiche",
      at: now,
    })
    return { inscrit: true }
  },
})

/** Lance le circuit : visas, signature, diffusion, dans cet ordre. */
export const soumettreCircuit = mutation({
  args: {
    documentId: v.id("gedDocuments"),
    etapes: v.array(
      v.object({
        nature: gedNatureEtapeValidator,
        libelle: v.string(),
        assigneId: v.id("users"),
      })
    ),
  },
  handler: async (ctx, args) => {
    const droits = await exigerCreation(ctx)
    const piece = await documentModifiable(ctx, droits, args.documentId)
    if (piece.versionCourante < 1) {
      throw new Error("Déposez un fichier avant de lancer le circuit : on ne vise pas une fiche vide.")
    }
    const enCours = await ctx.db
      .query("gedCircuits")
      .withIndex("by_document", (q) => q.eq("documentId", piece._id))
      .filter((q) => q.eq(q.field("statut"), "en_cours"))
      .first()
    if (enCours) throw new Error("Un circuit est déjà en cours pour cette pièce.")
    const etapes = args.etapes.map((etape) => ({
      ...etape,
      libelle: texteRequis(etape.libelle, "Le libellé de l'étape", 120, 2),
    }))
    validerCircuit(etapes)
    for (const etape of etapes) {
      const user = await ctx.db.get(etape.assigneId)
      if (!user || !(await peutIntervenir(ctx, user))) {
        throw new Error(`L'intervenant de l'étape « ${etape.libelle} » n'a pas accès au module GED.`)
      }
      if (etape.nature === "signature" && etape.assigneId === piece.auteurId) {
        throw new Error("Séparation des tâches : l'auteur de la pièce ne peut pas la signer.")
      }
    }
    const now = Date.now()
    const circuitId = await ctx.db.insert("gedCircuits", {
      documentId: piece._id,
      statut: "en_cours",
      etapeCourante: 1,
      totalEtapes: etapes.length,
      initiePar: droits.user._id,
      initieLe: now,
      origine: "reel",
    })
    for (const [index, etape] of etapes.entries()) {
      await ctx.db.insert("gedEtapes", {
        circuitId,
        documentId: piece._id,
        rang: index + 1,
        nature: etape.nature,
        libelle: etape.libelle,
        assigneId: etape.assigneId,
        statut: index === 0 ? "en_attente" : "a_venir",
        ...(index === 0 ? { ouverteLe: now } : {}),
      })
    }
    await ctx.db.patch(piece._id, { statut: "en_circuit", updatedAt: now })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.circuit.soumettre",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "creer",
      classification: piece.classification,
      before: { statut: piece.statut },
      after: { statut: "en_circuit", circuitId, etapes: etapes.map((etape) => etape.nature) },
    })
    return { circuitId }
  },
})

async function etapeEnAttenteAMoi(ctx: MutationCtx, droits: DroitsGed, etapeId: Id<"gedEtapes">) {
  const etape = await ctx.db.get(etapeId)
  if (!etape) throw new Error("Étape introuvable.")
  const circuit = await ctx.db.get(etape.circuitId)
  if (!circuit || circuit.statut !== "en_cours") {
    throw new Error("Ce circuit n'est plus en cours.")
  }
  if (etape.statut !== "en_attente") throw new Error("Cette étape n'attend plus de décision.")
  if (etape.assigneId !== droits.user._id) {
    throw new Error("Accès refusé : seul l'intervenant désigné décide de cette étape.")
  }
  const piece = await ctx.db.get(etape.documentId)
  if (!piece) throw new Error("Document introuvable.")
  return { etape, circuit, piece }
}

async function poursuivreCircuit(
  ctx: MutationCtx,
  circuit: Doc<"gedCircuits">,
  etape: Doc<"gedEtapes">,
  piece: Doc<"gedDocuments">,
  now: number
): Promise<"en_cours" | "termine"> {
  const suivante = await ctx.db
    .query("gedEtapes")
    .withIndex("by_circuit_rang", (q) => q.eq("circuitId", circuit._id).eq("rang", etape.rang + 1))
    .unique()
  if (suivante) {
    await ctx.db.patch(suivante._id, { statut: "en_attente", ouverteLe: now })
    await ctx.db.patch(circuit._id, { etapeCourante: suivante.rang })
    await ctx.db.patch(piece._id, { updatedAt: now })
    return "en_cours"
  }
  await ctx.db.patch(circuit._id, { statut: "termine", termineLe: now })
  await ctx.db.patch(piece._id, { statut: statutDocumentFinCircuit(etape.nature), updatedAt: now })
  return "termine"
}

/** Viser, signer ou refuser l'étape qui m'attend. Un refus porte toujours son motif. */
export const deciderEtape = mutation({
  args: {
    etapeId: v.id("gedEtapes"),
    decision: v.union(v.literal("viser"), v.literal("signer"), v.literal("refuser")),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { etape, circuit, piece } = await etapeEnAttenteAMoi(ctx, droits, args.etapeId)
    const statut = statutApresDecision(etape.nature, args.decision)
    const commentaire =
      statut === "refuse"
        ? texteLongRequis(args.commentaire ?? "", "Le motif du refus", 1_000, 5)
        : texteFacultatif(args.commentaire, "Le commentaire", 1_000)
    const now = Date.now()
    await ctx.db.patch(etape._id, { statut, commentaire, decideLe: now })
    let etatCircuit: "en_cours" | "termine" | "refuse"
    if (statut === "refuse") {
      const restantes = await ctx.db
        .query("gedEtapes")
        .withIndex("by_circuit_rang", (q) => q.eq("circuitId", circuit._id).gt("rang", etape.rang))
        .collect()
      for (const restante of restantes) await ctx.db.patch(restante._id, { statut: "annule" })
      await ctx.db.patch(circuit._id, { statut: "refuse", termineLe: now, motifCloture: commentaire })
      await ctx.db.patch(piece._id, { statut: "refuse", updatedAt: now })
      etatCircuit = "refuse"
    } else {
      etatCircuit = await poursuivreCircuit(ctx, circuit, etape, piece, now)
    }
    await audit(ctx, {
      actorId: droits.user._id,
      action: `ged.circuit.${args.decision}`,
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: args.decision === "signer" ? "valider" : "consulter",
      classification: piece.classification,
      reason: commentaire,
      before: { etape: etape.rang, statut: "en_attente" },
      after: { etape: etape.rang, statut, circuit: etatCircuit },
      metadata: { circuitId: circuit._id, etapeId: etape._id },
    })
    return { statut, circuit: etatCircuit }
  },
})

/** Dernière étape : diffuser la pièce à son audience (ou l'expédier). */
export const diffuser = mutation({
  args: {
    etapeId: v.id("gedEtapes"),
    tousLesAgents: v.boolean(),
    roles: v.array(appRoleValidator),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { etape, circuit, piece } = await etapeEnAttenteAMoi(ctx, droits, args.etapeId)
    statutApresDecision(etape.nature, "diffuser")
    const roles = [...new Set(args.roles)]
    if (roles.some((role) => !isInternalRole(role))) {
      throw new Error("Une note ne se diffuse qu'au personnel interne.")
    }
    if (piece.type === "note_service" && !args.tousLesAgents && roles.length === 0) {
      throw new Error("Choisissez l'audience de la note : tout le personnel ou des fonctions.")
    }
    const commentaire = texteFacultatif(args.commentaire, "Le commentaire de diffusion", 500)
    const now = Date.now()
    await ctx.db.patch(etape._id, { statut: "diffuse", commentaire, decideLe: now })
    await ctx.db.patch(piece._id, {
      diffusion: {
        tousLesAgents: args.tousLesAgents,
        roles: args.tousLesAgents ? [] : roles,
        diffuseLe: now,
        diffusePar: droits.user._id,
        ...(commentaire ? { commentaire } : {}),
      },
    })
    const etat = await poursuivreCircuit(ctx, circuit, etape, piece, now)
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.circuit.diffuser",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "consulter",
      classification: piece.classification,
      after: { tousLesAgents: args.tousLesAgents, roles, circuit: etat },
      metadata: { circuitId: circuit._id, etapeId: etape._id },
    })
    return { circuit: etat }
  },
})

export const annulerCircuit = mutation({
  args: { circuitId: v.id("gedCircuits"), motif: v.string() },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const circuit = await ctx.db.get(args.circuitId)
    if (!circuit) throw new Error("Circuit introuvable.")
    if (circuit.statut !== "en_cours") throw new Error("Ce circuit n'est plus en cours.")
    if (circuit.initiePar !== droits.user._id && !droits.gestionnaire) {
      throw new Error("Accès refusé : seuls l'initiateur et les gestionnaires annulent un circuit.")
    }
    const motif = texteLongRequis(args.motif, "Le motif d'annulation", 500, 5)
    const piece = await ctx.db.get(circuit.documentId)
    if (!piece) throw new Error("Document introuvable.")
    const now = Date.now()
    const etapes = await ctx.db
      .query("gedEtapes")
      .withIndex("by_circuit_rang", (q) => q.eq("circuitId", circuit._id))
      .collect()
    for (const etape of etapes) {
      if (etape.statut === "en_attente" || etape.statut === "a_venir") {
        await ctx.db.patch(etape._id, { statut: "annule" })
      }
    }
    await ctx.db.patch(circuit._id, { statut: "annule", termineLe: now, motifCloture: motif })
    await ctx.db.patch(piece._id, { statut: "brouillon", updatedAt: now })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.circuit.annuler",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "modifier",
      classification: piece.classification,
      reason: motif,
      before: { statut: "en_circuit" },
      after: { statut: "brouillon" },
      metadata: { circuitId: circuit._id },
    })
    return { annule: true }
  },
})

/** Accusé de lecture d'une note diffusée : une fois par personne. */
export const accuserLecture = mutation({
  args: { documentId: v.id("gedDocuments") },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { document: piece } = await documentVisible(ctx, droits, args.documentId)
    if (!piece.diffusion || piece.statut !== "diffuse") {
      throw new Error("Cette pièce n'a pas été diffusée.")
    }
    if (!piece.diffusion.tousLesAgents && !piece.diffusion.roles.includes(droits.user.role)) {
      throw new Error("Cette note ne vous est pas adressée.")
    }
    const existant = await ctx.db
      .query("gedAccuses")
      .withIndex("by_user_document", (q) => q.eq("userId", droits.user._id).eq("documentId", piece._id))
      .unique()
    if (existant) return { luLe: existant.luLe, deja: true }
    const now = Date.now()
    await ctx.db.insert("gedAccuses", { documentId: piece._id, userId: droits.user._id, luLe: now })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.note.accuser_lecture",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "consulter",
      classification: piece.classification,
    })
    return { luLe: now, deja: false }
  },
})

/** Versement aux archives : la pièce devient immuable jusqu'à la fin de sa conservation. */
export const archiverDocument = mutation({
  args: { documentId: v.id("gedDocuments"), motif: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { document: piece } = await documentVisible(ctx, droits, args.documentId)
    if (!(droits.gestionnaire || (piece.auteurId === droits.user._id && droits.peutGerer))) {
      throw new Error("Accès refusé : l'archivage revient à l'auteur habilité ou au gestionnaire documentaire.")
    }
    if (piece.statut !== "valide" && piece.statut !== "diffuse") {
      throw new Error("Seule une pièce validée ou diffusée s'archive.")
    }
    const classement = await ctx.db.get(piece.classementId)
    const motif = texteFacultatif(args.motif, "Le motif", 500)
    const now = Date.now()
    const conservationJusquau = classement
      ? finConservation(piece.dateDocument, classement.conservationAnnees)
      : (piece.conservationJusquau ?? null)
    await ctx.db.patch(piece._id, {
      statut: "archive",
      archiveLe: now,
      archivePar: droits.user._id,
      motifArchivage: motif,
      conservationJusquau: conservationJusquau ?? undefined,
      updatedAt: now,
    })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.archiver",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "modifier",
      classification: piece.classification,
      reason: motif,
      before: { statut: piece.statut },
      after: { statut: "archive", conservationJusquau },
    })
    return { conservationJusquau }
  },
})

/**
 * Élimination en fin de conservation : les fichiers sont détruits, la fiche
 * et les empreintes restent comme preuve de l'élimination.
 */
export const eliminerDocument = mutation({
  args: { documentId: v.id("gedDocuments"), motif: v.string() },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    if (!droits.peutEliminer) {
      throw new Error("Accès refusé : l'élimination exige le droit de suppression GED.")
    }
    const { document: piece } = await documentVisible(ctx, droits, args.documentId)
    if (piece.statut !== "archive") throw new Error("Seule une pièce archivée s'élimine.")
    if (!conservationEchue(piece.conservationJusquau, jourLibreville(Date.now()))) {
      throw new Error("La durée légale de conservation n'est pas échue : élimination impossible.")
    }
    const motif = texteLongRequis(args.motif, "Le motif d'élimination", 500, 5)
    const versions = await ctx.db
      .query("gedVersions")
      .withIndex("by_document_numero", (q) => q.eq("documentId", piece._id))
      .collect()
    for (const version of versions) {
      const meta = await ctx.db.system.get("_storage", version.storageId)
      if (meta) await ctx.storage.delete(version.storageId)
    }
    const now = Date.now()
    await ctx.db.patch(piece._id, {
      statut: "elimine",
      elimineLe: now,
      eliminePar: droits.user._id,
      motifElimination: motif,
      updatedAt: now,
    })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.eliminer",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "supprimer",
      classification: piece.classification,
      reason: motif,
      before: { statut: "archive", versions: versions.length },
      after: { statut: "elimine" },
      metadata: { empreintes: versions.map((version) => version.sha256) },
    })
    return { fichiersDetruits: versions.length }
  },
})

export const commenter = mutation({
  args: { documentId: v.id("gedDocuments"), texte: v.string() },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const { document: piece } = await documentVisible(ctx, droits, args.documentId)
    if (piece.statut === "elimine") throw new Error("Une pièce éliminée ne se commente plus.")
    const texte = texteLongRequis(args.texte, "Le commentaire", 2_000, 2)
    const now = Date.now()
    const commentaireId = await ctx.db.insert("gedCommentaires", {
      documentId: piece._id,
      auteurId: droits.user._id,
      texte,
      createdAt: now,
    })
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.document.commenter",
      entityTable: "gedDocuments",
      entityId: piece._id,
      permission: "consulter",
      classification: piece.classification,
      metadata: { commentaireId },
    })
    return { commentaireId }
  },
})

/* ═══════════════════════════════════════════════ Courrier ═══ */

/** Enregistre un courrier : le numéro chronologique est attribué dans la transaction. */
export const enregistrerCourrier = mutation({
  args: {
    sens: v.union(v.literal("arrivee"), v.literal("depart")),
    dateCourrier: v.string(),
    correspondant: v.string(),
    objet: v.string(),
    referenceExterne: v.optional(v.string()),
    directionAffectee: v.string(),
    priorite: v.union(v.literal("normale"), v.literal("urgente")),
    echeanceReponse: v.optional(v.string()),
    documentId: v.optional(v.id("gedDocuments")),
    reponseACourrierId: v.optional(v.id("gedCourriers")),
  },
  handler: async (ctx, args) => {
    const droits = await exigerCreation(ctx)
    const dateCourrier = dateIso(args.dateCourrier, "La date du courrier")
    const correspondant = texteRequis(args.correspondant, "Le correspondant", 200, 2)
    const objet = texteRequis(args.objet, "L'objet", 300, 3)
    const referenceExterne = texteFacultatif(args.referenceExterne, "La référence externe", 80)
    if (!estDirection(args.directionAffectee)) throw new Error("Direction inconnue.")
    const echeanceReponse = args.echeanceReponse
      ? dateIso(args.echeanceReponse, "L'échéance de réponse")
      : undefined
    if (echeanceReponse && echeanceReponse < dateCourrier) {
      throw new Error("L'échéance de réponse précède la date du courrier.")
    }
    if (args.documentId) await documentVisible(ctx, droits, args.documentId)
    const origineCourrier = args.reponseACourrierId ? await ctx.db.get(args.reponseACourrierId) : null
    if (args.reponseACourrierId && (!origineCourrier || origineCourrier.sens !== "arrivee")) {
      throw new Error("Une réponse se rattache à un courrier arrivé.")
    }
    if (origineCourrier && args.sens !== "depart") {
      throw new Error("Une réponse est un courrier départ.")
    }
    const now = Date.now()
    const annee = anneeLibreville(now)
    const rang = await prochainRang(ctx, `courrier-${args.sens}-${annee}`)
    const numero = numeroCourrier(args.sens, annee, rang)
    const courrierId = await ctx.db.insert("gedCourriers", {
      numero,
      annee,
      rang,
      sens: args.sens,
      dateCourrier,
      enregistreLe: now,
      correspondant,
      objet,
      referenceExterne,
      directionAffectee: args.directionAffectee,
      priorite: args.priorite,
      echeanceReponse,
      statut: args.sens === "depart" ? "clos" : "enregistre",
      documentId: args.documentId,
      enregistrePar: droits.user._id,
      texteRecherche: texteRecherche([numero, correspondant, objet, referenceExterne, args.directionAffectee]),
      origine: "reel",
      updatedAt: now,
    })
    if (origineCourrier) {
      await ctx.db.patch(origineCourrier._id, {
        statut: "repondu",
        reponseCourrierId: courrierId,
        traitePar: droits.user._id,
        updatedAt: now,
      })
      await audit(ctx, {
        actorId: droits.user._id,
        action: "ged.courrier.repondre",
        entityTable: "gedCourriers",
        entityId: origineCourrier._id,
        permission: "modifier",
        reason: `Réponse ${numero}`,
        before: { statut: origineCourrier.statut },
        after: { statut: "repondu", reponse: numero },
      })
    }
    await audit(ctx, {
      actorId: droits.user._id,
      action: "ged.courrier.enregistrer",
      entityTable: "gedCourriers",
      entityId: courrierId,
      permission: "creer",
      after: { numero, sens: args.sens, objet, correspondant },
    })
    return { courrierId, numero }
  },
})

export const mettreAJourCourrier = mutation({
  args: {
    courrierId: v.id("gedCourriers"),
    statut: v.union(
      v.literal("enregistre"),
      v.literal("en_traitement"),
      v.literal("repondu"),
      v.literal("clos")
    ),
    directionAffectee: v.optional(v.string()),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    if (!droits.peutGerer) {
      throw new Error("Accès refusé : la mise à jour du registre exige le droit de modification GED.")
    }
    const courrier = await ctx.db.get(args.courrierId)
    if (!courrier) throw new Error("Courrier introuvable.")
    if (courrier.statut === "clos" && args.statut !== "clos") {
      throw new Error("Un courrier clos ne se rouvre pas : enregistrez un nouveau courrier.")
    }
    const commentaire = texteFacultatif(args.commentaire, "Le commentaire", 1_000)
    const direction = args.directionAffectee ?? courrier.directionAffectee
    if (!estDirection(direction)) throw new Error("Direction inconnue.")
    const now = Date.now()
    await ctx.db.patch(courrier._id, {
      statut: args.statut,
      directionAffectee: direction,
      commentaire: commentaire ?? courrier.commentaire,
      traitePar: droits.user._id,
      texteRecherche: texteRecherche([
        courrier.numero,
        courrier.correspondant,
        courrier.objet,
        courrier.referenceExterne,
        direction,
      ]),
      updatedAt: now,
    })
    await audit(ctx, {
      actorId: droits.user._id,
      action: direction !== courrier.directionAffectee ? "ged.courrier.affecter" : "ged.courrier.statut",
      entityTable: "gedCourriers",
      entityId: courrier._id,
      permission: "modifier",
      reason: commentaire,
      before: { statut: courrier.statut, direction: courrier.directionAffectee },
      after: { statut: args.statut, direction },
    })
    return { statut: args.statut }
  },
})
