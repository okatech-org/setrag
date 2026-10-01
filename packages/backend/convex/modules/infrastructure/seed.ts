/**
 * Jeu de démonstration du module Infrastructures ferroviaires et travaux PRN.
 *
 * Commandes (depuis la racine du dépôt) :
 *
 *   cd packages/backend && bunx convex run modules/infrastructure/seed:run '{}'
 *   cd packages/backend && bunx convex run modules/infrastructure/seed:run '{"reset": true}'
 *
 * Réservé aux déploiements où `DEMO_ACCOUNTS_ENABLED=true`.
 * - sans `reset` : idempotent. Si des sections existent déjà, rien n'est
 *   écrit et la fonction renvoie `{ deja: true, … }` avec les comptes ;
 * - avec `reset: true` : purge toutes les tables `infra*` et les compteurs
 *   `sequences` préfixés `infra:`, puis repeuple.
 *
 * Tout le contenu est SYNTHÉTIQUE : les sections suivent les gares du
 * référentiel (`stations`), mais états de voie, ouvrages, cotations,
 * anomalies, montants et calendriers sont inventés pour la démonstration et
 * signalés comme tels dans les notes. Le tirage est déterministe (mulberry32)
 * et les dates sont relatives à l'instant d'exécution. Les auteurs sont des
 * comptes existants du rôle adapté (index `by_role`) ou restent vides : aucun
 * compte n'est inventé.
 */
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import type { AppRole } from "../../model/permissions"
import { anneeLibreville, nomAgent, type PrefixeNumeroInfra } from "./acces"
import {
  ajouterMois,
  avancement,
  bornesJourLibreville,
  DELAI_GRAVITE_MS,
  HEURE,
  interventionsEnConflit,
  JOUR,
  LIBELLES_BAILLEUR,
  LIBELLES_COTATION,
  LIBELLES_GRAVITE,
  LONGUEUR_LIGNE_KM,
  MINUTE,
  sectionDuPk,
  sectionsRecoupees,
  surveillanceIqoa,
  typeTraverseDepuisPart,
  type Bailleur,
  type Cotation,
  type EtatVoie,
  type Gravite,
  type StatutAnomalie,
  type StatutIntervention,
  type TypeInspection,
} from "./model"

/* ─────────────────────────── Tirage déterministe ──────────────────────── */

function mulberry32(graine: number) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Alea = ReturnType<typeof mulberry32>

function entre(alea: Alea, min: number, max: number) {
  return min + alea() * (max - min)
}
function entier(alea: Alea, min: number, max: number) {
  return Math.floor(entre(alea, min, max + 1))
}
function choisir<T>(alea: Alea, liste: readonly T[]): T {
  return liste[Math.floor(alea() * liste.length)] as T
}
function pondere<T extends string>(alea: Alea, poids: Readonly<Record<T, number>>): T {
  const entrees = Object.entries(poids) as [T, number][]
  const total = entrees.reduce((s, [, p]) => s + p, 0)
  let tirage = alea() * total
  for (const [cle, p] of entrees) {
    tirage -= p
    if (tirage <= 0) return cle
  }
  return entrees[entrees.length - 1]![0]
}
function pk1(valeur: number) {
  return Math.round(valeur * 10) / 10
}
function pkTexte(pk: number) {
  return pk.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/* ─────────────────────────── Référentiel de secours ───────────────────── */

/** Gares du Transgabonais (référentiel `seeds/referential.ts`), si `stations` est vide. */
const GARES_REFERENCE: readonly { code: string; nom: string; pk: number }[] = [
  { code: "OWE", nom: "Owendo Virié", pk: 0 },
  { code: "NTM", nom: "Ntoum", pk: 35 },
  { code: "AND", nom: "Andem", pk: 57 },
  { code: "MBE", nom: "Mbel", pk: 85 },
  { code: "OYA", nom: "Oyan", pk: 118 },
  { code: "ABA", nom: "Abanga", pk: 148 },
  { code: "NDJ", nom: "Ndjolé", pk: 182 },
  { code: "ALE", nom: "Alembé", pk: 202 },
  { code: "OTO", nom: "Otoumbi", pk: 226 },
  { code: "BIS", nom: "Bissouma", pk: 244 },
  { code: "AYE", nom: "Ayem", pk: 267 },
  { code: "LOP", nom: "Lopé", pk: 290 },
  { code: "OFF", nom: "Offoué", pk: 312 },
  { code: "BOO", nom: "Booué", pk: 338 },
  { code: "IVI", nom: "Ivindo", pk: 375 },
  { code: "MOU", nom: "Mouyabi", pk: 411 },
  { code: "MIL", nom: "Milolé", pk: 448 },
  { code: "LTV", nom: "Lastourville", pk: 484 },
  { code: "DOU", nom: "Doumé", pk: 514 },
  { code: "LIF", nom: "Lifouta", pk: 549 },
  { code: "MBA", nom: "Mboungou Badouma", pk: 584 },
  { code: "MOA", nom: "Moanda", pk: 619 },
  { code: "FCV", nom: "Franceville", pk: 669 },
]

function district(pk: number): string {
  if (pk < 182) return "Owendo"
  if (pk < 338) return "Ndjolé"
  if (pk < 484) return "Booué"
  if (pk < 619) return "Lastoursville"
  return "Moanda"
}

const MENTION = "Donnée de démonstration synthétique."

/* ─────────────────────────── Tables purgées ───────────────────────────── */

const TABLES_INFRA = [
  "infraEvenements",
  "infraInterventions",
  "infraJalons",
  "infraAvancements",
  "infraLots",
  "infraChantiers",
  "infraLtv",
  "infraAnomalies",
  "infraEquipements",
  "infraInspections",
  "infraOuvrages",
  "infraSections",
] as const

async function purger(ctx: MutationCtx) {
  for (const table of TABLES_INFRA) {
    const documents = await ctx.db.query(table).collect()
    for (const document of documents) await ctx.db.delete(document._id)
  }
  const sequences = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.gte("key", "infra:").lt("key", "infra;"))
    .collect()
  for (const sequence of sequences) await ctx.db.delete(sequence._id)
}

async function compter(ctx: MutationCtx) {
  const n = async (table: (typeof TABLES_INFRA)[number]) =>
    (await ctx.db.query(table).collect()).length
  return {
    sections: await n("infraSections"),
    ouvrages: await n("infraOuvrages"),
    inspections: await n("infraInspections"),
    equipements: await n("infraEquipements"),
    anomalies: await n("infraAnomalies"),
    ltv: await n("infraLtv"),
    chantiers: await n("infraChantiers"),
    lots: await n("infraLots"),
    avancements: await n("infraAvancements"),
    jalons: await n("infraJalons"),
    interventions: await n("infraInterventions"),
    evenements: await n("infraEvenements"),
  }
}

/* ─────────────────────────── Numérotation ─────────────────────────────── */

class Numeroteur {
  private readonly valeurs = new Map<string, number>()
  constructor(private readonly ctx: MutationCtx) {}

  async suivant(prefixe: PrefixeNumeroInfra, date: number): Promise<string> {
    const annee = anneeLibreville(date)
    const cle = `infra:${prefixe}:${annee}`
    let valeur = this.valeurs.get(cle)
    if (valeur === undefined) {
      const existant = await this.ctx.db
        .query("sequences")
        .withIndex("by_key", (q) => q.eq("key", cle))
        .unique()
      valeur = existant?.value ?? 0
    }
    valeur += 1
    this.valeurs.set(cle, valeur)
    return `${prefixe}-${annee}-${String(valeur).padStart(4, "0")}`
  }

  async enregistrer() {
    for (const [key, value] of this.valeurs) {
      const existant = await this.ctx.db
        .query("sequences")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
      if (existant) await this.ctx.db.patch(existant._id, { value })
      else await this.ctx.db.insert("sequences", { key, value })
    }
  }
}

/* ─────────────────────────── Peuplement ───────────────────────────────── */

const ROLES_AUTEURS = [
  "agent_voie",
  "cantonnier",
  "technicien_signalisation",
  "technicien_telecoms",
  "agent_ouvrages_ponts",
  "responsable_prn",
] as const satisfies readonly AppRole[]
type RoleAuteur = (typeof ROLES_AUTEURS)[number]

export const run = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, { reset }) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
    }
    const existante = await ctx.db.query("infraSections").first()
    if (existante && !reset) {
      return { deja: true, ...(await compter(ctx)) }
    }
    if (reset) await purger(ctx)
    await peupler(ctx)
    return { deja: false, ...(await compter(ctx)) }
  },
})

