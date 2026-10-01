/**
 * Libellés du module Sécurité ferroviaire, sûreté et conformité ARTF.
 *
 * Portage côté écran des énumérations de
 * `packages/backend/convex/modules/securite/model.ts` : les applications
 * n'importent que `@workspace/backend/generated`. Toute évolution part du
 * modèle serveur.
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
  franchissement_signal: {
    libelle: "Franchissement de signal fermé",
    famille: "circulation",
  },
  passage_niveau: {
    libelle: "Incident de passage à niveau",
    famille: "circulation",
  },
  heurt_animal: { libelle: "Heurt d'animal", famille: "circulation" },
  heurt_personne: { libelle: "Heurt de personne", famille: "circulation" },
  rupture_attelage: { libelle: "Rupture d'attelage", famille: "circulation" },
  obstacle_voie: {
    libelle: "Obstacle ou éboulement sur la voie",
    famille: "circulation",
  },
  incendie: { libelle: "Incendie de matériel", famille: "circulation" },
  accident_travail: { libelle: "Accident du travail", famille: "personnel" },
  atteinte_environnement: {
    libelle: "Atteinte à l'environnement",
    famille: "environnement",
  },
  feu_brousse: {
    libelle: "Feu de brousse aux abords",
    famille: "environnement",
  },
  malveillance: { libelle: "Malveillance ou agression", famille: "surete" },
} as const satisfies Record<string, { libelle: string; famille: Famille }>
export type TypeEvenement = keyof typeof TYPES_EVENEMENT

export const GRAVITES = {
  mineur: "Mineur",
  significatif: "Significatif",
  grave: "Grave",
  majeur: "Majeur",
} as const
export type Gravite = keyof typeof GRAVITES
export const RANG_GRAVITE: Record<Gravite, number> = {
  mineur: 1,
  significatif: 2,
  grave: 3,
  majeur: 4,
}

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

export const PRIORITES = { haute: "Haute", normale: "Normale" } as const
export type Priorite = keyof typeof PRIORITES

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

export const STATUTS_INSPECTION = {
  programmee: "Programmée",
  realisee: "Réalisée",
  annulee: "Annulée",
} as const
export type StatutInspection = keyof typeof STATUTS_INSPECTION

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

export const CATEGORIES_INCIDENT = {
  securite: "Sécurité",
  technique: "Technique",
  comportement: "Comportement",
  medical: "Médical",
  autre: "Autre",
} as const

export const GRAVITES_INCIDENT = {
  information: "Information",
  important: "Important",
  critique: "Critique",
} as const

/** Traversée du parc national de la Lopé (Bissouma — Offoué). */
export const ZONE_LOPE = { pkMin: 240, pkMax: 315 } as const

/* ════════════════════════════ Aides ═════════════════════════════════════ */

export function libelleType(type: TypeEvenement) {
  return TYPES_EVENEMENT[type].libelle
}

export function familleDe(type: TypeEvenement): Famille {
  return TYPES_EVENEMENT[type].famille
}

/** « PK 258,4 » */
export function pk(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined) return null
  return `PK ${String(valeur).replace(".", ",")}`
}

/** Lieu et point kilométrique d'un événement ou d'une inspection. */
export function lieuEtPk(element: { lieu: string; pk?: number | null }) {
  const point = pk(element.pk)
  return point && !element.lieu.includes(point)
    ? `${element.lieu} · ${point}`
    : element.lieu
}

/** « 2026-09 » → « sept. 2026 ». */
export function moisCourt(mois: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.parse(`${mois}-15T12:00:00Z`))
}

/** « 2026-T3 » → « 3e trimestre 2026 ». */
export function libelleTrimestre(code: string) {
  const correspondance = /^(\d{4})-T([1-4])$/.exec(code)
  if (!correspondance) return code
  const rang = Number(correspondance[2])
  return `${rang}${rang === 1 ? "er" : "e"} trimestre ${correspondance[1]}`
}

/** Instant présent ; isolé pour garder les rendus purs. */
export function maintenant() {
  return Date.now()
}
