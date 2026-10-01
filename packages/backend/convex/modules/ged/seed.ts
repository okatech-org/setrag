/**
 * Jeu de démonstration du module Bureautique et GED.
 *
 * Commande (depuis `packages/backend`, déploiement où
 * `DEMO_ACCOUNTS_ENABLED=true`, après le provisionnement des comptes de
 * démonstration) :
 *
 *   bunx convex run modules/ged/seed:run '{}'
 *   bunx convex run modules/ged/seed:run '{"reset": true}'
 *
 * Sans `reset`, la commande est idempotente : si le jeu existe déjà, rien
 * n'est réécrit (les visas donnés pendant une démonstration sont conservés).
 * Avec `reset`, toutes les lignes d'origine `demo` sont supprimées — fichiers
 * compris — puis recréées. Les pièces et courriers saisis réellement
 * (origine `reel`) ne sont jamais touchés.
 *
 * Contenu : plan de classement (17 séries), environ 120 pièces métadonnées
 * dont une quarantaine portent un vrai PDF généré (toute pièce en circuit en
 * a un), des circuits à tous les stades, le
 * registre du courrier sur trois mois, des notes diffusées avec accusés.
 */

import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../../_generated/server"
import type { AppRole } from "../../model/permissions"
import { normalizedStoredSha256 } from "../platform/documentModel"
import { currentPlatformEnvironment } from "../platform/environment"
import { agentsInternes, peutIntervenir } from "./acces"
import {
  GED_DIRECTIONS,
  GED_TYPES,
  ajouterAnnees,
  anneeLibreville,
  finConservation,
  jourLibreville,
  numeroCourrier,
  texteRecherche,
  type GedClassification,
  type GedStatut,
} from "./model"
import { genererPiecePdf } from "./pdf"
import {
  CORRESPONDANTS_ARRIVEE,
  CORRESPONDANTS_DEPART,
  FICHIERS_DEMO,
  GABARITS,
  MENTION_DEMO,
  PLAN_CLASSEMENT,
  ROLES_ACTEURS,
  type CleActeur,
  type FichierDemo,
  type GabaritPiece,
} from "./seedDonnees"

const JOUR = 86_400_000
const NOMBRE_PIECES = 120
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
]

function exigerDemo() {
  if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
    throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
  }
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function hasard(graine: number) {
  let etat = graine >>> 0
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function referenceDemo(rang: number) {
  return `GED-DEMO-${String(rang).padStart(4, "0")}`
}

/* ═══════════════════════════════════════════════ Préparation ═══ */

async function moduleActifPour(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const activations = await ctx.db
    .query("moduleActivations")
    .withIndex("by_environment_module_user", (q) =>
      q.eq("environment", currentPlatformEnvironment()).eq("moduleCode", "ged").eq("userId", userId)
    )
    .collect()
  const recente = activations.sort((a, b) => b.updatedAt - a.updatedAt)[0]
  return recente?.isEnabled ?? true
}

async function resoudreActeurs(ctx: MutationCtx): Promise<Record<CleActeur, Id<"users">>> {
  const candidats = new Map<CleActeur, Id<"users">>()
  for (const [cle, roles] of Object.entries(ROLES_ACTEURS) as [CleActeur, readonly string[]][]) {
    for (const role of roles) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", role as AppRole))
        .collect()
      for (const user of users.sort((a, b) => a._creationTime - b._creationTime)) {
        if ((await peutIntervenir(ctx, user)) && (await moduleActifPour(ctx, user._id))) {
          candidats.set(cle, user._id)
          break
        }
      }
      if (candidats.has(cle)) break
    }
  }
  let repli = candidats.get("juriste") ?? candidats.get("gestionnaire") ?? candidats.get("direction")
  if (!repli) {
    const existant = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", "DEMO-SEED-GED-AUTEUR"))
      .unique()
    repli =
      existant?._id ??
      (await ctx.db.insert("users", {
        authId: "DEMO-SEED-GED-AUTEUR",
        firstName: "[DÉMO] Compte technique",
        lastName: "GED",
        role: "juriste",
        identitySource: "local",
        isActive: true,
      }))
  }
  const acteurs = {} as Record<CleActeur, Id<"users">>
  for (const cle of Object.keys(ROLES_ACTEURS) as CleActeur[]) {
    acteurs[cle] = candidats.get(cle) ?? repli
  }
  // La signature n'est jamais donnée par l'auteur : la Direction générale
  // signe, sauf à défaut d'un compte distinct.
  return acteurs
}

