/**
 * Règles pures du module Bureautique et GED : directions, types, droits de
 * consultation, circuit de validation, numérotation et conservation.
 *
 * Aucune dépendance à Convex : tout se teste sans base de données.
 */

import type { AppRole } from "../../model/permissions"

/* ═══════════════════════════════════════════════ Référentiels ═══ */

/** Directions de la SETRAG (cartographie des acteurs, étude 03). */
export const GED_DIRECTIONS = {
  DG: "Direction générale",
  DEF: "Exploitation ferroviaire",
  DCFV: "Commercial fret et voyageurs",
  DMAT: "Matériel roulant",
  DINFRA: "Installations fixes",
  DFC: "Finance et comptabilité",
  DRH: "Ressources humaines",
  DSED: "Sécurité et environnement",
  DSI: "Systèmes d'information",
  DJ: "Affaires juridiques",
  BOC: "Bureau d'ordre central",
} as const

export type GedDirection = keyof typeof GED_DIRECTIONS

export function estDirection(valeur: string): valeur is GedDirection {
  return Object.prototype.hasOwnProperty.call(GED_DIRECTIONS, valeur)
}

export const GED_TYPES = {
  courrier_entrant: "Courrier entrant",
  courrier_sortant: "Courrier sortant",
  note_service: "Note de service",
  contrat: "Contrat ou convention",
  proces_verbal: "Procès-verbal",
  rapport: "Rapport",
  piece_comptable: "Pièce comptable",
  procedure: "Procédure",
  plan_technique: "Plan technique",
  autre: "Autre document",
} as const

export type GedType = keyof typeof GED_TYPES

export const GED_CLASSIFICATIONS = {
  public: "Public",
  interne: "Interne",
  confidentiel: "Confidentiel",
  restreint: "Restreint",
} as const

export type GedClassification = keyof typeof GED_CLASSIFICATIONS

export type GedStatut =
  | "brouillon"
  | "en_circuit"
  | "valide"
  | "diffuse"
  | "refuse"
  | "archive"
  | "elimine"

export const GED_STATUTS: Record<GedStatut, string> = {
  brouillon: "Brouillon",
  en_circuit: "En circuit",
  valide: "Validé",
  diffuse: "Diffusé",
  refuse: "Refusé",
  archive: "Archivé",
  elimine: "Éliminé",
}

export const LIBELLES_STATUT_ETAPE = {
  a_venir: "à venir",
  en_attente: "en attente",
  vise: "visé",
  signe: "signé",
  diffuse: "diffusé",
  refuse: "refusé",
  annule: "annulé",
} as const

/* ═══════════════════════════════════════════════ Saisie ═══ */

export function texteRequis(
  valeur: string,
  libelle: string,
  maximum: number,
  minimum = 1
): string {
  const propre = valeur.replace(/\s+/g, " ").trim()
  if (propre.length < minimum || propre.length > maximum) {
    throw new Error(
      minimum > 1
        ? `${libelle} doit contenir entre ${minimum} et ${maximum} caractères.`
        : `${libelle} est obligatoire (${maximum} caractères au plus).`
    )
  }
  return propre
}

/** Texte long : les retours à la ligne sont conservés. */
export function texteLongRequis(
  valeur: string,
  libelle: string,
  maximum: number,
  minimum = 1
): string {
  const propre = valeur.replace(/\r\n/g, "\n").trim()
  if (propre.length < minimum || propre.length > maximum) {
    throw new Error(
      minimum > 1
        ? `${libelle} doit contenir entre ${minimum} et ${maximum} caractères.`
        : `${libelle} est obligatoire (${maximum} caractères au plus).`
    )
  }
  return propre
}

