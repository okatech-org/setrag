import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import type { AppRole } from "../../model/permissions"
import {
  agentsInternes,
  contexteDocument,
  droitsGed,
  filtrerVisibles,
  nomsDe,
  peutIntervenir,
  type DroitsGed,
} from "./acces"
import {
  GED_DIRECTIONS,
  LIBELLES_STATUT_ETAPE,
  apercuPossible,
  conservationEchue,
  courrierEnRetard,
  jourLibreville,
  normaliser,
} from "./model"
import {
  gedStatutDocumentValidator,
  gedTypeDocumentValidator,
} from "./tables"

const LIMITE_LISTE = 1_000
const LIMITE_RECHERCHE = 200

/** Ce que l'interface peut proposer à l'appelant. */
export const mesDroits = query({
  args: {},
  handler: async (ctx) => {
    const droits = await droitsGed(ctx)
    return {
      userId: droits.user._id,
      role: droits.user.role,
      niveau: droits.niveau,
      peutCreer: droits.peutCreer,
      peutGerer: droits.peutGerer,
      gestionnaire: droits.gestionnaire,
      peutEliminer: droits.peutEliminer,
    }
  },
})

async function classementsParId(ctx: QueryCtx) {
  const classements = await ctx.db.query("gedClassement").collect()
  return new Map(classements.map((classement) => [classement._id as string, classement]))
}

function ligneDocument(
  document: Doc<"gedDocuments">,
  classements: Map<string, Doc<"gedClassement">>,
  noms: Map<string, string>,
  aujourdhui: string
) {
  const classement = classements.get(document.classementId)
  return {
    _id: document._id,
    reference: document.reference,
    titre: document.titre,
    type: document.type,
    direction: document.direction,
    classement: classement
      ? { code: classement.code, libelle: classement.libelle }
      : { code: "—", libelle: "Série supprimée" },
    classification: document.classification,
    statut: document.statut,
    dateDocument: document.dateDocument,
    versionCourante: document.versionCourante,
    auteur: noms.get(document.auteurId) ?? "—",
    motsCles: document.motsCles,
    correspondant: document.correspondant ?? null,
    conservationJusquau: document.conservationJusquau ?? null,
    conservationEchue: conservationEchue(document.conservationJusquau, aujourdhui),
    origine: document.origine,
    updatedAt: document.updatedAt,
  }
}

/** Pièces visibles, avec recherche plein texte sur les métadonnées. */
export const listerDocuments = query({
  args: {
    texte: v.optional(v.string()),
    type: v.optional(gedTypeDocumentValidator),
    statut: v.optional(gedStatutDocumentValidator),
    direction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const texte = args.texte ? normaliser(args.texte).trim().slice(0, 200) : ""
    let candidats: Doc<"gedDocuments">[]
    let limiteAtteinte = false
    if (texte) {
      candidats = await ctx.db
        .query("gedDocuments")
        .withSearchIndex("recherche", (q) => {
          let recherche = q.search("texteRecherche", texte)
          if (args.statut) recherche = recherche.eq("statut", args.statut)
          if (args.type) recherche = recherche.eq("type", args.type)
          if (args.direction) recherche = recherche.eq("direction", args.direction)
          return recherche
        })
        .take(LIMITE_RECHERCHE)
      limiteAtteinte = candidats.length === LIMITE_RECHERCHE
    } else {
      const lus = await ctx.db
        .query("gedDocuments")
        .withIndex("by_updated")
        .order("desc")
        .take(LIMITE_LISTE + 1)
      limiteAtteinte = lus.length > LIMITE_LISTE
      candidats = lus
        .slice(0, LIMITE_LISTE)
        .filter(
          (document) =>
            (!args.type || document.type === args.type) &&
            (!args.statut || document.statut === args.statut) &&
            (!args.direction || document.direction === args.direction)
        )
    }
    const visibles = await filtrerVisibles(ctx, droits, candidats)
    const [classements, noms] = await Promise.all([
      classementsParId(ctx),
      nomsDe(ctx, visibles.map((document) => document.auteurId)),
    ])
    const aujourdhui = jourLibreville(Date.now())
    return {
      lignes: visibles.map((document) => ligneDocument(document, classements, noms, aujourdhui)),
      limiteAtteinte,
      masques: candidats.length - visibles.length,
    }
  },
})