async function peupler(ctx: MutationCtx) {
  const T = Date.now()
  const alea = mulberry32(20_260_669)
  const numeros = new Numeroteur(ctx)

  /* Auteurs : comptes existants uniquement. */
  const comptes = new Map<RoleAuteur, Doc<"users">[]>()
  for (const role of ROLES_AUTEURS) {
    const utilisateurs = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .collect()
    comptes.set(
      role,
      utilisateurs.filter((u) => u.isActive)
    )
  }
  const auteur = (role: RoleAuteur): Doc<"users"> | undefined => {
    const liste = comptes.get(role) ?? []
    return liste.length > 0 ? choisir(alea, liste) : undefined
  }
  const auteurId = (role: RoleAuteur) => auteur(role)?._id

  let nbEvenements = 0
  const evenement = async (
    entite: Doc<"infraEvenements">["entite"],
    entiteId: string,
    type: string,
    libelle: string,
    creeLe: number,
    auteurIdEv?: Id<"users">,
    detail?: string
  ) => {
    nbEvenements += 1
    await ctx.db.insert("infraEvenements", {
      entite,
      entiteId,
      type,
      libelle,
      detail,
      auteurId: auteurIdEv,
      creeLe: Math.min(creeLe, T),
    })
  }

  /* ── Gares et sections ── */
  const stations = (
    await ctx.db.query("stations").withIndex("by_kilometerPoint").collect()
  ).filter((s) => s.isActive)
  const gares =
    stations.length >= 2
      ? stations.map((s) => ({ id: s._id as Id<"stations"> | undefined, code: s.code, nom: s.name, pk: s.kilometerPoint }))
      : GARES_REFERENCE.map((g) => ({ id: undefined, ...g }))
  const longueur = gares[gares.length - 1]!.pk || LONGUEUR_LIGNE_KM

  const sections: Doc<"infraSections">[] = []
  for (let i = 0; i < gares.length - 1; i += 1) {
    const a = gares[i]!
    const b = gares[i + 1]!
    const avantBooue = a.pk < 338
    const partBetonPct = avantBooue
      ? entier(alea, 72, 100)
      : a.pk >= 619
        ? entier(alea, 25, 45)
        : entier(alea, 4, 30)
    const etat: EtatVoie =
      a.code === "MOU" || (a.pk >= 411 && a.pk < 448)
        ? "critique"
        : pondere(alea, avantBooue
            ? { bon: 6, moyen: 3, degrade: 1, critique: 0 }
            : { bon: 2, moyen: 4, degrade: 3, critique: 0 })
    const vitesseNominaleKmh = avantBooue ? choisir(alea, [80, 80, 70]) : choisir(alea, [60, 70, 70])
    const auscultation = T - entier(alea, 20, 210) * JOUR
    const doc = {
      code: `S${String(i + 1).padStart(2, "0")}`,
      libelle: `${a.nom} – ${b.nom}`,
      pkDebut: a.pk,
      pkFin: b.pk,
      gareDebutId: a.id,
      gareFinId: b.id,
      district: `District de ${district(a.pk)}`,
      brigade: `Brigade voie de ${a.nom}`,
      vitesseNominaleKmh,
      typeTraverse: typeTraverseDepuisPart(partBetonPct),
      partBetonPct,
      armement:
        partBetonPct >= 50
          ? "Rail UIC 50 soudé, traverses béton bibloc, attaches élastiques"
          : "Rail 46 kg/m éclissé, traverses bois azobé, tirefonds",
      etat,
      noteEtat:
        etat === "critique"
          ? `Nivellement et dressage hors tolérance sur plusieurs zones ; traverses bois en fin de vie. ${MENTION}`
          : etat === "degrade"
            ? `Défauts de géométrie localisés, ballast pollué par endroits. ${MENTION}`
            : MENTION,
      derniereAuscultationLe: auscultation,
      majLe: auscultation,
    }
    const id = await ctx.db.insert("infraSections", doc)
    sections.push({ _id: id, _creationTime: T, ...doc })
    await evenement(
      "section",
      id,
      "section_auscultee",
      `Auscultation de la voie : état ${etat === "degrade" ? "dégradé" : etat}`,
      auscultation,
      auteurId("agent_voie"),
      MENTION
    )
  }
  const sectionDe = (pk: number) => sectionDuPk(sections, pk)

  /* ── Ouvrages d'art et inspections ── */
  type OuvrageDef = {
    code: string
    nom: string
    type: Doc<"infraOuvrages">["type"]
    pk: number
    longueurM: number
    materiau: string
    franchissement?: string
    cotation: Cotation
  }
  const nommes: OuvrageDef[] = [
    { code: "OA-PT-148", nom: "Pont de l'Abanga", type: "pont", pk: 148.6, longueurM: 120, materiau: "Béton précontraint", franchissement: "Abanga", cotation: "2E" },
    { code: "OA-PT-181", nom: "Pont sur l'Ogooué à Ndjolé", type: "pont", pk: 181.2, longueurM: 330, materiau: "Mixte acier-béton", franchissement: "Ogooué", cotation: "2" },
    { code: "OA-PT-224", nom: "Pont sur l'Ogooué d'Otoumbi", type: "pont", pk: 224.5, longueurM: 260, materiau: "Béton précontraint", franchissement: "Ogooué", cotation: "1" },
    { code: "OA-MU-266", nom: "Mur de soutènement d'Ayem", type: "mur_soutenement", pk: 266.4, longueurM: 180, materiau: "Béton armé", cotation: "3" },
    { code: "OA-TR-296", nom: "Tranchée de la Lopé", type: "tranchee", pk: 296.6, longueurM: 420, materiau: "Latérite et roche altérée", cotation: "2" },
    { code: "OA-VI-313", nom: "Viaduc de l'Offoué", type: "viaduc", pk: 313.8, longueurM: 410, materiau: "Béton précontraint", franchissement: "Offoué", cotation: "2E" },
    { code: "OA-PT-336", nom: "Pont sur l'Ogooué à Booué", type: "pont", pk: 336.1, longueurM: 300, materiau: "Mixte acier-béton", franchissement: "Ogooué", cotation: "2" },
    { code: "OA-PT-373", nom: "Pont de l'Ivindo", type: "pont", pk: 373.4, longueurM: 240, materiau: "Béton précontraint", franchissement: "Ivindo", cotation: "3" },
    { code: "OA-TR-412", nom: "Tranchée de Mouyabi", type: "tranchee", pk: 412.7, longueurM: 650, materiau: "Roche altérée et latérite", cotation: "2E" },
    { code: "OA-PT-472", nom: "Pont de la Lolo", type: "pont", pk: 472.6, longueurM: 150, materiau: "Béton armé", franchissement: "Lolo", cotation: "3U" },
    { code: "OA-PT-486", nom: "Pont sur l'Ogooué à Lastoursville", type: "pont", pk: 486.3, longueurM: 220, materiau: "Mixte acier-béton", franchissement: "Ogooué", cotation: "2" },
    { code: "OA-BU-523", nom: "Buse PK 523,4", type: "buse", pk: 523.4, longueurM: 24, materiau: "Buse métallique ondulée", cotation: "2E" },
    { code: "OA-PT-664", nom: "Pont de la Mpassa", type: "pont", pk: 664.2, longueurM: 90, materiau: "Béton armé", franchissement: "Mpassa", cotation: "1" },
  ]
  const genericTypes: Doc<"infraOuvrages">["type"][] = [
    ...Array<Doc<"infraOuvrages">["type"]>(10).fill("buse"),
    ...Array<Doc<"infraOuvrages">["type"]>(9).fill("dalot"),
    ...Array<Doc<"infraOuvrages">["type"]>(4).fill("mur_soutenement"),
    ...Array<Doc<"infraOuvrages">["type"]>(2).fill("tranchee"),
    ...Array<Doc<"infraOuvrages">["type"]>(2).fill("pont"),
  ]
  const definitions: OuvrageDef[] = nommes.filter((o) => o.pk <= longueur)
  const pksPris = new Set(definitions.map((o) => Math.round(o.pk)))
  for (const type of genericTypes) {
    let pk = pk1(entre(alea, 5, longueur - 5))
    while (pksPris.has(Math.round(pk))) pk = pk1(entre(alea, 5, longueur - 5))
    pksPris.add(Math.round(pk))
    const prefixe = { buse: "BU", dalot: "DA", mur_soutenement: "MU", tranchee: "TR", pont: "PT", viaduc: "VI", tunnel: "TU" }[type]
    const nom =
      type === "buse"
        ? `Buse PK ${pkTexte(pk)}`
        : type === "dalot"
          ? `Dalot PK ${pkTexte(pk)}`
          : type === "mur_soutenement"
            ? `Mur de soutènement PK ${pkTexte(pk)}`
            : type === "tranchee"
              ? `Tranchée PK ${pkTexte(pk)}`
              : `Pont-rail PK ${pkTexte(pk)} (ruisseau)`
    definitions.push({
      code: `OA-${prefixe}-${String(Math.round(pk * 10)).padStart(4, "0")}`,
      nom,
      type,
      pk,
      longueurM:
        type === "buse" ? entier(alea, 12, 30) : type === "dalot" ? entier(alea, 6, 18) : type === "pont" ? entier(alea, 18, 45) : entier(alea, 60, 260),
      materiau:
        type === "buse"
          ? choisir(alea, ["Buse métallique ondulée", "Buse béton armé"])
          : type === "mur_soutenement"
            ? choisir(alea, ["Gabions", "Béton armé", "Maçonnerie de moellons"])
            : type === "tranchee"
              ? "Latérite et roche altérée"
              : "Béton armé",
      franchissement: type === "pont" ? "Ruisseau (nom à confirmer)" : undefined,
      cotation: alea() < 0.55 ? "1" : "2",
    })
  }
  definitions.sort((a, b) => a.pk - b.pk)

  const DESORDRES: Record<Doc<"infraOuvrages">["type"], { partie: string; description: string }[]> = {
    pont: [
      { partie: "Tablier", description: "Corrosion des armatures en sous-face, éclatement du béton d'enrobage" },
      { partie: "Piles", description: "Affouillement en pied de pile côté amont" },
      { partie: "Appareils d'appui", description: "Appareils d'appui en élastomère écrasés et décalés" },
      { partie: "Culées", description: "Fissures sur le mur en retour de culée" },
      { partie: "Garde-corps", description: "Garde-corps corrodé, fixations manquantes" },
    ],
    viaduc: [
      { partie: "Travées", description: "Fissuration de flexion en milieu de travée" },
      { partie: "Piles", description: "Épaufrures en tête de pile" },
      { partie: "Joints", description: "Joints de dilatation obstrués" },
    ],
    tunnel: [{ partie: "Voûte", description: "Infiltrations et concrétions" }],
    buse: [
      { partie: "Corps de buse", description: "Ovalisation et corrosion du radier" },
      { partie: "Têtes", description: "Érosion des têtes et du perré" },
      { partie: "Écoulement", description: "Buse partiellement obstruée par des débris végétaux" },
    ],
    dalot: [
      { partie: "Piédroits", description: "Fissures et armatures apparentes" },
      { partie: "Radier", description: "Affouillement en sortie aval" },
    ],
    mur_soutenement: [
      { partie: "Parement", description: "Fissures verticales et bombement du parement" },
      { partie: "Barbacanes", description: "Barbacanes obstruées, poussée hydrostatique" },
      { partie: "Fondation", description: "Déchaussement en pied de mur" },
    ],
    tranchee: [
      { partie: "Talus", description: "Ravinement et chutes de blocs" },
      { partie: "Fossés", description: "Fossés de pied comblés" },
    ],
  }

  const historiqueCotation = (finale: Cotation): Cotation[] => {
    switch (finale) {
      case "3U":
        return ["2E", "3", "3U"]
      case "3":
        return ["2", "2E", "3"]
      case "2E":
        return ["2", "2E"]
      case "2":
        return alea() < 0.4 ? ["1", "2"] : ["2"]
      default:
        return alea() < 0.3 ? ["1", "1"] : ["1"]
    }
  }
  const nbDesordres: Record<Cotation, number> = { "1": 0, "2": 1, "2E": 2, "3": 3, "3U": 3 }

  type InspectionPrevue = {
    ouvrageIndex: number
    type: TypeInspection
    date: number
    cotationAvant: Cotation
    cotationProposee: Cotation
    validee: boolean
  }
  const inspectionsPrevues: InspectionPrevue[] = []
  const ouvrages: Doc<"infraOuvrages">[] = []
  const enRetardForce = new Set(["OA-MU-266", "OA-TR-296", "OA-PT-224"])

  for (const [index, def] of definitions.entries()) {
    const historique = historiqueCotation(def.cotation)
    const typeFinal: TypeInspection =
      def.cotation === "3U"
        ? "inspection_exceptionnelle"
        : def.cotation === "1" || def.cotation === "2"
          ? alea() < 0.5
            ? "visite_annuelle"
            : "inspection_detaillee"
          : "inspection_detaillee"
    const surveillance = surveillanceIqoa(def.cotation, typeFinal)
    const periodeMs = surveillance.periodiciteMois * 30 * JOUR
    const enRetard = enRetardForce.has(def.code) || (index % 9 === 4 && def.cotation !== "3U")
    const derniere = enRetard
      ? T - periodeMs - entier(alea, 15, 90) * JOUR
      : T - Math.floor(entre(alea, 0.1, 0.85) * periodeMs)
    let date = derniere
    for (let k = historique.length - 1; k >= 0; k -= 1) {
      inspectionsPrevues.push({
        ouvrageIndex: index,
        type: k === historique.length - 1 ? typeFinal : "inspection_detaillee",
        date,
        cotationAvant: historique[k - 1] ?? historique[0]!,
        cotationProposee: historique[k]!,
        validee: true,
      })
      date -= entier(alea, 5, 14) * 30 * JOUR
    }
    const doc = {
      code: def.code,
      nom: def.nom,
      type: def.type,
      pk: def.pk,
      sectionId: sectionDe(def.pk)?._id,
      longueurM: def.longueurM,
      materiau: def.materiau,
      anneeConstruction: def.pk < 182 ? 1978 : def.pk < 338 ? 1983 : 1986,
      franchissement: def.franchissement,
      cotation: def.cotation,
      surveillanceRenforcee: surveillance.surveillanceRenforcee,
      periodiciteMois: surveillance.periodiciteMois,
      derniereInspectionLe: derniere,
      prochaineInspectionLe: ajouterMois(derniere, surveillance.periodiciteMois),
      majLe: derniere,
    }
    const id = await ctx.db.insert("infraOuvrages", doc)
    ouvrages.push({ _id: id, _creationTime: T, ...doc })
  }
  /* Deux brouillons récents, en attente de validation. */
  for (const code of ["OA-PT-148", "OA-TR-412"]) {
    const index = ouvrages.findIndex((o) => o.code === code)
    if (index < 0) continue
    const o = ouvrages[index]!
    inspectionsPrevues.push({
      ouvrageIndex: index,
      type: "inspection_exceptionnelle",
      date: T - entier(alea, 2, 6) * JOUR,
      cotationAvant: o.cotation,
      cotationProposee: o.cotation === "2E" && code === "OA-PT-148" ? "3" : o.cotation,
      validee: false,
    })
  }
  inspectionsPrevues.sort((a, b) => a.date - b.date)
  let nbInspections = 0
  for (const prevue of inspectionsPrevues) {
    const o = ouvrages[prevue.ouvrageIndex]!
    const inspecteur = auteur("agent_ouvrages_ponts")
    const valideur = prevue.validee ? auteur("responsable_prn") : undefined
    const numero = await numeros.suivant("INS", prevue.date)
    const pool = DESORDRES[o.type]
    const desordres = Array.from({ length: Math.min(nbDesordres[prevue.cotationProposee], pool.length) }, (_, k) => {
      const d = pool[k]!
      const gravite: Gravite =
        prevue.cotationProposee === "3U" ? (k === 0 ? "critique" : "elevee")
        : prevue.cotationProposee === "3" ? (k === 0 ? "elevee" : "moyenne")
        : prevue.cotationProposee === "2E" ? "moyenne"
        : "faible"
      return { ...d, gravite }
    })
    const valideLe = prevue.validee ? prevue.date + entier(alea, 3, 15) * JOUR : undefined
    const doc = {
      numero,
      ouvrageId: o._id,
      type: prevue.type,
      dateInspection: prevue.date,
      inspecteurId: inspecteur?._id,
      inspecteurNom:
        nomAgent(inspecteur) ?? `Brigade ouvrages d'art, district de ${district(o.pk)}`,
      constats:
        desordres.length === 0
          ? `Ouvrage en bon état apparent, aucun désordre structurel relevé. ${MENTION}`
          : `${desordres.length} désordre(s) relevé(s) ; ${LIBELLES_COTATION[prevue.cotationProposee]}. ${MENTION}`,
      desordres,
      cotationAvant: prevue.cotationAvant,
      cotationProposee: prevue.cotationProposee,
      recommandations:
        prevue.cotationProposee === "3U"
          ? "Limitation de vitesse immédiate, étaiement provisoire et étude de renforcement en urgence."
          : prevue.cotationProposee === "3"
            ? "Programmer les travaux de réparation dans l'année ; surveillance semestrielle."
            : prevue.cotationProposee === "2E"
              ? "Surveillance renforcée annuelle ; entretien spécialisé à programmer."
              : "Entretien courant.",
      statut: prevue.validee ? ("validee" as const) : ("brouillon" as const),
      valideParId: valideur?._id,
      valideLe: valideLe !== undefined ? Math.min(valideLe, T) : undefined,
      creeLe: prevue.date,
    }
    const id = await ctx.db.insert("infraInspections", doc)
    nbInspections += 1
    await evenement("inspection", id, "inspection_redigee", `Inspection ${numero} rédigée`, prevue.date, inspecteur?._id, MENTION)
    await evenement("ouvrage", o._id, "ouvrage_inspection_redigee", `Inspection ${numero}, cotation proposée ${prevue.cotationProposee}`, prevue.date, inspecteur?._id)
    if (doc.valideLe !== undefined) {
      await evenement("inspection", id, "inspection_validee", "Inspection validée", doc.valideLe, valideur?._id)
      await evenement(
        "ouvrage",
        o._id,
        "ouvrage_cotation",
        prevue.cotationAvant === prevue.cotationProposee
          ? `Cotation ${prevue.cotationProposee} confirmée (${numero})`
          : `Cotation ${prevue.cotationAvant} → ${prevue.cotationProposee} (${numero})`,
        doc.valideLe,
        valideur?._id
      )
    }
  }

  /* ── Équipements ── */
  type EquipementDef = Omit<Doc<"infraEquipements">, "_id" | "_creationTime" | "sectionId" | "majLe" | "etat" | "derniereMaintenanceLe">
  const equipementsDefs: EquipementDef[] = []
  const garesSignal = ["NTM", "NDJ", "OTO", "BOO", "IVI", "LTV", "MOA", "FCV"]
  const garesAvecSignaux = gares.filter((g) => garesSignal.includes(g.code))
  const garesSig = garesAvecSignaux.length >= 4 ? garesAvecSignaux : gares.slice(1, 9)
  for (const g of garesSig) {
    equipementsDefs.push({
      code: `SIG-${g.code}-E`,
      libelle: `Signal d'entrée de ${g.nom}`,
      categorie: "signalisation",
      type: "Signal d'entrée",
      pk: pk1(Math.max(0, g.pk - 1.1)),
      alimentation: "Batterie et panneau solaire",
      periodiciteJours: 90,
      notes: MENTION,
    })
    equipementsDefs.push({
      code: `SIG-${g.code}-S`,
      libelle: `Signal de sortie de ${g.nom}`,
      categorie: "signalisation",
      type: "Signal de sortie",
      pk: pk1(Math.min(longueur, g.pk + 0.6)),
      alimentation: "Batterie et panneau solaire",
      periodiciteJours: 90,
      notes: MENTION,
    })
  }
  const garePlusProche = (pk: number) =>
    gares.reduce((meilleure, g) => (Math.abs(g.pk - pk) < Math.abs(meilleure.pk - pk) ? g : meilleure), gares[0]!)
  const typesPn = [
    ...Array<string>(6).fill("PN automatique (signalisation lumineuse et sonore)"),
    ...Array<string>(7).fill("PN gardé"),
    ...Array<string>(12).fill("PN à croix de Saint-André"),
  ]
  const pksPn = Array.from({ length: typesPn.length }, () => pk1(entre(alea, 2, longueur - 2))).sort((a, b) => a - b)
  for (const [k, pk] of pksPn.entries()) {
    const type = typesPn[(k * 7) % typesPn.length]!
    equipementsDefs.push({
      code: `PN-${String(k + 1).padStart(3, "0")}`,
      libelle: `PN ${k + 1} de ${garePlusProche(pk).nom} (PK ${pkTexte(pk)})`,
      categorie: "passage_niveau",
      type,
      pk,
      alimentation: type.startsWith("PN automatique") ? "Réseau et batterie de secours" : undefined,
      periodiciteJours: type.startsWith("PN automatique") ? 30 : type === "PN gardé" ? 90 : 180,
      notes: MENTION,
    })
  }
  for (let pk = 10, k = 1; pk < longueur; pk += 52, k += 1) {
    const g = garePlusProche(pk)
    equipementsDefs.push({
      code: `RV-${String(k).padStart(2, "0")}`,
      libelle: `Relais radio sol-train VHF de ${g.nom}`,
      categorie: "telecoms",
      type: "Relais radio VHF sol-train",
      pk: pk1(pk),
      alimentation: "Générateur solaire 2 kWc et batteries",
      periodiciteJours: 180,
      notes: MENTION,
    })
  }
  const bornesDistricts = [0, 182, 338, 484, 619, longueur].filter((p, i, l) => p <= longueur && (i === 0 || p > l[i - 1]!))
  for (let k = 0; k < bornesDistricts.length - 1; k += 1) {
    const debut = bornesDistricts[k]!
    const fin = bornesDistricts[k + 1]!
    equipementsDefs.push({
      code: `FO-${k + 1}`,
      libelle: `Fibre optique ${garePlusProche(debut).nom} – ${garePlusProche(fin).nom}`,
      categorie: "telecoms",
      type: "Tronçon de fibre optique",
      pk: debut,
      pkFin: fin,
      periodiciteJours: 365,
      notes: MENTION,
    })
  }
  for (const g of gares.filter((_, i) => i % 3 === 1).slice(0, 8)) {
    equipementsDefs.push({
      code: `GS-${g.code}`,
      libelle: `Générateur solaire de la gare de ${g.nom}`,
      categorie: "telecoms",
      type: "Générateur solaire",
      pk: g.pk,
      alimentation: "Panneaux 3 kWc, parc batteries 48 V",
      periodiciteJours: 180,
      notes: MENTION,
    })
  }
  const equipements: Doc<"infraEquipements">[] = []
  for (const [k, def] of equipementsDefs.entries()) {
    const etat: Doc<"infraEquipements">["etat"] =
      k % 23 === 7 ? "hors_service" : k % 11 === 5 ? "degrade" : "en_service"
    const derniere = T - Math.floor(entre(alea, 0.05, 1.35) * def.periodiciteJours) * JOUR
    const doc = { ...def, sectionId: sectionDe(def.pk)?._id, etat, derniereMaintenanceLe: derniere, majLe: derniere }
    const id = await ctx.db.insert("infraEquipements", doc)
    equipements.push({ _id: id, _creationTime: T, ...doc })
    const roleEq: RoleAuteur = def.categorie === "telecoms" ? "technicien_telecoms" : "technicien_signalisation"
    await evenement("equipement", id, "equipement_maintenance", "Maintenance préventive réalisée", derniere, auteurId(roleEq), MENTION)
    if (etat !== "en_service") {
      await evenement(
        "equipement",
        id,
        "equipement_etat",
        etat === "hors_service" ? "État en service → hors service" : "État en service → dégradé",
        derniere + entier(alea, 1, 20) * JOUR,
        auteurId(roleEq)
      )
    }
  }

  /* ── Anomalies ── */
  const DESCRIPTIONS: Record<Doc<"infraAnomalies">["categorie"], string[]> = {
    rail: [
      "Rail cassé, cassure franche file gauche",
      "Fissure horizontale dans l'âme du rail au droit d'une éclisse",
      "Usure latérale prononcée du rail extérieur en courbe",
      "Éclisse fissurée, deux boulons manquants",
      "Défaut de soudure détecté au contrôle par ultrasons",
    ],
    traverses: [
      "Six traverses bois pourries consécutives",
      "Traverses bois fendues, tirefonds arrachés",
      "Attaches élastiques manquantes sur une vingtaine de mètres",
      "Traverse béton bibloc fissurée au droit de l'entretoise",
    ],
    ballast: [
      "Ballast pollué, remontées de boue sur 80 m",
      "Manque de ballast en épaulement côté piste",
      "Danse de traverses au passage des trains minéraliers",
    ],
    geometrie: [
      "Défaut de nivellement longitudinal ressenti en cabine",
      "Gauche excessif relevé à l'auscultation",
      "Défaut de dressage en sortie de courbe",
    ],
    talus: [
      "Glissement de talus en déblai, terres sur la piste",
      "Ravinement du remblai après de fortes pluies",
      "Chute de blocs sur la voie depuis la tranchée",
      "Affaissement de plateforme en pied de remblai",
    ],
    ouvrage: [
      "Affouillement en pied de pile signalé par la brigade",
      "Garde-corps endommagé",
      "Fissures sur le mur en retour de culée",
      "Buse obstruée par des débris végétaux",
    ],
    signalisation: [
      "Signal éteint, lampe hors d'usage",
      "Feu jaune non fonctionnel",
      "Câble de signalisation sectionné",
    ],
    passage_niveau: [
      "Barrière du PN bloquée en position haute",
      "Sonnerie du PN inopérante",
      "Panneau croix de Saint-André arraché",
      "Platelage du PN dégradé",
    ],
    telecoms: [
      "Perte de liaison radio sol-train sur la zone",
      "Batteries du relais en fin de vie",
      "Coupure de fibre optique par un engin de terrassement",
      "Panneaux solaires du relais encrassés",
    ],
    vegetation: [
      "Végétation empiétant sur le gabarit",
      "Arbre tombé en travers de la voie",
      "Visibilité du PN masquée par la végétation",
    ],
    autre: [
      "Clôture de l'emprise ferroviaire arrachée",
      "Dépôt sauvage dans l'emprise",
      "Passage piétonnier sauvage sur le ballast",
    ],
  }
  const TRAITEMENTS: Record<Doc<"infraAnomalies">["categorie"], string> = {
    rail: "Coupon de rail posé, soudure aluminothermique réalisée et contrôlée.",
    traverses: "Traverses remplacées, attaches reprises et bourrage manuel.",
    ballast: "Dégarnissage localisé, apport de ballast neuf et bourrage.",
    geometrie: "Relevage et dressage à la bourreuse, contrôle au wagon d'auscultation.",
    talus: "Purge des terres, reprofilage du talus et drainage provisoire.",
    ouvrage: "Nettoyage, protection provisoire et suivi par la brigade ouvrages.",
    signalisation: "Composant remplacé, essais de bon fonctionnement concluants.",
    passage_niveau: "Mécanisme réparé et essais de fermeture réalisés.",
    telecoms: "Équipement remplacé, liaison rétablie et testée.",
    vegetation: "Débroussaillage et abattage réalisés par la brigade.",
    autre: "Remise en état réalisée.",
  }
  const roleTraitant = (categorie: Doc<"infraAnomalies">["categorie"]): RoleAuteur =>
    categorie === "signalisation" || categorie === "passage_niveau"
      ? "technicien_signalisation"
      : categorie === "telecoms"
        ? "technicien_telecoms"
        : categorie === "ouvrage"
          ? "agent_ouvrages_ponts"
          : "agent_voie"

  type AnomalieDef = {
    pk: number
    categorie: Doc<"infraAnomalies">["categorie"]
    gravite: Gravite
    description: string
    signaleLe: number
    statut: StatutAnomalie
    ouvrageId?: Id<"infraOuvrages">
    equipementId?: Id<"infraEquipements">
  }
  const defsAnomalies: AnomalieDef[] = []
  const pontUrgence = ouvrages.find((o) => o.cotation === "3U")
  /* Trois anomalies qui portent les LTV actives. */
  const talusPk = Math.min(296.4, longueur - 1)
  defsAnomalies.push({ pk: talusPk, categorie: "talus", gravite: "critique", description: "Glissement de talus en déblai après de fortes pluies, terres jusqu'au rail", signaleLe: T - 12 * JOUR - 5 * HEURE, statut: "prise_en_charge" })
  if (pontUrgence) {
    defsAnomalies.push({ pk: pontUrgence.pk, categorie: "ouvrage", gravite: "elevee", description: `Affouillement en pied de pile du ${pontUrgence.nom}, appuis à surveiller`, signaleLe: T - 41 * JOUR, statut: "prise_en_charge", ouvrageId: pontUrgence._id })
  }
  const geoPk = Math.min(431.5, longueur - 4)
  defsAnomalies.push({ pk: geoPk, categorie: "geometrie", gravite: "elevee", description: "Défauts de nivellement longitudinal relevés à l'auscultation, sensation de galop en cabine", signaleLe: T - 23 * JOUR, statut: "prise_en_charge" })

  const signaux = equipements.filter((e) => e.categorie === "signalisation")
  const pns = equipements.filter((e) => e.categorie === "passage_niveau")
  const telecoms = equipements.filter((e) => e.categorie === "telecoms")
  while (defsAnomalies.length < 60) {
    const categorie = pondere(alea, {
      rail: 8, traverses: 10, ballast: 7, geometrie: 6, talus: 6, ouvrage: 5,
      signalisation: 5, passage_niveau: 6, telecoms: 5, vegetation: 6, autre: 3,
    } as Record<Doc<"infraAnomalies">["categorie"], number>)
    const age = Math.floor(entre(alea, 0, 180) * JOUR + entre(alea, 0, 12) * HEURE)
    const signaleLe = T - age
    const ageJours = age / JOUR
    const gravite = pondere(alea, { critique: 8, elevee: 22, moyenne: 40, faible: 30 } as Record<Gravite, number>)
    let statut: StatutAnomalie
    if (ageJours < 3) statut = pondere(alea, { signalee: 7, prise_en_charge: 3 } as Record<StatutAnomalie, number>)
    else if (ageJours < 20) statut = pondere(alea, { signalee: 25, prise_en_charge: 40, traitee: 25, rejetee: 10 } as Record<StatutAnomalie, number>)
    else if (ageJours < 60) statut = pondere(alea, { prise_en_charge: 20, traitee: 20, close: 50, rejetee: 10 } as Record<StatutAnomalie, number>)
    else statut = pondere(alea, { prise_en_charge: 5, traitee: 5, close: 80, rejetee: 10 } as Record<StatutAnomalie, number>)
    if (gravite === "critique" && ageJours > 5 && (statut === "signalee" || statut === "prise_en_charge")) {
      statut = "close"
    }
    let pk = pk1(entre(alea, 1, longueur - 1))
    let ouvrageId: Id<"infraOuvrages"> | undefined
    let equipementId: Id<"infraEquipements"> | undefined
    if (categorie === "ouvrage" && ouvrages.length > 0) {
      const o = choisir(alea, ouvrages)
      ouvrageId = o._id
      pk = o.pk
    } else if (categorie === "signalisation" && signaux.length > 0) {
      const e = choisir(alea, signaux)
      equipementId = e._id
      pk = e.pk
    } else if (categorie === "passage_niveau" && pns.length > 0) {
      const e = choisir(alea, pns)
      equipementId = e._id
      pk = e.pk
    } else if (categorie === "telecoms" && telecoms.length > 0) {
      const e = choisir(alea, telecoms.filter((t) => t.pkFin === undefined))
      equipementId = e._id
      pk = e.pk
    }
    defsAnomalies.push({
      pk,
      categorie,
      gravite,
      description: choisir(alea, DESCRIPTIONS[categorie]),
      signaleLe,
      statut,
      ouvrageId,
      equipementId,
    })
  }
  /* Une anomalie critique toute récente, pour l'écran d'accueil. */
  defsAnomalies[defsAnomalies.length - 1] = {
    pk: pk1(Math.min(527.8, longueur - 2)),
    categorie: "rail",
    gravite: "critique",
    description: "Rail cassé, cassure franche file gauche, signalée par le conducteur du train minéralier",
    signaleLe: T - 3 * HEURE,
    statut: "signalee",
  }
  defsAnomalies.sort((a, b) => a.signaleLe - b.signaleLe)

  const anomalies: Doc<"infraAnomalies">[] = []
  for (const def of defsAnomalies) {
    const section = sectionDe(def.pk)
    const signaleur = auteur(alea() < 0.55 ? "cantonnier" : "agent_voie")
    const traitant = auteur(roleTraitant(def.categorie))
    const cloreur = auteur("responsable_prn")
    const delai = DELAI_GRAVITE_MS[def.gravite]
    const age = T - def.signaleLe
    const priseLe = def.signaleLe + Math.min(age * 0.2, entre(alea, 0.05, 0.3) * delai)
    const traiteLe = def.signaleLe + Math.min(age * 0.7, entre(alea, 0.3, 1.3) * delai)
    const closLe = traiteLe + Math.min((T - traiteLe) * 0.8, entier(alea, 1, 6) * JOUR)
    const avance = (cible: StatutAnomalie[]) => cible.includes(def.statut)
    const numero = await numeros.suivant("AN", def.signaleLe)
    const doc = {
      numero,
      pk: def.pk,
      sectionId: section?._id,
      categorie: def.categorie,
      gravite: def.gravite,
      description: def.description,
      photoIds: [] as Id<"_storage">[],
      ouvrageId: def.ouvrageId,
      equipementId: def.equipementId,
      brigade: section?.brigade,
      signaleParId: signaleur?._id,
      signaleLe: def.signaleLe,
      echeanceLe: def.signaleLe + delai,
      statut: def.statut,
      priseEnChargeParId: avance(["prise_en_charge", "traitee", "close"]) ? traitant?._id : undefined,
      priseEnChargeLe: avance(["prise_en_charge", "traitee", "close"]) ? priseLe : undefined,
      traitement: avance(["traitee", "close"]) ? TRAITEMENTS[def.categorie] : undefined,
      traiteParId: avance(["traitee", "close"]) ? traitant?._id : undefined,
      traiteLe: avance(["traitee", "close"]) ? traiteLe : undefined,
      closParId: def.statut === "close" ? cloreur?._id : undefined,
      closLe: def.statut === "close" ? closLe : undefined,
      motifRejet:
        def.statut === "rejetee"
          ? choisir(alea, [
              "Doublon d'un signalement déjà enregistré",
              "Constat non confirmé lors de la visite de contrôle",
              "Hors emprise ferroviaire, transmis au gestionnaire concerné",
            ])
          : undefined,
      majLe: def.statut === "close" ? closLe : def.statut === "traitee" ? traiteLe : def.signaleLe,
    }
    const id = await ctx.db.insert("infraAnomalies", doc)
    anomalies.push({ _id: id, _creationTime: T, ...doc })
    await evenement("anomalie", id, "anomalie_signalee", `Anomalie ${LIBELLES_GRAVITE[def.gravite].toLowerCase()} signalée au PK ${pkTexte(def.pk)}`, def.signaleLe, signaleur?._id, `${def.description}. ${MENTION}`)
    if (doc.priseEnChargeLe !== undefined) {
      await evenement("anomalie", id, "anomalie_prise_en_charge", "Prise en charge par la brigade", doc.priseEnChargeLe, traitant?._id)
    }
    if (doc.traiteLe !== undefined) {
      await evenement("anomalie", id, "anomalie_traitee", "Anomalie traitée, en attente de clôture", doc.traiteLe, traitant?._id, doc.traitement)
    }
    if (doc.closLe !== undefined) {
      await evenement("anomalie", id, "anomalie_close", "Anomalie close après contrôle", doc.closLe, cloreur?._id)
    }
    if (def.statut === "rejetee") {
      await evenement("anomalie", id, "anomalie_rejetee", "Anomalie rejetée", def.signaleLe + entier(alea, 1, 4) * JOUR, traitant?._id, doc.motifRejet)
    }
  }

  /* ── LTV ── */
  let nbLtv = 0
  const poserLtvSeed = async (params: {
    pkDebut: number
    pkFin: number
    vitesseKmh: number
    motif: string
    debutLe: number
    finPrevueLe?: number
    leveeLe?: number
    motifLevee?: string
    anomalie?: Doc<"infraAnomalies">
  }) => {
    const recoupees = sectionsRecoupees(sections, { debut: params.pkDebut, fin: params.pkFin })
    if (recoupees.length === 0) return
    const vitesseNominaleKmh = Math.min(...recoupees.map((s) => s.vitesseNominaleKmh))
    const vitesseKmh = Math.min(params.vitesseKmh, vitesseNominaleKmh - 10)
    const poseur = auteur(params.anomalie?.categorie === "ouvrage" ? "agent_ouvrages_ponts" : "agent_voie")
    const leveur = params.leveeLe !== undefined ? auteur("agent_voie") : undefined
    const numero = await numeros.suivant("LTV", params.debutLe)
    const doc = {
      numero,
      pkDebut: params.pkDebut,
      pkFin: params.pkFin,
      sectionId: sectionDe(params.pkDebut)?._id,
      vitesseKmh,
      vitesseNominaleKmh,
      motif: params.motif,
      anomalieId: params.anomalie?._id,
      statut: params.leveeLe !== undefined ? ("levee" as const) : ("active" as const),
      debutLe: params.debutLe,
      finPrevueLe: params.finPrevueLe,
      poseeParId: poseur?._id,
      leveeLe: params.leveeLe,
      leveeParId: leveur?._id,
      motifLevee: params.motifLevee,
      majLe: params.leveeLe ?? params.debutLe,
    }
    const id = await ctx.db.insert("infraLtv", doc)
    nbLtv += 1
    await evenement("ltv", id, "ltv_posee", `LTV à ${vitesseKmh} km/h posée du PK ${pkTexte(params.pkDebut)} au PK ${pkTexte(params.pkFin)}`, params.debutLe, poseur?._id, `${params.motif}. ${MENTION}`)
    if (params.leveeLe !== undefined) {
      await evenement("ltv", id, "ltv_levee", `LTV levée, retour à ${vitesseNominaleKmh} km/h`, params.leveeLe, leveur?._id, params.motifLevee)
    }
    if (params.anomalie) {
      await ctx.db.patch(params.anomalie._id, { ltvId: id })
      await evenement("anomalie", params.anomalie._id, "anomalie_ltv_liee", `Couverte par la LTV ${numero} à ${vitesseKmh} km/h`, params.debutLe, poseur?._id)
    }
  }
  const anomalieTalus = anomalies.find((a) => a.categorie === "talus" && a.gravite === "critique" && a.statut === "prise_en_charge")
  const anomaliePont = pontUrgence ? anomalies.find((a) => a.ouvrageId === pontUrgence._id && a.statut === "prise_en_charge") : undefined
  const anomalieGeo = anomalies.find((a) => a.categorie === "geometrie" && a.pk === geoPk)
  await poserLtvSeed({
    pkDebut: pk1(talusPk - 0.4),
    pkFin: pk1(talusPk + 0.8),
    vitesseKmh: 30,
    motif: "Glissement de talus en déblai : circulation à vue en attendant le confortement",
    debutLe: (anomalieTalus?.signaleLe ?? T - 12 * JOUR) + 2 * HEURE,
    finPrevueLe: T + 25 * JOUR,
    anomalie: anomalieTalus,
  })
  if (pontUrgence) {
    await poserLtvSeed({
      pkDebut: pk1(pontUrgence.pk - 0.3),
      pkFin: pk1(pontUrgence.pk + 0.3),
      vitesseKmh: 20,
      motif: `${pontUrgence.nom} coté 3U : réduction des sollicitations dynamiques avant renforcement`,
      debutLe: (anomaliePont?.signaleLe ?? T - 40 * JOUR) + 6 * HEURE,
      finPrevueLe: T + 90 * JOUR,
      anomalie: anomaliePont,
    })
  }
  await poserLtvSeed({
    pkDebut: pk1(geoPk - 0.5),
    pkFin: pk1(geoPk + 3),
    vitesseKmh: 40,
    motif: "Défauts de nivellement : limitation dans l'attente du relevage mécanisé",
    debutLe: (anomalieGeo?.signaleLe ?? T - 22 * JOUR) + 4 * HEURE,
    finPrevueLe: T - 3 * JOUR,
    anomalie: anomalieGeo,
  })
  const motifsLtv = [
    ["Rail cassé : coupon provisoire éclissé", "Soudure définitive réalisée et contrôlée"],
    ["Travaux de bourrage mécanisé", "Stabilisation de la voie obtenue après passage de 20 000 t"],
    ["Chantier de pose de traverses béton", "Voie stabilisée, contrôle géométrique conforme"],
    ["Inondation de la plateforme après orage", "Décrue constatée, plateforme contrôlée"],
    ["Remplacement de rails usés en courbe", "Rails neufs posés et meulés"],
    ["Défaut de géométrie relevé par l'auscultation", "Relevage et dressage réalisés"],
    ["Travaux sur ouvrage hydraulique", "Buse remplacée, remblai compacté"],
    ["Danse de traverses sur zone boueuse", "Assainissement et ballast neuf"],
  ] as const
  const closesVoie = anomalies.filter(
    (a) => a.statut === "close" && (a.categorie === "rail" || a.categorie === "geometrie" || a.categorie === "traverses")
  )
  for (const [k, [motif, motifLevee]] of motifsLtv.entries()) {
    const liee = closesVoie[k]
    const centre = liee?.pk ?? pk1(entre(alea, 5, longueur - 5))
    const pkDebut = pk1(Math.max(0, centre - entre(alea, 0.2, 1)))
    const pkFin = pk1(Math.min(longueur, pkDebut + entre(alea, 0.4, 2.4)))
    const debutLe = liee ? liee.signaleLe + 3 * HEURE : T - entier(alea, 20, 175) * JOUR
    const leveeLe = Math.min(T - JOUR, liee?.closLe ?? debutLe + entier(alea, 3, 30) * JOUR)
    await poserLtvSeed({
      pkDebut,
      pkFin,
      vitesseKmh: choisir(alea, [30, 40, 50]),
      motif,
      debutLe,
      finPrevueLe: debutLe + 21 * JOUR,
      leveeLe: Math.max(leveeLe, debutLe + HEURE),
      motifLevee,
      anomalie: k < 3 ? liee : undefined,
    })
  }

  /* ── Programme PRN ── */
  type ChantierDef = {
    code: string
    libelle: string
    description: string
    nature: Doc<"infraChantiers">["nature"]
    pkDebut: number
    pkFin: number
    entreprise: string
    maitreOeuvre: string
    budgetMd: number
    financements: [Bailleur, number][]
    unite: string
    quantite: number
    statut: Doc<"infraChantiers">["statut"]
    debutJours: number
    dureeJours: number
    reprisePct: number
    mensuelPct: number
    moisActifs: number
    enAttente: boolean
    lots: { code: string; libelle: string; entreprise: string; part: number; pkDebut: number; pkFin: number }[]
    jalons: { libelle: string; decalageJours: number; atteintDecalage?: number; bailleur?: Bailleur }[]
  }
  const borne = (pk: number) => Math.min(pk, longueur)
  const MD = 1_000_000_000
  const defsChantiers: ChantierDef[] = [
    {
      code: "PRN-01", libelle: "Traverses béton bibloc Booué – Lastoursville",
      description: "Substitution des traverses bois par des traverses béton bibloc et attaches élastiques, avec relevage de la voie.",
      nature: "traverses_beton", pkDebut: 338, pkFin: borne(484), entreprise: "Groupement voie Ogooué (synthétique)", maitreOeuvre: "Direction PRN SETRAG",
      budgetMd: 62, financements: [["afd", 25], ["sfi", 15], ["meridiam", 12], ["etat", 10]], unite: "traverses", quantite: 240_000,
      statut: "en_cours", debutJours: -820, dureeJours: 1300, reprisePct: 40, mensuelPct: 2.5, moisActifs: 6, enAttente: true,
      lots: [
        { code: "L1", libelle: "Booué – Mouyabi", entreprise: "Entreprise A (synthétique)", part: 0.49, pkDebut: 338, pkFin: borne(411) },
        { code: "L2", libelle: "Mouyabi – Lastoursville", entreprise: "Entreprise B (synthétique)", part: 0.51, pkDebut: borne(411), pkFin: borne(484) },
      ],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -820, atteintDecalage: -815 },
        { libelle: "50 % des traverses du lot 1 posées — tranche 2", decalageJours: -20, bailleur: "afd" },
        { libelle: "100 000 traverses posées cumulées", decalageJours: 60, bailleur: "sfi" },
        { libelle: "Réception provisoire", decalageJours: 480 },
      ],
    },
    {
      code: "PRN-02", libelle: "Renouvellement de voie Lastoursville – Moanda",
      description: "Renouvellement complet rail, traverses et ballast, avec reprise de la plateforme sur les zones instables.",
      nature: "renouvellement_voie", pkDebut: borne(484), pkFin: borne(619), entreprise: "Consortium rail Haut-Ogooué (synthétique)", maitreOeuvre: "Bureau de contrôle international (synthétique)",
      budgetMd: 48, financements: [["proparco", 18], ["ue", 12], ["etat", 10], ["setrag", 8]], unite: "km", quantite: 135,
      statut: "en_cours", debutJours: -610, dureeJours: 1100, reprisePct: 25, mensuelPct: 2.2, moisActifs: 6, enAttente: false,
      lots: [
        { code: "L1", libelle: "Lastoursville – Lifouta", entreprise: "Entreprise C (synthétique)", part: 0.48, pkDebut: borne(484), pkFin: borne(549) },
        { code: "L2", libelle: "Lifouta – Moanda", entreprise: "Entreprise D (synthétique)", part: 0.52, pkDebut: borne(549), pkFin: borne(619) },
      ],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -610, atteintDecalage: -606 },
        { libelle: "Base travaux de Doumé opérationnelle", decalageJours: -520, atteintDecalage: -530 },
        { libelle: "35 km renouvelés — tranche Proparco", decalageJours: -40, atteintDecalage: -35, bailleur: "proparco" },
        { libelle: "Rapport environnemental et social semestriel", decalageJours: -10, bailleur: "ue" },
        { libelle: "Fin des travaux du lot 1", decalageJours: 120 },
      ],
    },
    {
      code: "PRN-03", libelle: "Ballastage et relevage Ndjolé – Booué",
      description: "Apport de ballast, relevage et bourrage mécanisé sur la section Ndjolé – Booué.",
      nature: "ballast", pkDebut: borne(182), pkFin: borne(338), entreprise: "Entreprise E (synthétique)", maitreOeuvre: "Direction PRN SETRAG",
      budgetMd: 21, financements: [["afd", 9], ["meridiam", 6], ["setrag", 6]], unite: "m³", quantite: 180_000,
      statut: "receptionne", debutJours: -720, dureeJours: 640, reprisePct: 70, mensuelPct: 7.5, moisActifs: 4, enAttente: false,
      lots: [],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -720, atteintDecalage: -716 },
        { libelle: "Fin du relevage Ndjolé – Lopé", decalageJours: -200, atteintDecalage: -190 },
        { libelle: "Réception des travaux", decalageJours: -60, atteintDecalage: -55, bailleur: "afd" },
      ],
    },
    {
      code: "PRN-04", libelle: "Réhabilitation des ouvrages d'art",
      description: "Réparation et renforcement des ouvrages d'art cotés 2E à 3U, protection contre l'affouillement.",
      nature: "ouvrage_art", pkDebut: 0, pkFin: longueur, entreprise: "Groupement ouvrages Gabon (synthétique)", maitreOeuvre: "Bureau d'études ouvrages (synthétique)",
      budgetMd: 26, financements: [["ue", 14], ["etat", 8], ["setrag", 4]], unite: "ouvrages", quantite: 24,
      statut: "en_cours", debutJours: -540, dureeJours: 1000, reprisePct: 30, mensuelPct: 2, moisActifs: 6, enAttente: true,
      lots: [
        { code: "L1", libelle: "Ponts sur l'Ogooué et affluents", entreprise: "Entreprise F (synthétique)", part: 0.65, pkDebut: borne(148), pkFin: borne(486) },
        { code: "L2", libelle: "Petits ouvrages hydrauliques", entreprise: "Entreprise G (synthétique)", part: 0.35, pkDebut: 0, pkFin: longueur },
      ],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -540, atteintDecalage: -538 },
        { libelle: "Diagnostic complet des ouvrages", decalageJours: -300, atteintDecalage: -310, bailleur: "ue" },
        { libelle: "Réparation des appuis du pont de l'Ivindo", decalageJours: -15 },
        { libelle: "Renforcement du pont de la Lolo", decalageJours: 90, bailleur: "ue" },
      ],
    },
    {
      code: "PRN-05", libelle: "Stabilisation des talus Lopé – Booué",
      description: "Confortement des déblais instables : drainage, gabions, reprofilage et végétalisation.",
      nature: "stabilisation_talus", pkDebut: borne(267), pkFin: borne(338), entreprise: "Entreprise H (synthétique)", maitreOeuvre: "Direction PRN SETRAG",
      budgetMd: 9.5, financements: [["sfi", 5], ["etat", 4.5]], unite: "sites", quantite: 18,
      statut: "en_cours", debutJours: -420, dureeJours: 700, reprisePct: 50, mensuelPct: 3.3, moisActifs: 6, enAttente: false,
      lots: [],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -420, atteintDecalage: -418 },
        { libelle: "70 % des sites traités", decalageJours: -8, atteintDecalage: -5, bailleur: "sfi" },
        { libelle: "Confortement du site de la Lopé PK 296", decalageJours: 30 },
      ],
    },
    {
      code: "PRN-06", libelle: "Signalisation des gares et automatisation des PN",
      description: "Renouvellement des signaux d'entrée et de sortie et automatisation des passages à niveau les plus fréquentés.",
      nature: "signalisation", pkDebut: 0, pkFin: longueur, entreprise: "Entreprise I (synthétique)", maitreOeuvre: "Direction PRN SETRAG",
      budgetMd: 14, financements: [["afd", 8], ["meridiam", 6]], unite: "équipements", quantite: 60,
      statut: "suspendu", debutJours: -380, dureeJours: 760, reprisePct: 15, mensuelPct: 2.5, moisActifs: 4, enAttente: false,
      lots: [],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -380, atteintDecalage: -377 },
        { libelle: "Livraison des automatismes de PN", decalageJours: -30 },
        { libelle: "Mise en service des 12 premiers PN automatiques", decalageJours: 100, bailleur: "afd" },
      ],
    },
    {
      code: "PRN-07", libelle: "Fibre optique et radio sol-train",
      description: "Pose d'un câble à fibre optique le long de la ligne et modernisation des relais radio sol-train.",
      nature: "telecoms", pkDebut: 0, pkFin: longueur, entreprise: "Opérateur télécoms (synthétique)", maitreOeuvre: "Direction des systèmes d'information SETRAG",
      budgetMd: 12, financements: [["ue", 7], ["proparco", 5]], unite: "km", quantite: longueur,
      statut: "en_cours", debutJours: -210, dureeJours: 900, reprisePct: 0, mensuelPct: 3, moisActifs: 6, enAttente: true,
      lots: [],
      jalons: [
        { libelle: "Ordre de service de démarrage", decalageJours: -210, atteintDecalage: -206 },
        { libelle: "Déroulage de la fibre Owendo – Ndjolé", decalageJours: 45 },
        { libelle: "Radio sol-train du district de Booué en service", decalageJours: 150, bailleur: "ue" },
      ],
    },
    {
      code: "PRN-08", libelle: "Assainissement de la plateforme Owendo – Ndjolé",
      description: "Curage et création de fossés, descentes d'eau et traversées hydrauliques.",
      nature: "assainissement", pkDebut: 0, pkFin: borne(182), entreprise: "À désigner", maitreOeuvre: "Direction PRN SETRAG",
      budgetMd: 7.5, financements: [["setrag", 3.5], ["etat", 4]], unite: "ml", quantite: 120_000,
      statut: "etude", debutJours: 60, dureeJours: 540, reprisePct: 0, mensuelPct: 0, moisActifs: 0, enAttente: false,
      lots: [],
      jalons: [
        { libelle: "Signature de la convention de financement", decalageJours: -25 },
        { libelle: "Validation de l'avant-projet détaillé", decalageJours: 20 },
      ],
    },
  ]

  const ref = new Date(T + HEURE)
  const moisCourant = { annee: ref.getUTCFullYear(), mois: ref.getUTCMonth() }
  const periodeIl = (decalage: number) => {
    const d = new Date(Date.UTC(moisCourant.annee, moisCourant.mois - decalage, 1))
    return {
      periode: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      saisiLe: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 4, 8) - HEURE,
    }
  }

  let nbLots = 0
  let nbAvancements = 0
  let nbJalons = 0
  const chantiers: Doc<"infraChantiers">[] = []
  for (const def of defsChantiers) {
    const responsable = auteur("responsable_prn")
    const budgetFcfa = Math.round(def.budgetMd * MD)
    const debutLe = T + def.debutJours * JOUR
    const finPrevueLe = debutLe + def.dureeJours * JOUR
    const finReelleLe = def.statut === "receptionne" ? T - 55 * JOUR : undefined
    const doc = {
      code: def.code,
      libelle: def.libelle,
      description: `${def.description} ${MENTION}`,
      nature: def.nature,
      pkDebut: def.pkDebut,
      pkFin: def.pkFin,
      entreprise: def.entreprise,
      maitreOeuvre: def.maitreOeuvre,
      budgetFcfa,
      financements: def.financements.map(([bailleur, md]) => ({ bailleur, montantFcfa: Math.round(md * MD) })),
      uniteQuantite: def.unite,
      quantitePrevue: def.quantite,
      statut: def.statut,
      debutLe,
      finPrevueLe,
      finReelleLe,
      responsableId: responsable?._id,
      majLe: T - entier(alea, 1, 20) * JOUR,
    }
    const chantierId = await ctx.db.insert("infraChantiers", doc)
    chantiers.push({ _id: chantierId, _creationTime: T, ...doc })
    await evenement("chantier", chantierId, "chantier_cree", `Chantier ${def.code} inscrit au programme`, debutLe - 90 * JOUR, responsable?._id, MENTION)
    if (def.statut !== "etude") {
      await evenement("chantier", chantierId, "chantier_en_cours", "Chantier en étude → en cours", debutLe, responsable?._id)
    }
    if (def.statut === "suspendu") {
      await evenement("chantier", chantierId, "chantier_suspendu", "Chantier en cours → suspendu", T - 62 * JOUR, responsable?._id, "Retard de livraison des automatismes de PN par le fournisseur.")
    }
    if (finReelleLe !== undefined) {
      await evenement("chantier", chantierId, "chantier_receptionne", "Chantier en cours → réceptionné", finReelleLe, responsable?._id, "Réception prononcée sans réserve majeure.")
    }

    /* Lots */
    const lots: Doc<"infraLots">[] = []
    for (const lot of def.lots) {
      const lotDoc = {
        chantierId,
        code: lot.code,
        libelle: lot.libelle,
        entreprise: lot.entreprise,
        montantFcfa: Math.round(budgetFcfa * lot.part * 0.97),
        pkDebut: lot.pkDebut,
        pkFin: lot.pkFin,
        quantitePrevue: Math.round(def.quantite * lot.part),
      }
      const lotId = await ctx.db.insert("infraLots", lotDoc)
      nbLots += 1
      lots.push({ _id: lotId, _creationTime: T, ...lotDoc })
      await evenement("chantier", chantierId, "chantier_lot_ajoute", `Lot ${lot.code} ajouté : ${lot.libelle}`, debutLe - 30 * JOUR, responsable?._id)
    }

    /* Situations d'avancement */
    if (def.statut !== "etude") {
      const cibles = lots.length > 0 ? lots.map((l) => ({ lot: l as Doc<"infraLots"> | null, part: l.quantitePrevue / def.quantite })) : [{ lot: null, part: 1 }]
      const entier_ = def.unite !== "km"
      const arrondir = (q: number) => (entier_ ? Math.round(q) : Math.round(q * 10) / 10)
      const prixUnitaire = (budgetFcfa * 0.92) / def.quantite
      const premierMois = def.statut === "receptionne" ? 6 : def.statut === "suspendu" ? 6 : def.moisActifs
      const periodes: { decalage: number; pct: number; reprise: boolean }[] = []
      if (def.reprisePct > 0) periodes.push({ decalage: premierMois + 1, pct: def.reprisePct, reprise: true })
      for (let m = premierMois; m > premierMois - def.moisActifs; m -= 1) {
        periodes.push({ decalage: m, pct: def.mensuelPct * entre(alea, 0.7, 1.3), reprise: false })
      }
      let cumulPct = 0
      const cumulArrondi = new Map<string, number>()
      for (const [rang, p] of periodes.entries()) {
        const avant = cumulPct
        cumulPct = Math.min(def.statut === "receptionne" && rang === periodes.length - 1 ? 100 : 104, cumulPct + p.pct)
        if (def.statut === "receptionne" && rang === periodes.length - 1) cumulPct = 100
        const { periode, saisiLe } = periodeIl(p.decalage)
        const derniere = rang === periodes.length - 1
        const statut: Doc<"infraAvancements">["statut"] = derniere && def.enAttente ? "saisie" : "validee"
        for (const cible of cibles) {
          const cle = cible.lot?._id ?? "chantier"
          const precedent = cumulArrondi.get(cle) ?? 0
          const cumulCible = arrondir((def.quantite * cible.part * cumulPct) / 100)
          const quantite = Math.max(0, arrondir(cumulCible - precedent))
          cumulArrondi.set(cle, cumulCible)
          const travaux = Math.round(quantite * prixUnitaire)
          const paye = Math.round(travaux * (p.reprise ? 0.85 : derniere ? 0 : 0.8))
          const saisisseur = auteur("agent_voie") ?? auteur("responsable_prn")
          const valideur = statut === "validee" ? auteur("responsable_prn") : undefined
          const valideurDistinct = valideur && saisisseur && valideur._id === saisisseur._id ? undefined : valideur
          const situation = {
            chantierId,
            lotId: cible.lot?._id,
            periode,
            quantite,
            montantTravauxFcfa: travaux,
            montantPayeFcfa: paye,
            bailleur: def.financements[rang % def.financements.length]![0],
            commentaire: p.reprise
              ? `Reprise du cumul des situations antérieures (${Math.round(avant + p.pct)} %). ${MENTION}`
              : undefined,
            statut,
            saisiParId: saisisseur?._id,
            saisiLe: Math.min(saisiLe, T - HEURE),
            valideParId: valideurDistinct?._id,
            valideLe: statut === "validee" ? Math.min(saisiLe + entier(alea, 2, 8) * JOUR, T - HEURE) : undefined,
          }
          await ctx.db.insert("infraAvancements", situation)
          nbAvancements += 1
          const libelleLot = cible.lot ? ` (lot ${cible.lot.code})` : ""
          await evenement("chantier", chantierId, "chantier_avancement_saisi", `Situation ${periode}${libelleLot} saisie : ${quantite} ${def.unite}`, situation.saisiLe, saisisseur?._id)
          if (situation.valideLe !== undefined) {
            await evenement("chantier", chantierId, "chantier_avancement_valide", `Situation ${periode}${libelleLot} validée`, situation.valideLe, valideurDistinct?._id)
          }
        }
      }
      /* Une situation rejetée, pour la traçabilité. */
      if (def.code === "PRN-02") {
        const { periode, saisiLe } = periodeIl(2)
        const saisisseur = auteur("agent_voie")
        const rejeteur = auteur("responsable_prn")
        await ctx.db.insert("infraAvancements", {
          chantierId,
          lotId: lots[1]?._id,
          periode,
          quantite: 9.5,
          montantTravauxFcfa: Math.round(9.5 * prixUnitaire),
          montantPayeFcfa: 0,
          bailleur: "proparco",
          commentaire: "Première saisie de la période.",
          statut: "rejetee",
          saisiParId: saisisseur?._id,
          saisiLe: saisiLe - 2 * JOUR,
          valideParId: rejeteur?._id,
          valideLe: saisiLe - JOUR,
          motifRejet: "Métré non concordant avec l'attachement contradictoire.",
        })
        nbAvancements += 1
        await evenement("chantier", chantierId, "chantier_avancement_rejete", `Situation ${periode} (lot L2) rejetée`, saisiLe - JOUR, rejeteur?._id, "Métré non concordant avec l'attachement contradictoire.")
      }
    }

    /* Jalons */
    for (const jalon of def.jalons) {
      const prevuLe = T + jalon.decalageJours * JOUR
      const atteintLe = jalon.atteintDecalage !== undefined ? T + jalon.atteintDecalage * JOUR : undefined
      await ctx.db.insert("infraJalons", {
        chantierId,
        libelle: jalon.libelle,
        prevuLe,
        atteintLe,
        conditionDecaissement: jalon.bailleur !== undefined,
        bailleur: jalon.bailleur,
        preuve: atteintLe !== undefined ? `Procès-verbal ${def.code}-${String(nbJalons + 1).padStart(3, "0")} (synthétique)` : undefined,
      })
      nbJalons += 1
      if (atteintLe !== undefined) {
        await evenement(
          "chantier",
          chantierId,
          "chantier_jalon_atteint",
          `Jalon atteint : ${jalon.libelle}`,
          atteintLe,
          responsable?._id,
          jalon.bailleur ? `Conditionne un décaissement ${LIBELLES_BAILLEUR[jalon.bailleur]}.` : undefined
        )
      }
    }
  }

  /* Contrôle de cohérence : aucun chantier ne dépasse 110 % ni son budget. */
  for (const chantier of chantiers) {
    const situations = await ctx.db
      .query("infraAvancements")
      .withIndex("by_chantier", (q) => q.eq("chantierId", chantier._id))
      .collect()
    const av = avancement(chantier, situations)
    if (av.quantiteRealisee > chantier.quantitePrevue * 1.1 || av.payeFcfa > chantier.budgetFcfa) {
      throw new Error(`Jeu de démonstration incohérent sur ${chantier.code}.`)
    }
  }

  /* ── Interventions (plages travaux) ── */
  type InterventionDef = {
    libelle: string
    type: Doc<"infraInterventions">["type"]
    pkDebut: number
    pkFin: number
    debutLe: number
    finLe: number
    interruption: boolean
    statut: StatutIntervention
    chantierId?: Id<"infraChantiers">
    anomalie?: Doc<"infraAnomalies">
  }
  const jour = bornesJourLibreville(T)
  const libellesType: Record<Doc<"infraInterventions">["type"], string[]> = {
    entretien_voie: ["Bourrage mécanisé", "Remplacement de traverses", "Resserrage des attaches", "Meulage de rail en courbe"],
    prn: ["Pose de traverses béton", "Renouvellement de voie", "Déchargement de ballast", "Relevage et bourrage"],
    ouvrage: ["Inspection subaquatique des piles", "Réparation d'appuis", "Curage de buse"],
    signalisation: ["Maintenance des signaux", "Essais des automatismes de PN", "Remplacement de câble"],
    telecoms: ["Maintenance du relais radio", "Raccordement de fibre optique", "Remplacement de batteries"],
    debroussaillage: ["Débroussaillage de l'emprise", "Abattage d'arbres menaçants"],
  }
  const dureeType: Record<Doc<"infraInterventions">["type"], [number, number]> = {
    entretien_voie: [4, 8], prn: [8, 30], ouvrage: [6, 10], signalisation: [2, 6], telecoms: [3, 6], debroussaillage: [6, 9],
  }
  const chantiersActifs = chantiers.filter((c) => c.statut === "en_cours")
  const defsInterventions: InterventionDef[] = []
  /* Deux plages du jour : l'une en cours, l'autre accordée avec coupure. */
  const pkJour = pk1(Math.min(352.0, longueur - 3))
  defsInterventions.push({ libelle: "Remplacement de traverses", type: "entretien_voie", pkDebut: pkJour, pkFin: pk1(pkJour + 1.5), debutLe: Math.max(jour.debut, T - 2 * HEURE), finLe: T + 4 * HEURE, interruption: false, statut: "en_cours" })
  if (chantiersActifs[0]) {
    const c = chantiersActifs[0]
    defsInterventions.push({ libelle: "Pose de traverses béton", type: "prn", pkDebut: pk1(c.pkDebut + 22), pkFin: pk1(c.pkDebut + 24.5), debutLe: T + 5 * HEURE, finLe: T + 11 * HEURE, interruption: true, statut: "accordee", chantierId: c._id })
  }
  /* Une plage annulée, pour couvrir tous les statuts. */
  defsInterventions.push({
    libelle: "Débroussaillage de l'emprise",
    type: "debroussaillage",
    pkDebut: pk1(Math.min(120, longueur - 3)),
    pkFin: pk1(Math.min(123, longueur)),
    debutLe: jour.debut - 9 * JOUR + 6 * HEURE,
    finLe: jour.debut - 9 * JOUR + 14 * HEURE,
    interruption: false,
    statut: "annulee",
  })
  const ouvertes = anomalies.filter((a) => a.statut === "prise_en_charge")
  const traitees = anomalies.filter((a) => a.statut === "traitee" || a.statut === "close")
  while (defsInterventions.length < 40) {
    const type = pondere(alea, { entretien_voie: 10, prn: 9, ouvrage: 4, signalisation: 5, telecoms: 4, debroussaillage: 6 } as Record<Doc<"infraInterventions">["type"], number>)
    const jourDecalage = entier(alea, -60, 30)
    const debutLe = jour.debut + jourDecalage * JOUR + entier(alea, 5, 8) * HEURE + (alea() < 0.5 ? 30 * MINUTE : 0)
    const [hMin, hMax] = dureeType[type]
    const finLe = debutLe + entier(alea, hMin, hMax) * HEURE
    let chantierId: Id<"infraChantiers"> | undefined
    let pkDebut: number
    if (type === "prn" && chantiersActifs.length > 0) {
      const c = choisir(alea, chantiersActifs)
      chantierId = c._id
      pkDebut = pk1(entre(alea, c.pkDebut, Math.max(c.pkDebut, c.pkFin - 3)))
    } else {
      pkDebut = pk1(entre(alea, 1, longueur - 4))
    }
    const pkFin = pk1(Math.min(longueur, pkDebut + entre(alea, 0.5, 3)))
    let statut: StatutIntervention
    if (finLe < T) statut = pondere(alea, { terminee: 8, annulee: 1, refusee: 1 } as Record<StatutIntervention, number>)
    else if (debutLe <= T) statut = "en_cours"
    else statut = jourDecalage <= 2 ? pondere(alea, { accordee: 8, demandee: 2 } as Record<StatutIntervention, number>) : pondere(alea, { accordee: 5, demandee: 5 } as Record<StatutIntervention, number>)
    let anomalie: Doc<"infraAnomalies"> | undefined
    if (type === "entretien_voie" && alea() < 0.4) {
      anomalie = finLe < T ? choisir(alea, traitees) : ouvertes.length > 0 ? choisir(alea, ouvertes) : undefined
    }
    defsInterventions.push({
      libelle: choisir(alea, libellesType[type]),
      type,
      pkDebut,
      pkFin,
      debutLe,
      finLe,
      interruption: type === "prn" || type === "ouvrage" ? alea() < 0.7 : alea() < 0.25,
      statut,
      chantierId,
      anomalie,
    })
  }
  /* Pas de conflit parmi les plages accordées ou en cours. */
  const tenues: InterventionDef[] = []
  for (const def of defsInterventions) {
    if (def.statut === "accordee" || def.statut === "en_cours") {
      if (tenues.some((autre) => interventionsEnConflit(def, autre))) {
        def.statut = def.debutLe > T ? "demandee" : "annulee"
      } else {
        tenues.push(def)
      }
    }
  }
  defsInterventions.sort((a, b) => a.debutLe - b.debutLe)
  const roleIntervention = (type: Doc<"infraInterventions">["type"]): RoleAuteur =>
    type === "signalisation" ? "technicien_signalisation" : type === "telecoms" ? "technicien_telecoms" : type === "ouvrage" ? "agent_ouvrages_ponts" : "agent_voie"
  let nbInterventions = 0
  for (const def of defsInterventions) {
    const demandeur = auteur(roleIntervention(def.type))
    const decideur = auteur("responsable_prn")
    const demandeLe = Math.min(def.debutLe - entier(alea, 3, 15) * JOUR, T - HEURE)
    const accordeLe = ["accordee", "en_cours", "terminee", "refusee"].includes(def.statut) || (def.statut === "annulee" && alea() < 0.5)
      ? Math.min(demandeLe + entier(alea, 1, 3) * JOUR, T - 30 * MINUTE)
      : undefined
    const numero = await numeros.suivant("INT", demandeLe)
    const section = sectionDe(def.pkDebut)
    const doc = {
      numero,
      libelle: def.libelle,
      type: def.type,
      pkDebut: def.pkDebut,
      pkFin: def.pkFin,
      debutLe: def.debutLe,
      finLe: def.finLe,
      interruption: def.interruption,
      equipe: section ? `${section.brigade} (démonstration)` : "Brigade de démonstration",
      statut: def.statut,
      chantierId: def.chantierId,
      anomalieId: def.anomalie?._id,
      demandeurId: demandeur?._id,
      demandeLe,
      accordeParId: accordeLe !== undefined ? decideur?._id : undefined,
      accordeLe,
      motifRefus: def.statut === "refusee" ? "Créneau incompatible avec la circulation des trains minéraliers." : undefined,
      compteRendu: def.statut === "terminee" ? `Travaux réalisés dans le créneau, voie restituée sans restriction. ${MENTION}` : undefined,
      majLe: def.statut === "terminee" ? def.finLe : accordeLe ?? demandeLe,
    }
    const id = await ctx.db.insert("infraInterventions", doc)
    nbInterventions += 1
    await evenement("intervention", id, "intervention_demandee", `Plage travaux demandée du PK ${pkTexte(def.pkDebut)} au PK ${pkTexte(def.pkFin)}${def.interruption ? " avec coupure de voie" : ""}`, demandeLe, demandeur?._id, MENTION)
    if (accordeLe !== undefined) {
      await evenement(
        "intervention",
        id,
        def.statut === "refusee" ? "intervention_refusee" : "intervention_accordee",
        def.statut === "refusee" ? "Plage travaux refusée" : "Plage travaux accordée",
        accordeLe,
        decideur?._id,
        doc.motifRefus
      )
    }
    if (def.statut === "en_cours" || def.statut === "terminee") {
      await evenement("intervention", id, "intervention_demarree", "Travaux démarrés", def.debutLe, demandeur?._id)
    }
    if (def.statut === "terminee") {
      await evenement("intervention", id, "intervention_terminee", "Travaux terminés, voie restituée", def.finLe, demandeur?._id)
    }
    if (def.statut === "annulee") {
      await evenement("intervention", id, "intervention_annulee", "Plage travaux annulée", Math.min(def.debutLe - HEURE, T), demandeur?._id, "Équipe mobilisée sur un incident prioritaire.")
    }
    if (def.anomalie) {
      await ctx.db.patch(def.anomalie._id, { interventionId: id })
    }
  }

  await numeros.enregistrer()
  await audit(ctx, {
    action: "infrastructure.seed",
    entityTable: "infraSections",
    entityId: "demonstration",
    permission: "creer",
    reason: "Jeu de démonstration synthétique (DEMO_ACCOUNTS_ENABLED=true)",
    classification: "interne",
    metadata: {
      sections: sections.length,
      ouvrages: ouvrages.length,
      inspections: nbInspections,
      equipements: equipements.length,
      anomalies: anomalies.length,
      ltv: nbLtv,
      chantiers: chantiers.length,
      lots: nbLots,
      avancements: nbAvancements,
      jalons: nbJalons,
      interventions: nbInterventions,
      evenements: nbEvenements,
    },
  })
}