/** Plan de classement, mis à jour sans jamais dupliquer une série. */
async function upsertClassement(ctx: MutationCtx, maintenant: number) {
  const parCode = new Map<string, Id<"gedClassement">>()
  for (const serie of PLAN_CLASSEMENT) {
    const existante = await ctx.db
      .query("gedClassement")
      .withIndex("by_code", (q) => q.eq("code", serie.code))
      .unique()
    const valeurs = { ...serie, actif: true, origine: "demo" as const, updatedAt: maintenant }
    if (existante) {
      await ctx.db.patch(existante._id, valeurs)
      parCode.set(serie.code, existante._id)
    } else {
      parCode.set(serie.code, await ctx.db.insert("gedClassement", { ...valeurs, createdAt: maintenant }))
    }
  }
  return parCode
}

export const preparer = internalMutation({
  args: {},
  handler: async (ctx) => {
    exigerDemo()
    const demo = await ctx.db
      .query("gedDocuments")
      .withIndex("by_origine", (q) => q.eq("origine", "demo"))
      .first()
    await upsertClassement(ctx, Date.now())
    const acteurs = await resoudreActeurs(ctx)
    return { dejaPeuple: demo !== null, acteurs }
  },
})

/* ═══════════════════════════════════════════════ Purge ═══ */

export const purger = internalMutation({
  args: {},
  handler: async (ctx) => {
    exigerDemo()
    const documents = await ctx.db
      .query("gedDocuments")
      .withIndex("by_origine", (q) => q.eq("origine", "demo"))
      .collect()
    let fichiers = 0
    for (const piece of documents) {
      const versions = await ctx.db
        .query("gedVersions")
        .withIndex("by_document_numero", (q) => q.eq("documentId", piece._id))
        .collect()
      for (const version of versions) {
        if (await ctx.db.system.get("_storage", version.storageId)) {
          await ctx.storage.delete(version.storageId)
          fichiers += 1
        }
        await ctx.db.delete(version._id)
      }
      for (const table of ["gedAcces", "gedEtapes"] as const) {
        const lignes = await ctx.db
          .query(table)
          .withIndex("by_document", (q) => q.eq("documentId", piece._id))
          .collect()
        for (const ligne of lignes) await ctx.db.delete(ligne._id)
      }
      const circuits = await ctx.db
        .query("gedCircuits")
        .withIndex("by_document", (q) => q.eq("documentId", piece._id))
        .collect()
      for (const circuit of circuits) await ctx.db.delete(circuit._id)
      const accuses = await ctx.db
        .query("gedAccuses")
        .withIndex("by_document", (q) => q.eq("documentId", piece._id))
        .collect()
      for (const accuse of accuses) await ctx.db.delete(accuse._id)
      const commentaires = await ctx.db
        .query("gedCommentaires")
        .withIndex("by_document", (q) => q.eq("documentId", piece._id))
        .collect()
      for (const commentaire of commentaires) await ctx.db.delete(commentaire._id)
      const consultations = await ctx.db
        .query("gedConsultations")
        .withIndex("by_document_at", (q) => q.eq("documentId", piece._id))
        .collect()
      for (const consultation of consultations) await ctx.db.delete(consultation._id)
      await ctx.db.delete(piece._id)
    }
    const courriers = await ctx.db
      .query("gedCourriers")
      .withIndex("by_origine", (q) => q.eq("origine", "demo"))
      .collect()
    for (const courrier of courriers) await ctx.db.delete(courrier._id)

    // Les compteurs repartent du dernier numéro réellement attribué.
    const restants = await ctx.db.query("gedCourriers").collect()
    const compteurs = await ctx.db.query("gedCompteurs").collect()
    for (const compteur of compteurs) {
      const correspondance = /^courrier-(arrivee|depart)-(\d{4})$/.exec(compteur.cle)
      if (!correspondance) continue
      const maximum = restants
        .filter((c) => c.sens === correspondance[1] && c.annee === Number(correspondance[2]))
        .reduce((max, c) => Math.max(max, c.rang), 0)
      await ctx.db.patch(compteur._id, { valeur: maximum })
    }
    return { documents: documents.length, courriers: courriers.length, fichiers }
  },
})

/* ═══════════════════════════════════════════════ Écriture ═══ */

