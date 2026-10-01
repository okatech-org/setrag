/**
 * Règles métier Sécurité ferroviaire, sûreté et conformité ARTF — logique
 * pure, sans dépendance à Convex.
 *
 * Les délais de déclaration à l'Autorité de régulation des transports
 * ferroviaires (ARTF) sont paramétrés ici, faute de référentiel ARTF publié
 * dans le cahier des charges : ce sont des règles internes SETRAG, à aligner
 * sur la convention de concession dès qu'elle sera fournie.
 */

export const FAMILLES = {
  circulation: "Sécurité des circulations",
  personnel: "Santé et sécurité au travail",
  environnement: "Environnement",
  surete: "Sûreté",
} as const
export type Famille = keyof typeof FAMILLES

export const TYPES_EVENEMENT = {
  deraillement: { libelle: "Déraillement", famille: "circulation" },
  collision: { libelle: "Collision", famille: "circulation" },
  franchissement_signal: { libelle: "Franchissement de signal fermé", famille: "circulation" },
  passage_niveau: { libelle: "Incident de passage à niveau", famille: "circulation" },
  heurt_animal: { libelle: "Heurt d'animal", famille: "circulation" },
  heurt_personne: { libelle: "Heurt de personne", famille: "circulation" },
  rupture_attelage: { libelle: "Rupture d'attelage", famille: "circulation" },
  obstacle_voie: { libelle: "Obstacle ou éboulement sur la voie", famille: "circulation" },
  incendie: { libelle: "Incendie de matériel", famille: "circulation" },
  accident_travail: { libelle: "Accident du travail", famille: "personnel" },
  atteinte_environnement: { libelle: "Atteinte à l'environnement", famille: "environnement" },
  feu_brousse: { libelle: "Feu de brousse aux abords", famille: "environnement" },
  malveillance: { libelle: "Malveillance ou agression", famille: "surete" },
} as const satisfies Record<string, { libelle: string; famille: Famille }>
export type TypeEvenement = keyof typeof TYPES_EVENEMENT

export const GRAVITES = {
  mineur: { libelle: "Mineur", rang: 1 },
  significatif: { libelle: "Significatif", rang: 2 },
  grave: { libelle: "Grave", rang: 3 },
  majeur: { libelle: "Majeur", rang: 4 },
} as const
export type Gravite = keyof typeof GRAVITES

export const STATUTS_EVENEMENT = {
  declare: "Déclaré, à qualifier",
  qualifie: "Qualifié",
  en_enquete: "En enquête",
  cloture: "Clôturé",
  classe: "Classé sans suite",
} as const
export type StatutEvenement = keyof typeof STATUTS_EVENEMENT

export const STATUTS_ENQUETE = {
  ouverte: "Ouverte",
  instruction: "En instruction",
  rapport_soumis: "Rapport soumis",
  cloturee: "Clôturée",
} as const
export type StatutEnquete = keyof typeof STATUTS_ENQUETE

export const CATEGORIES_CAUSE = {
  humaine: "Facteur humain",
  materiel: "Matériel roulant",
  infrastructure: "Voie et infrastructure",
  organisation: "Organisation et procédures",
  environnement: "Environnement et météo",
  tiers: "Fait d'un tiers",
} as const
export type CategorieCause = keyof typeof CATEGORIES_CAUSE

export const STATUTS_ACTION = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  realisee: "Réalisée, à vérifier",
  verifiee: "Vérifiée efficace",
  annulee: "Annulée",
} as const
export type StatutAction = keyof typeof STATUTS_ACTION

export const DIRECTIONS_RESPONSABLES = {
  DEF: "Exploitation ferroviaire",
  DMAT: "Matériel roulant",
  DINFRA: "Installations fixes",
  DCFV: "Commercial fret & voyageurs",
  DRH: "Ressources humaines",
  DSED: "Sécurité & environnement",
  DG: "Direction générale",
} as const
export type DirectionResponsable = keyof typeof DIRECTIONS_RESPONSABLES

export const TYPES_INSPECTION = {
  inspection_voie: "Inspection de la voie",
  audit_securite: "Audit du système de gestion de la sécurité",
  controle_materiel: "Contrôle du matériel roulant",
  controle_conduite: "Accompagnement en cabine",
  exercice_secours: "Exercice de secours",
  inspection_environnementale: "Inspection environnementale",
  controle_documentaire: "Contrôle documentaire",
} as const
export type TypeInspection = keyof typeof TYPES_INSPECTION