/** Destinataires d'une note : agents internes actifs qui lisent la GED. */
async function audienceNote(
  ctx: QueryCtx,
  diffusion: NonNullable<Doc<"gedDocuments">["diffusion"]>
): Promise<Doc<"users">[]> {
  const candidats = diffusion.tousLesAgents
    ? await agentsInternes(ctx)
    : (
        await Promise.all(
          diffusion.roles.map((role) =>
            ctx.db
              .query("users")
              .withIndex("by_role", (q) => q.eq("role", role))
              .collect()
          )
        )
      ).flat()
  const retenus: Doc<"users">[] = []
  for (const user of candidats) {
    if (await peutIntervenir(ctx, user)) retenus.push(user)
  }
  return retenus
}

function libelleAudience(diffusion: NonNullable<Doc<"gedDocuments">["diffusion"]>): string {
  if (diffusion.tousLesAgents) return "Tout le personnel"
  if (diffusion.roles.length === 0) return "Expédition externe"
  return `${diffusion.roles.length} fonction${diffusion.roles.length > 1 ? "s" : ""} visée${diffusion.roles.length > 1 ? "s" : ""}`
}

function estDestinataire(
  diffusion: NonNullable<Doc<"gedDocuments">["diffusion"]>,
  role: AppRole
): boolean {
  return diffusion.tousLesAgents || diffusion.roles.includes(role)
}

type Evenement = { cle: string; at: number; titre: string; detail?: string }