const fichierValidator = v.object({
  cle: v.string(),
  storageId: v.id("_storage"),
  nomFichier: v.string(),
  typeMime: v.string(),
  taille: v.number(),
})

type Scenario =
  | { nature: "simple"; statut: GedStatut }
  | {
      nature: "circuit"
      etapes: { nature: "visa" | "signature" | "diffusion"; libelle: string; acteur: CleActeur }[]
      /** Nombre d'étapes déjà décidées ; la suivante est en attente. */
      faites: number
      refus?: string
      diffusion?: { tousLesAgents: boolean; roles: AppRole[] }
    }

/** Scénarios fixes des pièces portant un fichier. */
const SCENARIOS: Record<string, Scenario> = {
  "Mise en service du parapheur électronique": {
    nature: "circuit",
    etapes: [
      { nature: "visa", libelle: "Visa juridique", acteur: "juriste" },
      { nature: "signature", libelle: "Signature DG", acteur: "direction" },
      { nature: "diffusion", libelle: "Diffusion au personnel", acteur: "gestionnaire" },
    ],
    faites: 3,
    diffusion: { tousLesAgents: true, roles: [] },
  },
  "Port obligatoire des équipements de protection en atelier": {
    nature: "circuit",
    etapes: [
      { nature: "visa", libelle: "Visa juridique", acteur: "juriste" },
      { nature: "signature", libelle: "Signature DG", acteur: "direction" },
      { nature: "diffusion", libelle: "Diffusion aux ateliers", acteur: "gestionnaire" },
    ],
    faites: 2,
  },
  "Avenant à la convention de transport de minerai": {
    nature: "circuit",
    etapes: [
      { nature: "visa", libelle: "Visa audit et risques", acteur: "audit" },
      { nature: "visa", libelle: "Visa gestionnaire documentaire", acteur: "gestionnaire" },
      { nature: "signature", libelle: "Signature DG", acteur: "direction" },
    ],
    faites: 2,
  },
  "Procès-verbal d'incident — heurt d'animal au PK 214": {
    nature: "circuit",
    etapes: [
      { nature: "visa", libelle: "Visa audit et risques", acteur: "audit" },
      { nature: "signature", libelle: "Signature DG", acteur: "direction" },
    ],
    faites: 0,
  },
  "Transmission du rapport trimestriel de sécurité": {
    nature: "circuit",
    etapes: [
      { nature: "visa", libelle: "Visa juridique", acteur: "juriste" },
      { nature: "signature", libelle: "Signature DG", acteur: "direction" },
      { nature: "diffusion", libelle: "Expédition", acteur: "gestionnaire" },
    ],
    faites: 3,
    diffusion: { tousLesAgents: false, roles: [] },
  },
  "Demande de rapport trimestriel de sécurité": { nature: "simple", statut: "valide" },
  "Rapport de révision générale de locomotive": { nature: "simple", statut: "valide" },
  "Facture de semelles de frein composite": { nature: "simple", statut: "archive" },
}

const AUDIENCES: AppRole[][] = [
  ["chef_gare", "chef_train", "conducteur_ligne"],
  ["responsable_atelier", "ingenieur_atelier", "contremaitre_atelier"],
  ["inspecteur_securite", "chef_train", "conducteur_ligne"],
]

interface PiecePlanifiee {
  index: number
  gabarit: GabaritPiece
  instance: number
  titre: string
  creeLe: number
  ageJours: number
  dateDocument: string
  scenario: Scenario
  /** Un fichier est généré pour les pièces à fichier et pour tout circuit. */
  avecFichier: boolean
}