export const RESULTATS_INSPECTION = {
  conforme: "Conforme",
  conforme_reserves: "Conforme avec réserves",
  non_conforme: "Non conforme",
} as const
export type ResultatInspection = keyof typeof RESULTATS_INSPECTION

export const GRAVITES_NC = {
  mineure: "Mineure",
  majeure: "Majeure",
  critique: "Critique",
} as const
export type GraviteNc = keyof typeof GRAVITES_NC

export const NATURES_ARTF = {
  notification_immediate: "Notification d'événement",
  rapport_enquete: "Rapport d'enquête",
  bilan_trimestriel: "Bilan trimestriel de sécurité",
} as const
export type NatureArtf = keyof typeof NATURES_ARTF

export const STATUTS_ARTF = {
  a_preparer: "À préparer",
  prete: "Prête à transmettre",
  transmise: "Transmise, accusé attendu",
  accusee: "Accusé reçu",
} as const
export type StatutArtf = keyof typeof STATUTS_ARTF

/* ═══════════════════════════════ Lieux ══════════════════════════════════ */

/** Traversée du parc national de la Lopé (Bissouma — Offoué). */
export const ZONE_LOPE = { pkMin: 240, pkMax: 315 } as const

export function dansZoneLope(pk: number | undefined | null): boolean {
  return pk !== undefined && pk !== null && pk >= ZONE_LOPE.pkMin && pk <= ZONE_LOPE.pkMax
}

/** Longueur de la ligne Owendo — Franceville. */
export const PK_MAX = 669

export function controlerPk(pk: number | undefined): number | undefined {
  if (pk === undefined) return undefined
  if (!Number.isFinite(pk) || pk < 0 || pk > PK_MAX) {
    throw new Error(`Le point kilométrique doit être compris entre 0 et ${PK_MAX}.`)
  }
  return Math.round(pk * 10) / 10
}

/* ════════════════════════ Obligations ARTF ══════════════════════════════ */

const HEURE_MS = 3_600_000
const JOUR_MS = 24 * HEURE_MS

export const DELAIS_ARTF = {
  notificationMajeureHeures: 24,
  notificationGraveHeures: 72,
  notificationEnvironnementHeures: 168,
  rapportEnqueteJours: 90,
  bilanTrimestrielJours: 30,
} as const

export interface ObligationNotification {
  requise: boolean
  delaiHeures?: number
  motif: string
}

/**
 * Un événement doit-il être notifié à l'ARTF, et dans quel délai ?
 * Les accidents mortels et majeurs : 24 h ; les accidents graves, les
 * victimes, les déraillements, collisions et franchissements : 72 h ; une
 * atteinte significative au parc de la Lopé : 7 jours.
 */
export function obligationNotification(evenement: {
  type: TypeEvenement
  gravite: Gravite
  blesses: number
  deces: number
  zoneLope: boolean
}): ObligationNotification {
  const rang = GRAVITES[evenement.gravite].rang
  if (evenement.deces > 0 || evenement.gravite === "majeur") {
    return { requise: true, delaiHeures: DELAIS_ARTF.notificationMajeureHeures, motif: evenement.deces > 0 ? "Accident mortel" : "Événement majeur" }
  }
  if (rang >= 3) return { requise: true, delaiHeures: DELAIS_ARTF.notificationGraveHeures, motif: "Événement grave" }
  if (evenement.blesses > 0) return { requise: true, delaiHeures: DELAIS_ARTF.notificationGraveHeures, motif: "Victime blessée" }
  if (["deraillement", "collision", "franchissement_signal"].includes(evenement.type)) {
    return { requise: true, delaiHeures: DELAIS_ARTF.notificationGraveHeures, motif: `${TYPES_EVENEMENT[evenement.type].libelle} — déclaration systématique` }
  }
  if (evenement.type === "passage_niveau" && rang >= 2) {
    return { requise: true, delaiHeures: DELAIS_ARTF.notificationGraveHeures, motif: "Incident significatif de passage à niveau" }
  }
  if (TYPES_EVENEMENT[evenement.type].famille === "environnement" && evenement.zoneLope && rang >= 2) {
    return { requise: true, delaiHeures: DELAIS_ARTF.notificationEnvironnementHeures, motif: "Atteinte significative au parc national de la Lopé" }
  }
  return { requise: false, motif: "Sous les seuils de déclaration" }
}

export function echeanceNotification(survenuLe: number, delaiHeures: number) {
  return survenuLe + delaiHeures * HEURE_MS
}