/** Dossier complet d'une pièce. */
export const document = query({
  args: { documentId: v.id("gedDocuments") },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const contexte = await contexteDocument(ctx, droits, args.documentId)
    if (!contexte) return { etat: "introuvable" as const }
    if (!contexte.visible) return { etat: "inaccessible" as const }
    const { document: piece, acces, etapes } = contexte
    const aujourdhui = jourLibreville(Date.now())

    const [classement, versions, circuits, commentaires, consultations, monAccuse] =
      await Promise.all([
        ctx.db.get(piece.classementId),
        ctx.db
          .query("gedVersions")
          .withIndex("by_document_numero", (q) => q.eq("documentId", piece._id))
          .order("desc")
          .collect(),
        ctx.db
          .query("gedCircuits")
          .withIndex("by_document", (q) => q.eq("documentId", piece._id))
          .order("desc")
          .collect(),
        ctx.db
          .query("gedCommentaires")
          .withIndex("by_document", (q) => q.eq("documentId", piece._id))
          .order("asc")
          .take(200),
        ctx.db
          .query("gedConsultations")
          .withIndex("by_document_at", (q) => q.eq("documentId", piece._id))
          .order("desc")
          .take(100),
        ctx.db
          .query("gedAccuses")
          .withIndex("by_user_document", (q) =>
            q.eq("userId", droits.user._id).eq("documentId", piece._id)
          )
          .unique(),
      ])

    const estAuteur = piece.auteurId === droits.user._id
    const superviseur = estAuteur || droits.gestionnaire

    let accuses: null | {
      audience: string
      destinataires: number
      lus: number
      liste: { nom: string; luLe: number }[] | null
    } = null
    if (piece.diffusion) {
      const [audience, lectures] = await Promise.all([
        audienceNote(ctx, piece.diffusion),
        ctx.db
          .query("gedAccuses")
          .withIndex("by_document", (q) => q.eq("documentId", piece._id))
          .collect(),
      ])
      const nomsLecteurs = superviseur
        ? await nomsDe(ctx, lectures.map((lecture) => lecture.userId))
        : null
      accuses = {
        audience: libelleAudience(piece.diffusion),
        destinataires: audience.length,
        lus: lectures.length,
        liste: nomsLecteurs
          ? lectures.map((lecture) => ({
              nom: nomsLecteurs.get(lecture.userId) ?? "—",
              luLe: lecture.luLe,
            }))
          : null,
      }
    }

    const noms = await nomsDe(ctx, [
      piece.auteurId,
      piece.archivePar,
      piece.eliminePar,
      piece.diffusion?.diffusePar,
      ...versions.map((version) => version.deposePar),
      ...circuits.map((circuit) => circuit.initiePar),
      ...etapes.map((etape) => etape.assigneId),
      ...commentaires.map((commentaire) => commentaire.auteurId),
      ...consultations.map((consultation) => consultation.userId),
      ...acces.map((entree) => entree.userId),
    ])
    const nom = (id: Id<"users"> | undefined) => (id ? (noms.get(id) ?? "—") : "—")

    const etapeAMoi = etapes.find(
      (etape) => etape.statut === "en_attente" && etape.assigneId === droits.user._id
    )
    const circuitEnCours = circuits.find((circuit) => circuit.statut === "en_cours")

    const evenements: Evenement[] = [
      {
        cle: "creation",
        at: piece.createdAt,
        titre: "Pièce enregistrée",
        detail: `${piece.reference} par ${nom(piece.auteurId)}`,
      },
      ...versions.map((version) => ({
        cle: `version-${version._id}`,
        at: version.deposeLe,
        titre: `Version ${version.numero} déposée`,
        detail: `${version.nomFichier} par ${nom(version.deposePar)}${version.commentaire ? ` — ${version.commentaire}` : ""}`,
      })),
      ...circuits.map((circuit) => ({
        cle: `circuit-${circuit._id}`,
        at: circuit.initieLe,
        titre: "Circuit de validation lancé",
        detail: `${circuit.totalEtapes} étape${circuit.totalEtapes > 1 ? "s" : ""}, par ${nom(circuit.initiePar)}`,
      })),
      ...etapes
        .filter((etape) => etape.decideLe !== undefined)
        .map((etape) => ({
          cle: `etape-${etape._id}`,
          at: etape.decideLe!,
          titre: `${etape.libelle} : ${LIBELLES_STATUT_ETAPE[etape.statut]}`,
          detail: `${nom(etape.assigneId)}${etape.commentaire ? ` — ${etape.commentaire}` : ""}`,
        })),
      ...circuits
        .filter((circuit) => circuit.statut === "annule" && circuit.termineLe)
        .map((circuit) => ({
          cle: `annulation-${circuit._id}`,
          at: circuit.termineLe!,
          titre: "Circuit annulé",
          detail: circuit.motifCloture,
        })),
      ...(piece.archiveLe
        ? [
            {
              cle: "archive",
              at: piece.archiveLe,
              titre: "Pièce archivée",
              detail: `${nom(piece.archivePar)}${piece.motifArchivage ? ` — ${piece.motifArchivage}` : ""}`,
            },
          ]
        : []),
      ...(piece.elimineLe
        ? [
            {
              cle: "elimination",
              at: piece.elimineLe,
              titre: "Pièce éliminée en fin de conservation",
              detail: `${nom(piece.eliminePar)}${piece.motifElimination ? ` — ${piece.motifElimination}` : ""}`,
            },
          ]
        : []),
    ].sort((a, b) => b.at - a.at)

    return {
      etat: "ok" as const,
      document: {
        _id: piece._id,
        reference: piece.reference,
        titre: piece.titre,
        description: piece.description ?? null,
        type: piece.type,
        direction: piece.direction,
        directionLibelle:
          GED_DIRECTIONS[piece.direction as keyof typeof GED_DIRECTIONS] ?? piece.direction,
        motsCles: piece.motsCles,
        classification: piece.classification,
        statut: piece.statut,
        dateDocument: piece.dateDocument,
        versionCourante: piece.versionCourante,
        correspondant: piece.correspondant ?? null,
        auteur: nom(piece.auteurId),
        auteurId: piece.auteurId,
        origine: piece.origine,
        createdAt: piece.createdAt,
        updatedAt: piece.updatedAt,
        diffusion: piece.diffusion
          ? {
              tousLesAgents: piece.diffusion.tousLesAgents,
              roles: piece.diffusion.roles,
              diffuseLe: piece.diffusion.diffuseLe,
              diffusePar: nom(piece.diffusion.diffusePar),
              commentaire: piece.diffusion.commentaire ?? null,
            }
          : null,
      },
      classement: classement
        ? {
            _id: classement._id,
            code: classement.code,
            libelle: classement.libelle,
            processus: classement.processus,
            conservationAnnees: classement.conservationAnnees,
            baseConservation: classement.baseConservation,
            aValider: classement.aValider,
            sortFinal: classement.sortFinal,
          }
        : null,
      conservation: {
        jusquau: piece.conservationJusquau ?? null,
        echue: conservationEchue(piece.conservationJusquau, aujourdhui),
      },
      versions: versions.map((version) => ({
        numero: version.numero,
        nomFichier: version.nomFichier,
        typeMime: version.typeMime,
        taille: version.taille,
        sha256: version.sha256,
        commentaire: version.commentaire ?? null,
        deposePar: nom(version.deposePar),
        deposeLe: version.deposeLe,
        apercu: apercuPossible(version.typeMime),
      })),
      circuits: circuits.map((circuit) => ({
        _id: circuit._id,
        statut: circuit.statut,
        etapeCourante: circuit.etapeCourante,
        totalEtapes: circuit.totalEtapes,
        initiePar: nom(circuit.initiePar),
        initieLe: circuit.initieLe,
        termineLe: circuit.termineLe ?? null,
        motifCloture: circuit.motifCloture ?? null,
        etapes: etapes
          .filter((etape) => etape.circuitId === circuit._id)
          .sort((a, b) => a.rang - b.rang)
          .map((etape) => ({
            _id: etape._id,
            rang: etape.rang,
            nature: etape.nature,
            libelle: etape.libelle,
            assigne: nom(etape.assigneId),
            assigneId: etape.assigneId,
            statut: etape.statut,
            commentaire: etape.commentaire ?? null,
            ouverteLe: etape.ouverteLe ?? null,
            decideLe: etape.decideLe ?? null,
          })),
      })),
      acces: superviseur
        ? acces.map((entree) => ({
            _id: entree._id,
            userId: entree.userId ?? null,
            nom: entree.userId ? nom(entree.userId) : null,
            role: entree.role ?? null,
            droit: entree.droit,
          }))
        : null,
      commentaires: commentaires.map((commentaire) => ({
        _id: commentaire._id,
        auteur: nom(commentaire.auteurId),
        texte: commentaire.texte,
        createdAt: commentaire.createdAt,
      })),
      consultations: superviseur
        ? consultations.map((consultation) => ({
            _id: consultation._id,
            nom: nom(consultation.userId),
            nature: consultation.nature,
            versionNumero: consultation.versionNumero ?? null,
            at: consultation.at,
          }))
        : null,
      accuses,
      monAccuse: monAccuse?.luLe ?? null,
      chronologie: evenements,
      actions: {
        peutModifier: contexte.modifiable,
        peutSoumettre:
          contexte.modifiable && piece.versionCourante > 0 && !circuitEnCours,
        peutGererAcces: superviseur && piece.statut !== "elimine",
        peutArchiver:
          (droits.gestionnaire || (estAuteur && droits.peutGerer)) &&
          (piece.statut === "valide" || piece.statut === "diffuse"),
        peutEliminer:
          droits.peutEliminer &&
          piece.statut === "archive" &&
          conservationEchue(piece.conservationJusquau, aujourdhui),
        peutAnnulerCircuit:
          circuitEnCours !== undefined &&
          (circuitEnCours.initiePar === droits.user._id || droits.gestionnaire),
        peutAccuser:
          piece.diffusion !== undefined &&
          piece.statut === "diffuse" &&
          estDestinataire(piece.diffusion, droits.user.role) &&
          monAccuse === null,
        peutCommenter: piece.statut !== "elimine",
        etapeAMoi: etapeAMoi
          ? { _id: etapeAMoi._id, nature: etapeAMoi.nature, libelle: etapeAMoi.libelle }
          : null,
      },
    }
  },
})