/** Plan déterministe des pièces : l'action y lit les fichiers à générer. */
function planifierPieces(maintenant: number): PiecePlanifiee[] {
  const tirer = hasard(20_261_001)
  const plan: PiecePlanifiee[] = []
  for (let index = 0; index < NOMBRE_PIECES; index += 1) {
    const gabarit = GABARITS[index % GABARITS.length]!
    const instance = Math.floor(index / GABARITS.length)
    const ageJours = Math.floor(5 + tirer() * 400) + instance * 30
    const creeLe = maintenant - ageJours * JOUR
    const dateDocument = jourLibreville(creeLe)
    const [annee, mois] = dateDocument.split("-").map(Number) as [number, number]
    const titre = instance === 0 ? gabarit.titre : `${gabarit.titre} — ${MOIS[mois - 1]} ${annee}`
    const fixe = instance === 0 ? SCENARIOS[gabarit.titre] : undefined
    const scenario: Scenario = fixe
      ? fixe
      : gabarit.type === "note_service"
        ? {
            nature: "circuit",
            etapes: [
              { nature: "visa", libelle: "Visa juridique", acteur: "juriste" },
              { nature: "signature", libelle: "Signature DG", acteur: "direction" },
              { nature: "diffusion", libelle: "Diffusion", acteur: "gestionnaire" },
            ],
            faites: 3,
            diffusion:
              index % 3 === 0
                ? { tousLesAgents: true, roles: [] }
                : { tousLesAgents: false, roles: AUDIENCES[index % AUDIENCES.length]! },
          }
        : index % 17 === 5
          ? {
              nature: "circuit",
              etapes: [
                { nature: "visa", libelle: "Visa juridique", acteur: "juriste" },
                { nature: "signature", libelle: "Signature DG", acteur: "direction" },
              ],
              faites: 0,
              refus:
                "Montants à rapprocher du bon de commande avant signature ; merci de joindre l'annexe tarifaire.",
            }
          : index % 13 === 7
            ? {
                nature: "circuit",
                etapes: [
                  { nature: "visa", libelle: "Visa juridique", acteur: "juriste" },
                  { nature: "signature", libelle: "Signature DG", acteur: "direction" },
                ],
                faites: index % 2,
              }
            : {
                nature: "simple",
                statut:
                  index % 10 === 3
                    ? "brouillon"
                    : ageJours > 200 && gabarit.type !== "plan_technique"
                      ? "archive"
                      : "valide",
              }
    plan.push({
      index,
      gabarit,
      instance,
      titre,
      creeLe,
      ageJours,
      dateDocument,
      scenario,
      avecFichier: scenario.nature === "circuit" || (instance === 0 && FICHIERS_DEMO[gabarit.titre] !== undefined),
    })
  }
  return plan
}

/** Contenu du PDF d'une pièce : texte dédié, sinon une fiche générique honnête. */
function contenuFichier(piece: PiecePlanifiee): FichierDemo {
  const dedie = piece.instance === 0 ? FICHIERS_DEMO[piece.gabarit.titre] : undefined
  if (dedie) return dedie
  const serie = PLAN_CLASSEMENT.find((candidate) => candidate.code === piece.gabarit.serie)!
  return {
    titre: piece.titre,
    surtitre: GED_TYPES[piece.gabarit.type],
    emetteur: GED_DIRECTIONS[serie.direction as keyof typeof GED_DIRECTIONS] ?? serie.direction,
    destinataire: piece.gabarit.correspondant,
    paragraphes: [
      `Pièce de démonstration de la série « ${serie.libelle} » (${serie.code}), processus ${serie.processus.toLowerCase()}.`,
      `Mots-clés : ${piece.gabarit.motsCles.join(", ")}. Ce fichier existe pour que le circuit de validation porte sur une pièce réelle, consultable et téléchargeable.`,
    ],
  }
}