export function texteFacultatif(
  valeur: string | undefined,
  libelle: string,
  maximum: number
): string | undefined {
  if (valeur === undefined) return undefined
  const propre = valeur.replace(/\r\n/g, "\n").trim()
  if (!propre) return undefined
  if (propre.length > maximum) {
    throw new Error(`${libelle} dépasse ${maximum} caractères.`)
  }
  return propre
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Valide une date AAAA-MM-JJ réelle (pas de 31 février). */
export function dateIso(valeur: string, libelle: string): string {
  const propre = valeur.trim()
  const correspondance = DATE_ISO.exec(propre)
  if (!correspondance) throw new Error(`${libelle} doit être au format AAAA-MM-JJ.`)
  const [, a, m, j] = correspondance
  const date = new Date(Date.UTC(Number(a), Number(m) - 1, Number(j)))
  if (
    date.getUTCFullYear() !== Number(a) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(j)
  ) {
    throw new Error(`${libelle} n'est pas une date valide.`)
  }
  return propre
}

/** Mots-clés : minuscules, sans doublon, 12 au plus, 40 caractères chacun. */
export function motsClesNormalises(mots: readonly string[]): string[] {
  const vus = new Set<string>()
  for (const mot of mots) {
    const propre = mot.replace(/\s+/g, " ").trim().toLowerCase()
    if (!propre) continue
    if (propre.length > 40) {
      throw new Error(`Le mot-clé « ${propre.slice(0, 20)}… » dépasse 40 caractères.`)
    }
    vus.add(propre)
  }
  if (vus.size > 12) throw new Error("Douze mots-clés au plus.")
  return [...vus]
}

/** Minuscules sans accents : base commune de la recherche. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

export function texteRecherche(parties: readonly (string | undefined)[]): string {
  return normaliser(parties.filter(Boolean).join(" ")).replace(/\s+/g, " ").trim()
}

/* ═══════════════════════════════════════════════ Dates ═══ */

const FUSEAU = "Africa/Libreville"

/** Jour courant à Libreville, AAAA-MM-JJ. */
export function jourLibreville(maintenant: number): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(maintenant)
}

export function anneeLibreville(maintenant: number): number {
  return Number(jourLibreville(maintenant).slice(0, 4))
}

/** Ajoute des années à une date AAAA-MM-JJ (29 février → 28 février). */
export function ajouterAnnees(date: string, annees: number): string {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number]
  const cible = new Date(Date.UTC(a + annees, m - 1, j))
  if (cible.getUTCMonth() !== m - 1) cible.setUTCDate(0)
  return cible.toISOString().slice(0, 10)
}

/**
 * Fin de conservation : date de la pièce + durée de la série. `null` pour
 * une série à conservation définitive.
 */
export function finConservation(
  dateDocument: string,
  conservationAnnees: number | null
): string | null {
  return conservationAnnees === null ? null : ajouterAnnees(dateDocument, conservationAnnees)
}

export function conservationEchue(
  conservationJusquau: string | undefined,
  aujourdhui: string
): boolean {
  return conservationJusquau !== undefined && conservationJusquau < aujourdhui
}

/* ═══════════════════════════════════════════════ Numérotation ═══ */

/** Référence documentaire : GED-2026-000123. */
export function referenceDocument(annee: number, rang: number): string {
  return `GED-${annee}-${String(rang).padStart(6, "0")}`
}

/** Numéro chronologique du courrier : A-2026-00045 (arrivée), D-… (départ). */
export function numeroCourrier(
  sens: "arrivee" | "depart",
  annee: number,
  rang: number
): string {
  return `${sens === "arrivee" ? "A" : "D"}-${annee}-${String(rang).padStart(5, "0")}`
}

/* ═══════════════════════════════════════════════ Droits ═══ */

export interface DocumentPourDroits {
  auteurId: string
  classification: GedClassification
  statut: GedStatut
  type: GedType
  diffusion?: { tousLesAgents: boolean; roles: readonly AppRole[] } | undefined
}

export interface AccesPourDroits {
  userId?: string | undefined
  role?: AppRole | undefined
  droit: "lecture" | "edition"
}

export interface LecteurGed {
  userId: string
  role: AppRole
  /** Gestionnaire documentaire : droit `valider` sur `ged` (ou niveau admin). */
  gestionnaire: boolean
}

/**
 * Peut-on consulter cette pièce ? La classification fixe la règle :
 * - public et interne : tout lecteur du module ;
 * - confidentiel : auteur, intervenants du circuit, accès nominatif ou par
 *   rôle, gestionnaires documentaires ;
 * - restreint : auteur, intervenants et accès nominatif seulement — même un
 *   gestionnaire n'y entre pas sans y être nommé.
 * Une note diffusée est lisible par son audience, quelle que soit sa
 * classification.
 */
export function peutConsulter(
  document: DocumentPourDroits,
  lecteur: LecteurGed,
  acces: readonly AccesPourDroits[],
  intervenants: ReadonlySet<string>
): boolean {
  if (document.auteurId === lecteur.userId) return true
  if (intervenants.has(lecteur.userId)) return true
  if (acces.some((entree) => entree.userId === lecteur.userId)) return true
  if (document.diffusion && (document.statut === "diffuse" || document.statut === "archive")) {
    if (document.diffusion.tousLesAgents) return true
    if (document.diffusion.roles.includes(lecteur.role)) return true
  }
  switch (document.classification) {
    case "public":
    case "interne":
      return true
    case "confidentiel":
      return (
        lecteur.gestionnaire ||
        acces.some((entree) => entree.role !== undefined && entree.role === lecteur.role)
      )
    case "restreint":
      return false
  }
}