/** Parapheur : circuits visibles, ou seulement les étapes qui m'attendent. */
export const listerCircuits = query({
  args: {
    portee: v.union(v.literal("a_traiter"), v.literal("inities"), v.literal("tous")),
  },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    let circuits: Doc<"gedCircuits">[]
    if (args.portee === "a_traiter") {
      const mesEtapes = await ctx.db
        .query("gedEtapes")
        .withIndex("by_assigne_statut", (q) =>
          q.eq("assigneId", droits.user._id).eq("statut", "en_attente")
        )
        .collect()
      circuits = (await Promise.all(mesEtapes.map((etape) => ctx.db.get(etape.circuitId)))).filter(
        (circuit): circuit is Doc<"gedCircuits"> => circuit !== null
      )
    } else if (args.portee === "inities") {
      circuits = await ctx.db
        .query("gedCircuits")
        .withIndex("by_initiateur", (q) => q.eq("initiePar", droits.user._id))
        .order("desc")
        .take(LIMITE_LISTE)
    } else {
      circuits = await ctx.db.query("gedCircuits").order("desc").take(LIMITE_LISTE)
    }
    return await lignesCircuits(ctx, droits, circuits)
  },
})

async function lignesCircuits(
  ctx: QueryCtx,
  droits: DroitsGed,
  circuits: readonly Doc<"gedCircuits">[]
) {
  const documents = await Promise.all(circuits.map((circuit) => ctx.db.get(circuit.documentId)))
  const paires = circuits
    .map((circuit, index) => ({ circuit, document: documents[index] }))
    .filter(
      (paire): paire is { circuit: Doc<"gedCircuits">; document: Doc<"gedDocuments"> } =>
        paire.document !== null
    )
  const visibles = new Set(
    (await filtrerVisibles(ctx, droits, paires.map((paire) => paire.document))).map(
      (document) => document._id as string
    )
  )
  const retenues = paires.filter((paire) => visibles.has(paire.document._id))
  const etapesParCircuit = await Promise.all(
    retenues.map((paire) =>
      ctx.db
        .query("gedEtapes")
        .withIndex("by_circuit_rang", (q) => q.eq("circuitId", paire.circuit._id))
        .collect()
    )
  )
  const noms = await nomsDe(ctx, [
    ...retenues.map((paire) => paire.circuit.initiePar),
    ...etapesParCircuit.flat().map((etape) => etape.assigneId),
  ])
  return retenues.map(({ circuit, document: piece }, index) => {
    const etapes = etapesParCircuit[index]!
    const actuelle = etapes.find((etape) => etape.statut === "en_attente")
    return {
      _id: circuit._id,
      document: {
        _id: piece._id,
        reference: piece.reference,
        titre: piece.titre,
        type: piece.type,
        classification: piece.classification,
        direction: piece.direction,
      },
      statut: circuit.statut,
      etapeCourante: circuit.etapeCourante,
      totalEtapes: circuit.totalEtapes,
      etapesFaites: etapes.filter((etape) => ["vise", "signe", "diffuse"].includes(etape.statut)).length,
      actuelle: actuelle
        ? {
            _id: actuelle._id,
            nature: actuelle.nature,
            libelle: actuelle.libelle,
            assigne: noms.get(actuelle.assigneId) ?? "—",
            aMoi: actuelle.assigneId === droits.user._id,
            ouverteLe: actuelle.ouverteLe ?? null,
          }
        : null,
      parcours: etapes
        .sort((a, b) => a.rang - b.rang)
        .map((etape) => `${etape.libelle} (${LIBELLES_STATUT_ETAPE[etape.statut]})`)
        .join(" → "),
      initiePar: noms.get(circuit.initiePar) ?? "—",
      initieLe: circuit.initieLe,
      termineLe: circuit.termineLe ?? null,
      motifCloture: circuit.motifCloture ?? null,
      origine: circuit.origine,
    }
  })
}