export const ecrire = internalMutation({
  args: {
    acteurs: v.record(v.string(), v.id("users")),
    fichiers: v.array(fichierValidator),
    maintenant: v.number(),
  },
  handler: async (ctx, args) => {
    exigerDemo()
    const acteurs = args.acteurs as Record<CleActeur, Id<"users">>
    const maintenant = args.maintenant
    const aujourdhui = jourLibreville(maintenant)
    const classement = await upsertClassement(ctx, maintenant)
    const series = new Map(PLAN_CLASSEMENT.map((serie) => [serie.code, serie]))
    const fichiersParCle = new Map(args.fichiers.map((fichier) => [fichier.cle, fichier]))
    const tirer = hasard(20_261_002)
    const users = await agentsInternes(ctx)

    const documentsParTitre = new Map<string, Id<"gedDocuments">>()
    const pieces: Doc<"gedDocuments">[] = []
    let rangDocument = 0
    let circuits = 0

    const insererPiece = async (
      gabarit: GabaritPiece,
      titre: string,
      dateDocument: string,
      statut: GedStatut,
      options: { archiveLe?: number; creeLe: number }
    ) => {
      rangDocument += 1
      const serie = series.get(gabarit.serie)!
      const classementId = classement.get(gabarit.serie)!
      const classification: GedClassification =
        gabarit.classification ?? serie.classificationParDefaut
      const reference = referenceDemo(rangDocument)
      const conservationJusquau = finConservation(dateDocument, serie.conservationAnnees)
      const description = `Pièce de démonstration — ${serie.libelle.toLowerCase()}, ${serie.processus.toLowerCase()}.`
      const documentId = await ctx.db.insert("gedDocuments", {
        reference,
        titre,
        description,
        type: gabarit.type,
        classementId,
        direction: serie.direction,
        motsCles: [...gabarit.motsCles],
        classification,
        statut,
        dateDocument,
        versionCourante: 0,
        auteurId: acteurs[gabarit.auteur],
        correspondant: gabarit.correspondant,
        ...(conservationJusquau ? { conservationJusquau } : {}),
        ...(options.archiveLe
          ? {
              archiveLe: options.archiveLe,
              archivePar: acteurs.gestionnaire,
              motifArchivage: "Versement aux archives intermédiaires (démonstration)",
            }
          : {}),
        texteRecherche: texteRecherche([
          reference,
          titre,
          description,
          gabarit.motsCles.join(" "),
          gabarit.correspondant,
          serie.direction,
          serie.code,
          serie.libelle,
        ]),
        origine: "demo",
        createdAt: options.creeLe,
        updatedAt: options.archiveLe ?? options.creeLe,
      })
      if (classification === "confidentiel") {
        for (const role of ["direction_generale", "audit_risques"] as const) {
          await ctx.db.insert("gedAcces", {
            documentId,
            role,
            droit: "lecture",
            accordePar: acteurs[gabarit.auteur],
            accordeLe: options.creeLe,
          })
        }
      }
      if (classification === "restreint") {
        for (const cle of ["direction", "audit"] as const) {
          if (acteurs[cle] === acteurs[gabarit.auteur]) continue
          await ctx.db.insert("gedAcces", {
            documentId,
            userId: acteurs[cle],
            droit: "lecture",
            accordePar: acteurs[gabarit.auteur],
            accordeLe: options.creeLe,
          })
        }
      }
      return documentId
    }

    const ajouterFichier = async (documentId: Id<"gedDocuments">, cle: string, deposeLe: number) => {
      const fichier = fichiersParCle.get(cle)
      if (!fichier) return false
      const meta = await ctx.db.system.get("_storage", fichier.storageId)
      if (!meta) return false
      const auteur = (await ctx.db.get(documentId))!.auteurId
      await ctx.db.insert("gedVersions", {
        documentId,
        numero: 1,
        storageId: fichier.storageId,
        nomFichier: fichier.nomFichier,
        typeMime: fichier.typeMime,
        taille: fichier.taille,
        sha256: normalizedStoredSha256(meta.sha256),
        commentaire: "Version initiale (fichier de démonstration généré)",
        deposePar: auteur,
        deposeLe,
      })
      await ctx.db.patch(documentId, { versionCourante: 1 })
      return true
    }

    const creerCircuit = async (
      documentId: Id<"gedDocuments">,
      scenario: Extract<Scenario, { nature: "circuit" }>,
      debut: number
    ) => {
      const piece = (await ctx.db.get(documentId))!
      const total = scenario.etapes.length
      const refuse = scenario.refus !== undefined
      const termine = !refuse && scenario.faites >= total
      const circuitId = await ctx.db.insert("gedCircuits", {
        documentId,
        statut: refuse ? "refuse" : termine ? "termine" : "en_cours",
        etapeCourante: Math.min(scenario.faites + 1, total),
        totalEtapes: total,
        initiePar: piece.auteurId,
        initieLe: debut,
        ...(termine || refuse ? { termineLe: debut + (scenario.faites + 1) * JOUR / 2 } : {}),
        ...(refuse ? { motifCloture: scenario.refus } : {}),
        origine: "demo",
      })
      circuits += 1
      for (const [index, etape] of scenario.etapes.entries()) {
        const rang = index + 1
        const ouverteLe = debut + index * (JOUR / 2)
        const decideLe = ouverteLe + JOUR / 3
        let statut: Doc<"gedEtapes">["statut"]
        if (refuse && index === scenario.faites) statut = "refuse"
        else if (refuse && index > scenario.faites) statut = "annule"
        else if (index < scenario.faites) {
          statut = etape.nature === "visa" ? "vise" : etape.nature === "signature" ? "signe" : "diffuse"
        } else if (index === scenario.faites) statut = "en_attente"
        else statut = "a_venir"
        await ctx.db.insert("gedEtapes", {
          circuitId,
          documentId,
          rang,
          nature: etape.nature,
          libelle: etape.libelle,
          assigneId: acteurs[etape.acteur],
          statut,
          ...(statut === "refuse" ? { commentaire: scenario.refus } : {}),
          ...(statut !== "a_venir" ? { ouverteLe } : {}),
          ...(["vise", "signe", "diffuse", "refuse"].includes(statut) ? { decideLe } : {}),
        })
      }
      let statutPiece: GedStatut = "en_circuit"
      if (refuse) statutPiece = "refuse"
      else if (termine) {
        statutPiece = scenario.etapes[total - 1]!.nature === "diffusion" ? "diffuse" : "valide"
      }
      await ctx.db.patch(documentId, {
        statut: statutPiece,
        ...(termine && scenario.diffusion
          ? {
              diffusion: {
                tousLesAgents: scenario.diffusion.tousLesAgents,
                roles: scenario.diffusion.roles,
                diffuseLe: debut + total * (JOUR / 2),
                diffusePar: acteurs[scenario.etapes[total - 1]!.acteur],
              },
            }
          : {}),
      })
    }

    // 1. Pièces : chaque gabarit donne une à trois pièces datées.
    for (const prevue of planifierPieces(maintenant)) {
      const { scenario } = prevue
      const statutInitial = scenario.nature === "simple" ? scenario.statut : "brouillon"
      const documentId = await insererPiece(prevue.gabarit, prevue.titre, prevue.dateDocument, statutInitial, {
        creeLe: prevue.creeLe,
        ...(statutInitial === "archive" ? { archiveLe: prevue.creeLe + 60 * JOUR } : {}),
      })
      documentsParTitre.set(prevue.titre, documentId)
      const avecFichier = prevue.avecFichier
        ? await ajouterFichier(documentId, String(prevue.index), prevue.creeLe)
        : false
      // Un circuit vise toujours une pièce réelle : sans fichier, il n'est pas créé.
      if (scenario.nature === "circuit" && avecFichier) {
        await creerCircuit(documentId, scenario, prevue.creeLe + JOUR)
      }
      pieces.push((await ctx.db.get(documentId))!)
    }

    // 2. Pièces anciennes archivées dont la conservation est échue.
    const anciennes = [
      { serie: "DFC.PJ", titre: "Factures fournisseurs — exercice 2013", date: "2013-12-31" },
      { serie: "DCFV.FRET", titre: "Lettres de voiture — premier semestre 2014", date: "2014-06-30" },
      { serie: "BOC.ARR", titre: "Courrier arrivé — liasse 2018", date: "2018-12-31" },
    ] as const
    for (const ancienne of anciennes) {
      const gabarit: GabaritPiece = {
        serie: ancienne.serie,
        type: ancienne.serie === "BOC.ARR" ? "courrier_entrant" : "piece_comptable",
        titre: ancienne.titre,
        motsCles: ["archives", "fin de conservation"],
        auteur: "gestionnaire",
      }
      const creeLe = Date.parse(`${ancienne.date}T09:00:00+01:00`)
      const documentId = await insererPiece(gabarit, ancienne.titre, ancienne.date, "archive", {
        creeLe,
        archiveLe: Date.parse(`${ajouterAnnees(ancienne.date, 1)}T09:00:00+01:00`),
      })
      pieces.push((await ctx.db.get(documentId))!)
    }

    // 3. Accusés de lecture des notes diffusées : environ deux tiers lus.
    let accuses = 0
    for (const piece of await Promise.all(pieces.map((p) => ctx.db.get(p._id)))) {
      if (!piece?.diffusion || piece.type !== "note_service") continue
      const audience = users.filter(
        (user) => piece.diffusion!.tousLesAgents || piece.diffusion!.roles.includes(user.role)
      )
      for (const [rang, user] of audience.entries()) {
        if (rang % 3 === 2) continue
        await ctx.db.insert("gedAccuses", {
          documentId: piece._id,
          userId: user._id,
          luLe: piece.diffusion.diffuseLe + (rang + 1) * 3_600_000,
        })
        accuses += 1
      }
    }

    // 4. Collaboration : quelques échanges sur les pièces en circuit.
    const echanges: Record<string, readonly [CleActeur, string][]> = {
      "Avenant à la convention de transport de minerai": [
        ["juriste", "Projet aligné sur la clause de révision du plan de transport. Merci de vérifier l'article 2."],
        ["audit", "Visa donné : la clause de révision trimestrielle est conforme à la politique contractuelle."],
      ],
      "Procès-verbal d'incident — heurt d'animal au PK 214": [
        ["exploitation", "Photos du bogie disponibles auprès de la gare de Booué."],
      ],
    }
    for (const [titre, messages] of Object.entries(echanges)) {
      const documentId = documentsParTitre.get(titre)
      if (!documentId) continue
      for (const [rang, [cle, texte]] of messages.entries()) {
        await ctx.db.insert("gedCommentaires", {
          documentId,
          auteurId: acteurs[cle],
          texte,
          createdAt: maintenant - (messages.length - rang) * 3_600_000,
        })
      }
    }

    // 5. Journal de consultation des pièces à fichier dédié.
    for (const titre of Object.keys(FICHIERS_DEMO)) {
      const documentId = documentsParTitre.get(titre)
      if (!documentId) continue
      for (const [rang, cle] of (["direction", "audit", "juriste"] as const).entries()) {
        await ctx.db.insert("gedConsultations", {
          documentId,
          userId: acteurs[cle],
          nature: rang === 0 ? "apercu" : rang === 1 ? "telechargement" : "fiche",
          versionNumero: rang === 2 ? undefined : 1,
          at: maintenant - (rang + 1) * 7_200_000,
        })
      }
    }

    // 6. Registre du courrier sur trois mois, numéroté dans l'ordre d'arrivée.
    const evenements: {
      sens: "arrivee" | "depart"
      at: number
      correspondant: string
      objet: string
      direction: string
    }[] = []
    for (let jour = 90; jour >= 1; jour -= 1) {
      const nombreArrivees = tirer() < 0.75 ? 1 : 0
      for (let k = 0; k < nombreArrivees; k += 1) {
        const correspondant = CORRESPONDANTS_ARRIVEE[Math.floor(tirer() * CORRESPONDANTS_ARRIVEE.length)]!
        evenements.push({
          sens: "arrivee",
          at: maintenant - jour * JOUR + Math.floor(8 + tirer() * 8) * 3_600_000,
          correspondant: correspondant.nom,
          objet: correspondant.objets[Math.floor(tirer() * correspondant.objets.length)]!,
          direction: correspondant.direction,
        })
      }
      if (tirer() < 0.4) {
        const correspondant = CORRESPONDANTS_DEPART[Math.floor(tirer() * CORRESPONDANTS_DEPART.length)]!
        evenements.push({
          sens: "depart",
          at: maintenant - jour * JOUR + Math.floor(9 + tirer() * 7) * 3_600_000,
          correspondant: correspondant.nom,
          objet: correspondant.objets[Math.floor(tirer() * correspondant.objets.length)]!,
          direction: correspondant.direction,
        })
      }
    }
    evenements.sort((a, b) => a.at - b.at)
    const rangs = new Map<string, number>()
    const prochainRangDemo = async (cle: string) => {
      if (!rangs.has(cle)) {
        const compteur = await ctx.db
          .query("gedCompteurs")
          .withIndex("by_cle", (q) => q.eq("cle", cle))
          .unique()
        rangs.set(cle, compteur?.valeur ?? 0)
      }
      const valeur = rangs.get(cle)! + 1
      rangs.set(cle, valeur)
      return valeur
    }
    const arriveesOuvertes: Id<"gedCourriers">[] = []
    let courriers = 0
    const scanArrivee = documentsParTitre.get("Demande de rapport trimestriel de sécurité")
    const scanDepart = documentsParTitre.get("Transmission du rapport trimestriel de sécurité")
    for (const [index, evenement] of evenements.entries()) {
      const annee = anneeLibreville(evenement.at)
      const rang = await prochainRangDemo(`courrier-${evenement.sens}-${annee}`)
      const numero = numeroCourrier(evenement.sens, annee, rang)
      const dateCourrier = jourLibreville(evenement.at - JOUR)
      const ageJours = Math.floor((maintenant - evenement.at) / JOUR)
      const echeance =
        evenement.sens === "arrivee" && index % 3 !== 1
          ? jourLibreville(Date.parse(`${dateCourrier}T12:00:00+01:00`) + (15 + (index % 4) * 5) * JOUR)
          : undefined
      let statut: Doc<"gedCourriers">["statut"]
      if (evenement.sens === "depart") statut = "clos"
      else if (ageJours > 45) statut = index % 9 === 0 ? "en_traitement" : index % 2 === 0 ? "repondu" : "clos"
      else if (ageJours > 10) statut = index % 3 === 0 ? "enregistre" : "en_traitement"
      else statut = "enregistre"
      const premiereArrivee = evenement.sens === "arrivee" && courriers === 0
      const courrierId = await ctx.db.insert("gedCourriers", {
        numero,
        annee,
        rang,
        sens: evenement.sens,
        dateCourrier,
        enregistreLe: evenement.at,
        correspondant: evenement.correspondant,
        objet: evenement.objet,
        referenceExterne: evenement.sens === "arrivee" ? `REF-${String(1000 + index)}` : undefined,
        directionAffectee: evenement.direction,
        priorite: index % 7 === 0 ? "urgente" : "normale",
        echeanceReponse: echeance,
        statut,
        documentId: premiereArrivee ? scanArrivee : undefined,
        enregistrePar: acteurs.gestionnaire,
        traitePar: statut === "enregistre" ? undefined : acteurs[index % 2 === 0 ? "juriste" : "gestionnaire"],
        texteRecherche: texteRecherche([numero, evenement.correspondant, evenement.objet, evenement.direction]),
        origine: "demo",
        updatedAt: evenement.at,
      })
      courriers += 1
      if (evenement.sens === "arrivee" && (statut === "enregistre" || statut === "en_traitement")) {
        arriveesOuvertes.push(courrierId)
      }
      if (evenement.sens === "depart" && arriveesOuvertes.length > 0 && index % 2 === 0) {
        const origine = arriveesOuvertes.shift()!
        await ctx.db.patch(origine, { statut: "repondu", reponseCourrierId: courrierId })
        if (scanDepart && courriers < 20) {
          await ctx.db.patch(courrierId, { documentId: scanDepart })
        }
      }
    }

    return {
      acteurs: Object.keys(acteurs).length,
      documents: pieces.length,
      fichiers: args.fichiers.length,
      circuits,
      accuses,
      courriers,
      aujourdhui,
    }
  },
})