export function echeanceRapportEnquete(survenuLe: number) {
  return survenuLe + DELAIS_ARTF.rapportEnqueteJours * JOUR_MS
}

/** Trimestre « 2026-T3 » : bornes et échéance du bilan. */
export function bornesTrimestre(code: string) {
  const correspondance = /^(\d{4})-T([1-4])$/.exec(code.trim())
  if (!correspondance) throw new Error("Le trimestre s'écrit AAAA-T1 à AAAA-T4.")
  const annee = Number(correspondance[1])
  const trimestre = Number(correspondance[2])
  const debut = Date.parse(`${annee}-${String((trimestre - 1) * 3 + 1).padStart(2, "0")}-01T00:00:00+01:00`)
  const fin =
    trimestre === 4
      ? Date.parse(`${annee + 1}-01-01T00:00:00+01:00`)
      : Date.parse(`${annee}-${String(trimestre * 3 + 1).padStart(2, "0")}-01T00:00:00+01:00`)
  return { code: `${annee}-T${trimestre}`, libelle: `${trimestre}${trimestre === 1 ? "er" : "e"} trimestre ${annee}`, debut, fin, echeance: fin + DELAIS_ARTF.bilanTrimestrielJours * JOUR_MS }
}

export function trimestreDe(instant: number): string {
  const date = new Date(instant + HEURE_MS)
  return `${date.getUTCFullYear()}-T${Math.floor(date.getUTCMonth() / 3) + 1}`
}

export function trimestrePrecedent(code: string): string {
  const { debut } = bornesTrimestre(code)
  return trimestreDe(debut - JOUR_MS)
}

/* ═════════════════════════════ Enquêtes ═════════════════════════════════ */

export const DELAI_ENQUETE_JOURS = 60

export interface ContenuRapport {
  constats?: string
  causes: readonly { categorie: CategorieCause; description: string; racine: boolean }[]
  recommandations: readonly { texte: string }[]
  conclusion?: string
}

/** Ce qui manque encore pour soumettre un rapport d'enquête. */
export function manquesRapport(rapport: ContenuRapport): string[] {
  const manques: string[] = []
  if (!rapport.constats || rapport.constats.trim().length < 20) manques.push("les constats (20 caractères au moins)")
  if (rapport.causes.length === 0) manques.push("au moins une cause")
  else if (!rapport.causes.some((cause) => cause.racine)) manques.push("la cause racine")
  if (rapport.recommandations.length === 0) manques.push("au moins une recommandation")
  if (!rapport.conclusion || rapport.conclusion.trim().length < 10) manques.push("la conclusion")
  return manques
}

/* ═════════════════════════════ Actions ══════════════════════════════════ */

export function actionEnRetard(action: { statut: StatutAction; echeance: string }, aujourdhui: string): boolean {
  return (action.statut === "planifiee" || action.statut === "en_cours") && action.echeance < aujourdhui
}

/* ════════════════════════════ Indicateurs ═══════════════════════════════ */

/** Taux d'événements pour 1 000 circulations, ou null sans circulations. */
export function tauxPourMilleCirculations(evenements: number, circulations: number): number | null {
  if (circulations <= 0) return null
  return Math.round((evenements / circulations) * 1000 * 100) / 100
}

/* ═════════════════════════════ Textes ═══════════════════════════════════ */

export function texteRequis(valeur: string, libelle: string, max = 2000): string {
  const texte = valeur.trim()
  if (texte.length === 0) throw new Error(`${libelle} est obligatoire.`)
  if (texte.length > max) throw new Error(`${libelle} dépasse ${max} caractères.`)
  return texte
}

export function texteFacultatif(valeur: string | undefined, libelle: string, max = 2000): string | undefined {
  if (valeur === undefined) return undefined
  const texte = valeur.trim()
  if (texte.length === 0) return undefined
  if (texte.length > max) throw new Error(`${libelle} dépasse ${max} caractères.`)
  return texte
}

export function dateIso(valeur: string, libelle = "La date"): string {
  const texte = valeur.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte) || Number.isNaN(Date.parse(`${texte}T00:00:00Z`))) {
    throw new Error(`${libelle} doit être au format AAAA-MM-JJ.`)
  }
  return texte
}

export function dateLibreville(instant: number): string {
  return new Date(instant + HEURE_MS).toISOString().slice(0, 10)
}

export function ajouterJours(date: string, jours: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + jours * JOUR_MS).toISOString().slice(0, 10)
}