/** Registre chronologique du courrier. */
export const listerCourriers = query({
  args: { sens: v.optional(v.union(v.literal("arrivee"), v.literal("depart"))) },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const courriers = await ctx.db
      .query("gedCourriers")
      .withIndex("by_enregistre")
      .order("desc")
      .take(5_000)
    const retenus = args.sens ? courriers.filter((courrier) => courrier.sens === args.sens) : courriers
    const noms = await nomsDe(ctx, retenus.flatMap((courrier) => [courrier.enregistrePar, courrier.traitePar]))
    const aujourdhui = jourLibreville(Date.now())
    return {
      peutEnregistrer: droits.peutCreer,
      lignes: retenus.map((courrier) => ({
        _id: courrier._id,
        numero: courrier.numero,
        sens: courrier.sens,
        dateCourrier: courrier.dateCourrier,
        enregistreLe: courrier.enregistreLe,
        correspondant: courrier.correspondant,
        objet: courrier.objet,
        referenceExterne: courrier.referenceExterne ?? null,
        directionAffectee: courrier.directionAffectee,
        priorite: courrier.priorite,
        echeanceReponse: courrier.echeanceReponse ?? null,
        statut: courrier.statut,
        enRetard: courrierEnRetard(courrier, aujourdhui),
        documentId: courrier.documentId ?? null,
        enregistrePar: noms.get(courrier.enregistrePar) ?? "—",
        traitePar: courrier.traitePar ? (noms.get(courrier.traitePar) ?? "—") : null,
        origine: courrier.origine,
      })),
    }
  },
})