/* ═══════════════════════════════════════════════ Orchestration ═══ */

export const run = internalAction({
  args: { reset: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args
  ): Promise<
    | { statut: "deja_peuple"; message: string }
    | { statut: "peuple"; purge: unknown; resultat: unknown }
  > => {
    exigerDemo()
    const purge = args.reset ? await ctx.runMutation(internal.modules.ged.seed.purger, {}) : null
    const preparation = await ctx.runMutation(internal.modules.ged.seed.preparer, {})
    if (preparation.dejaPeuple) {
      return {
        statut: "deja_peuple",
        message: "Le jeu GED existe déjà : rien n'a été réécrit. Relancez avec {\"reset\": true} pour le régénérer.",
      }
    }
    const maintenant = Date.now()
    const fichiers: {
      cle: string
      storageId: Id<"_storage">
      nomFichier: string
      typeMime: string
      taille: number
    }[] = []
    for (const prevue of planifierPieces(maintenant).filter((piece) => piece.avecFichier)) {
      const contenu = contenuFichier(prevue)
      const octets = await genererPiecePdf({
        reference: referenceDemo(prevue.index + 1),
        titre: contenu.titre,
        surtitre: contenu.surtitre,
        date: prevue.dateDocument,
        emetteur: contenu.emetteur,
        destinataire: contenu.destinataire,
        paragraphes: contenu.paragraphes,
        signature: contenu.signature,
        mention: MENTION_DEMO,
      })
      const blob = new Blob([octets.slice().buffer as ArrayBuffer], { type: "application/pdf" })
      const storageId = await ctx.storage.store(blob)
      const nomFichier = `${prevue.titre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
        .slice(0, 80)}.pdf`
      fichiers.push({ cle: String(prevue.index), storageId, nomFichier, typeMime: "application/pdf", taille: blob.size })
    }
    const resultat = await ctx.runMutation(internal.modules.ged.seed.ecrire, {
      acteurs: preparation.acteurs,
      fichiers,
      maintenant,
    })
    return { statut: "peuple", purge, resultat }
  },
})