/**
 * Peut-on modifier la pièce (métadonnées, nouvelle version) ? Seuls l'auteur
 * et les titulaires d'un accès en édition, tant que la pièce n'est ni en
 * circuit, ni validée, ni archivée : une pièce validée a valeur probante.
 */
export function peutModifier(
  document: DocumentPourDroits,
  lecteur: LecteurGed,
  acces: readonly AccesPourDroits[]
): boolean {
  if (document.statut !== "brouillon" && document.statut !== "refuse") return false
  if (document.auteurId === lecteur.userId) return true
  return acces.some(
    (entree) =>
      entree.droit === "edition" &&
      (entree.userId === lecteur.userId ||
        (entree.role !== undefined && entree.role === lecteur.role))
  )
}

/* ═══════════════════════════════════════════════ Circuit ═══ */

export type NatureEtape = "visa" | "signature" | "diffusion"

export interface EtapeDemandee {
  nature: NatureEtape
  libelle: string
  assigneId: string
}

export const MAX_ETAPES = 8

/**
 * Un circuit : des visas, puis au plus une signature, puis au plus une
 * diffusion, toujours en dernier. La signature suit tous les visas.
 */
export function validerCircuit(etapes: readonly EtapeDemandee[]): void {
  if (etapes.length === 0) throw new Error("Un circuit compte au moins une étape.")
  if (etapes.length > MAX_ETAPES) {
    throw new Error(`Un circuit compte ${MAX_ETAPES} étapes au plus.`)
  }
  const signatures = etapes.filter((etape) => etape.nature === "signature").length
  const diffusions = etapes.filter((etape) => etape.nature === "diffusion").length
  if (signatures > 1) throw new Error("Un circuit ne compte qu'une signature.")
  if (diffusions > 1) throw new Error("Un circuit ne compte qu'une diffusion.")
  if (diffusions === 1 && etapes[etapes.length - 1]!.nature !== "diffusion") {
    throw new Error("La diffusion est toujours la dernière étape.")
  }
  if (diffusions === 1 && etapes.length === 1) {
    throw new Error("Une diffusion suit au moins un visa ou une signature.")
  }
  const rangSignature = etapes.findIndex((etape) => etape.nature === "signature")
  if (
    rangSignature >= 0 &&
    etapes.some((etape, rang) => etape.nature === "visa" && rang > rangSignature)
  ) {
    throw new Error("Les visas précèdent la signature.")
  }
}

export type DecisionEtape = "viser" | "signer" | "refuser" | "diffuser"

/** Statut d'étape produit par une décision, ou une erreur si elle ne convient pas. */
export function statutApresDecision(
  nature: NatureEtape,
  decision: DecisionEtape
): "vise" | "signe" | "refuse" | "diffuse" {
  if (decision === "refuser") {
    if (nature === "diffusion") {
      throw new Error("Une diffusion ne se refuse pas : annulez le circuit si besoin.")
    }
    return "refuse"
  }
  if (decision === "viser" && nature === "visa") return "vise"
  if (decision === "signer" && nature === "signature") return "signe"
  if (decision === "diffuser" && nature === "diffusion") return "diffuse"
  throw new Error("Cette décision ne correspond pas à la nature de l'étape.")
}

/**
 * Statut de la pièce à la fin d'un circuit : diffusée si la dernière étape
 * était une diffusion, validée sinon.
 */
export function statutDocumentFinCircuit(derniereNature: NatureEtape): GedStatut {
  return derniereNature === "diffusion" ? "diffuse" : "valide"
}

/* ═══════════════════════════════════════════════ Courrier ═══ */

export function courrierEnRetard(
  courrier: { sens: "arrivee" | "depart"; statut: string; echeanceReponse?: string | undefined },
  aujourdhui: string
): boolean {
  return (
    courrier.sens === "arrivee" &&
    courrier.echeanceReponse !== undefined &&
    courrier.echeanceReponse < aujourdhui &&
    courrier.statut !== "repondu" &&
    courrier.statut !== "clos"
  )
}

/* ═══════════════════════════════════════════════ Fichiers ═══ */

/** Aperçu intégré possible pour ces types ; les autres se téléchargent. */
export function apercuPossible(typeMime: string): "pdf" | "image" | "texte" | null {
  if (typeMime === "application/pdf") return "pdf"
  if (typeMime.startsWith("image/")) return "image"
  if (typeMime === "text/plain" || typeMime === "text/csv") return "texte"
  return null
}