/** Fiche d'un courrier, avec sa pièce et sa réponse. */
export const courrier = query({
  args: { courrierId: v.id("gedCourriers") },
  handler: async (ctx, args) => {
    const droits = await droitsGed(ctx)
    const fiche = await ctx.db.get(args.courrierId)
    if (!fiche) return null
    const [pieceContexte, reponse, entrees, journal] = await Promise.all([
      fiche.documentId ? contexteDocument(ctx, droits, fiche.documentId) : null,
      fiche.reponseCourrierId ? ctx.db.get(fiche.reponseCourrierId) : null,
      ctx.db
        .query("gedCourriers")
        .withIndex("by_reponse", (q) => q.eq("reponseCourrierId", fiche._id))
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityTable", "gedCourriers").eq("entityId", fiche._id))
        .collect(),
    ])
    const noms = await nomsDe(ctx, [fiche.enregistrePar, fiche.traitePar, ...journal.map((log) => log.actorId)])
    const aujourdhui = jourLibreville(Date.now())
    const piece = pieceContexte?.document
    return {
      _id: fiche._id,
      numero: fiche.numero,
      sens: fiche.sens,
      dateCourrier: fiche.dateCourrier,
      enregistreLe: fiche.enregistreLe,
      correspondant: fiche.correspondant,
      objet: fiche.objet,
      referenceExterne: fiche.referenceExterne ?? null,
      directionAffectee: fiche.directionAffectee,
      directionLibelle:
        GED_DIRECTIONS[fiche.directionAffectee as keyof typeof GED_DIRECTIONS] ?? fiche.directionAffectee,
      priorite: fiche.priorite,
      echeanceReponse: fiche.echeanceReponse ?? null,
      statut: fiche.statut,
      enRetard: courrierEnRetard(fiche, aujourdhui),
      commentaire: fiche.commentaire ?? null,
      enregistrePar: noms.get(fiche.enregistrePar) ?? "—",
      traitePar: fiche.traitePar ? (noms.get(fiche.traitePar) ?? "—") : null,
      origine: fiche.origine,
      piece: piece
        ? pieceContexte.visible
          ? { _id: piece._id, reference: piece.reference, titre: piece.titre, visible: true as const }
          : { _id: piece._id, reference: null, titre: null, visible: false as const }
        : null,
      reponse: reponse ? { _id: reponse._id, numero: reponse.numero, objet: reponse.objet } : null,
      reponseA: entrees.map((autre) => ({ _id: autre._id, numero: autre.numero, objet: autre.objet })),
      peutMettreAJour: droits.peutGerer,
      chronologie: [
        {
          cle: "enregistrement",
          at: fiche.enregistreLe,
          titre: `Enregistré au registre ${fiche.sens === "arrivee" ? "arrivée" : "départ"}`,
          detail: `${fiche.numero} par ${noms.get(fiche.enregistrePar) ?? "—"}`,
        },
        ...journal
          .filter((log) => log.action !== "ged.courrier.enregistrer")
          .map((log) => ({
            cle: log._id as string,
            at: log.createdAt,
            titre: LIBELLES_ACTION_COURRIER[log.action] ?? log.action,
            detail: [log.actorId ? noms.get(log.actorId) : undefined, log.reason].filter(Boolean).join(" — "),
          })),
      ].sort((a, b) => b.at - a.at),
    }
  },
})

const LIBELLES_ACTION_COURRIER: Record<string, string> = {
  "ged.courrier.statut": "Statut mis à jour",
  "ged.courrier.affecter": "Affectation modifiée",
  "ged.courrier.repondre": "Réponse rattachée",
}

/** Notes de service diffusées à l'appelant, avec son accusé de lecture. */
export const listerNotes = query({
  args: {},
  handler: async (ctx) => {
    const droits = await droitsGed(ctx)
    const notes = await ctx.db
      .query("gedDocuments")
      .withIndex("by_type", (q) => q.eq("type", "note_service"))
      .order("desc")
      .take(LIMITE_LISTE)
    const diffusees = notes.filter((note) => note.diffusion !== undefined && note.statut !== "elimine")
    const visibles = await filtrerVisibles(ctx, droits, diffusees)
    const lignes = await Promise.all(
      visibles.map(async (note) => {
        const diffusion = note.diffusion!
        const [monAccuse, lectures, audience] = await Promise.all([
          ctx.db
            .query("gedAccuses")
            .withIndex("by_user_document", (q) => q.eq("userId", droits.user._id).eq("documentId", note._id))
            .unique(),
          ctx.db
            .query("gedAccuses")
            .withIndex("by_document", (q) => q.eq("documentId", note._id))
            .collect(),
          audienceNote(ctx, diffusion),
        ])
        return {
          _id: note._id,
          reference: note.reference,
          titre: note.titre,
          direction: note.direction,
          statut: note.statut,
          diffuseLe: diffusion.diffuseLe,
          audience: libelleAudience(diffusion),
          concerne: estDestinataire(diffusion, droits.user.role),
          luLe: monAccuse?.luLe ?? null,
          lus: lectures.length,
          destinataires: audience.length,
          origine: note.origine,
        }
      })
    )
    return lignes
  },
})

/** Plan de classement, volumes et durées de conservation. */
export const planClassement = query({
  args: {},
  handler: async (ctx) => {
    const droits = await droitsGed(ctx)
    const [classements, documents] = await Promise.all([
      ctx.db.query("gedClassement").collect(),
      ctx.db.query("gedDocuments").withIndex("by_updated").order("desc").take(5_000),
    ])
    const aujourdhui = jourLibreville(Date.now())
    const parSerie = new Map<string, { total: number; archives: number; echues: number }>()
    for (const piece of documents) {
      const compte = parSerie.get(piece.classementId) ?? { total: 0, archives: 0, echues: 0 }
      compte.total += 1
      if (piece.statut === "archive") compte.archives += 1
      if (piece.statut === "archive" && conservationEchue(piece.conservationJusquau, aujourdhui)) {
        compte.echues += 1
      }
      parSerie.set(piece.classementId, compte)
    }
    const echues = droits.gestionnaire
      ? await filtrerVisibles(
          ctx,
          droits,
          documents.filter(
            (piece) => piece.statut === "archive" && conservationEchue(piece.conservationJusquau, aujourdhui)
          )
        )
      : []
    return {
      gestionnaire: droits.gestionnaire,
      peutEliminer: droits.peutEliminer,
      series: classements
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((classement) => ({
          _id: classement._id,
          code: classement.code,
          libelle: classement.libelle,
          direction: classement.direction,
          directionLibelle:
            GED_DIRECTIONS[classement.direction as keyof typeof GED_DIRECTIONS] ?? classement.direction,
          processus: classement.processus,
          description: classement.description,
          conservationAnnees: classement.conservationAnnees,
          baseConservation: classement.baseConservation,
          aValider: classement.aValider,
          sortFinal: classement.sortFinal,
          classificationParDefaut: classement.classificationParDefaut,
          actif: classement.actif,
          ...(parSerie.get(classement._id) ?? { total: 0, archives: 0, echues: 0 }),
        })),
      echues: echues.map((piece) => ({
        _id: piece._id,
        reference: piece.reference,
        titre: piece.titre,
        conservationJusquau: piece.conservationJusquau ?? null,
        archiveLe: piece.archiveLe ?? null,
      })),
    }
  },
})

/** Comptes pouvant viser, signer ou diffuser dans un circuit. */
export const signataires = query({
  args: {},
  handler: async (ctx) => {
    await droitsGed(ctx)
    const users = await agentsInternes(ctx)
    const retenus: { _id: Id<"users">; nom: string; role: AppRole }[] = []
    for (const user of users) {
      if (await peutIntervenir(ctx, user)) {
        const nom = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
        retenus.push({ _id: user._id, nom: nom || user.email || "Agent SETRAG", role: user.role })
      }
    }
    return retenus.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
  },
})

/** Accueil du module : indicateurs et priorités de l'appelant. */
export const tableauDeBord = query({
  args: {},
  handler: async (ctx) => {
    const droits = await droitsGed(ctx)
    const aujourdhui = jourLibreville(Date.now())
    const [documents, mesEtapes, courriers, circuitsEnCours] = await Promise.all([
      ctx.db.query("gedDocuments").withIndex("by_updated").order("desc").take(LIMITE_LISTE),
      ctx.db
        .query("gedEtapes")
        .withIndex("by_assigne_statut", (q) => q.eq("assigneId", droits.user._id).eq("statut", "en_attente"))
        .collect(),
      ctx.db.query("gedCourriers").withIndex("by_enregistre").order("desc").take(5_000),
      ctx.db.query("gedCircuits").withIndex("by_statut", (q) => q.eq("statut", "en_cours")).collect(),
    ])
    const visibles = await filtrerVisibles(ctx, droits, documents)
    const visiblesIds = new Set(visibles.map((piece) => piece._id as string))

    const notesDiffusees = visibles.filter(
      (piece) =>
        piece.type === "note_service" &&
        piece.statut === "diffuse" &&
        piece.diffusion !== undefined &&
        estDestinataire(piece.diffusion, droits.user.role)
    )
    const accuses = await Promise.all(
      notesDiffusees.map((note) =>
        ctx.db
          .query("gedAccuses")
          .withIndex("by_user_document", (q) => q.eq("userId", droits.user._id).eq("documentId", note._id))
          .unique()
      )
    )
    const notesALire = notesDiffusees.filter((_note, index) => accuses[index] === null)

    const enAttente = courriers.filter(
      (courrier) => courrier.sens === "arrivee" && courrier.statut !== "repondu" && courrier.statut !== "clos"
    )
    const enRetard = enAttente.filter((courrier) => courrierEnRetard(courrier, aujourdhui))
    const echues = visibles.filter(
      (piece) => piece.statut === "archive" && conservationEchue(piece.conservationJusquau, aujourdhui)
    )
    const documentsEtapes = await Promise.all(mesEtapes.map((etape) => ctx.db.get(etape.documentId)))
    const noms = await nomsDe(ctx, visibles.slice(0, 8).map((piece) => piece.auteurId))
    const classements = await classementsParId(ctx)

    return {
      droits: {
        peutCreer: droits.peutCreer,
        peutGerer: droits.peutGerer,
        gestionnaire: droits.gestionnaire,
        peutEliminer: droits.peutEliminer,
      },
      indicateurs: {
        documents: visibles.length,
        parapheur: mesEtapes.length,
        circuitsEnCours: circuitsEnCours.filter((circuit) => visiblesIds.has(circuit.documentId)).length,
        courriersEnAttente: enAttente.length,
        courriersEnRetard: enRetard.length,
        notesALire: notesALire.length,
        conservationEchue: echues.length,
        brouillons: visibles.filter(
          (piece) => piece.auteurId === droits.user._id && (piece.statut === "brouillon" || piece.statut === "refuse")
        ).length,
      },
      parapheur: mesEtapes
        .map((etape, index) => ({ etape, piece: documentsEtapes[index] }))
        .filter((paire) => paire.piece !== null)
        .sort((a, b) => (a.etape.ouverteLe ?? 0) - (b.etape.ouverteLe ?? 0))
        .slice(0, 6)
        .map(({ etape, piece }) => ({
          etapeId: etape._id,
          documentId: piece!._id,
          reference: piece!.reference,
          titre: piece!.titre,
          nature: etape.nature,
          libelle: etape.libelle,
          depuis: etape.ouverteLe ?? null,
        })),
      notesALire: notesALire.slice(0, 5).map((note) => ({
        _id: note._id,
        reference: note.reference,
        titre: note.titre,
        diffuseLe: note.diffusion!.diffuseLe,
      })),
      courriersEnRetard: enRetard
        .sort((a, b) => (a.echeanceReponse ?? "").localeCompare(b.echeanceReponse ?? ""))
        .slice(0, 5)
        .map((courrier) => ({
          _id: courrier._id,
          numero: courrier.numero,
          objet: courrier.objet,
          correspondant: courrier.correspondant,
          echeanceReponse: courrier.echeanceReponse ?? null,
          directionAffectee: courrier.directionAffectee,
        })),
      recents: visibles
        .slice(0, 8)
        .map((piece) => ligneDocument(piece, classements, noms, aujourdhui)),
    }
  },
})
