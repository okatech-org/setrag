import type { ProtectedResource } from "../../model/permissions"

/** Codes persistés : ils ne doivent jamais dépendre des libellés d'interface. */
export const MODULE_CODES = [
  "voyageurs",
  "fret",
  "cotraf",
  "gmao",
  "infrastructure",
  "finance",
  "rh",
  "ged",
  "securite",
  "copilot",
] as const

export type ModuleCode = (typeof MODULE_CODES)[number]

/**
 * Niveaux d'accès fonctionnels d'un module, du moins au plus privilégié.
 * L'absence de niveau signifie qu'aucun accès au module n'est accordé.
 */
export const MODULE_ACCESS_LEVELS = ["lecture", "utilisation", "admin"] as const

export type ModuleAccessLevel = (typeof MODULE_ACCESS_LEVELS)[number]

export const MODULE_ACCESS_LEVEL_LABELS = {
  lecture: "Lecture",
  utilisation: "Utilisation",
  admin: "Admin",
} as const satisfies Readonly<Record<ModuleAccessLevel, string>>

const MODULE_ACCESS_LEVEL_RANK = {
  lecture: 1,
  utilisation: 2,
  admin: 3,
} as const satisfies Readonly<Record<ModuleAccessLevel, number>>

/** Retourne le libellé français stable d'un niveau d'accès. */
export function moduleAccessLevelLabel(level: ModuleAccessLevel): string {
  return MODULE_ACCESS_LEVEL_LABELS[level]
}

/** Vérifie qu'un niveau effectif atteint le niveau minimal demandé. */
export function hasModuleAccessLevel(
  current: ModuleAccessLevel | null | undefined,
  required: ModuleAccessLevel
): boolean {
  return (
    current !== null &&
    current !== undefined &&
    MODULE_ACCESS_LEVEL_RANK[current] >= MODULE_ACCESS_LEVEL_RANK[required]
  )
}

/**
 * Rattachement des ressources fines à leur grand module. Il permet à un
 * override explicite de plafonner les droits RBAC sans les remplacer.
 */
export const MODULE_CODE_BY_RESOURCE = {
  voyageurs: "voyageurs",
  ventes: "voyageurs",
  annulations: "voyageurs",
  remboursements: "voyageurs",
  duplicatas: "voyageurs",
  ventes_manuelles: "voyageurs",
  caisse: "voyageurs",
  referentiel: "voyageurs",
  livrets_horaires: "voyageurs",
  tarifs: "voyageurs",
  yield: "voyageurs",
  places: "voyageurs",
  quotas_agences: "voyageurs",
  donnees_voyageurs: "voyageurs",
  utilisateurs: "voyageurs",
  parametrage: "voyageurs",
  integrations: "voyageurs",
  rapports: "voyageurs",
  fret: "fret",
  cotraf: "cotraf",
  gmao: "gmao",
  infrastructure: "infrastructure",
  finance: "finance",
  journee_comptable: "finance",
  journal_comptable: "finance",
  rh: "rh",
  ged: "ged",
  securite: "securite",
  controles: "securite",
  proces_verbaux: "securite",
  incidents: "securite",
  copilot: "copilot",
} as const satisfies Partial<Record<ProtectedResource, ModuleCode>>

/** Grand module auquel une ressource fine appartient, si elle en a un. */
export function moduleCodeForResource(
  resource: ProtectedResource
): ModuleCode | undefined {
  return (
    MODULE_CODE_BY_RESOURCE as Partial<Record<ProtectedResource, ModuleCode>>
  )[resource]
}

export interface ModuleManifestEntry {
  readonly code: ModuleCode
  readonly label: string
  readonly route: string
  /** Ressource minimale consultée pour afficher le module. */
  readonly resource: ProtectedResource
  readonly defaultEnabled: boolean
}

/**
 * Source pure unique partagée par le serveur et la navigation du back-office.
 * Les activations persistées remplacent uniquement `defaultEnabled`.
 */
export const MODULE_MANIFEST = [
  {
    code: "voyageurs",
    label: "Voyageurs",
    route: "/gestion",
    resource: "voyageurs",
    defaultEnabled: true,
  },
  {
    code: "fret",
    label: "Fret",
    route: "/fret",
    resource: "fret",
    defaultEnabled: true,
  },
  {
    code: "cotraf",
    label: "COTRAF",
    route: "/cotraf",
    resource: "cotraf",
    defaultEnabled: false,
  },
  {
    code: "gmao",
    label: "Matériel",
    route: "/materiel",
    resource: "gmao",
    defaultEnabled: false,
  },
  {
    code: "infrastructure",
    label: "Infrastructures",
    route: "/infrastructures",
    resource: "infrastructure",
    defaultEnabled: false,
  },
  {
    code: "finance",
    label: "Finances",
    route: "/finances",
    resource: "finance",
    defaultEnabled: false,
  },
  {
    code: "rh",
    label: "Ressources humaines",
    route: "/rh",
    resource: "rh",
    defaultEnabled: false,
  },
  {
    code: "ged",
    label: "Bureautique",
    route: "/bureautique",
    resource: "ged",
    defaultEnabled: false,
  },
  {
    code: "securite",
    label: "Sécurité",
    route: "/securite",
    resource: "securite",
    defaultEnabled: false,
  },
  {
    code: "copilot",
    label: "Copilot",
    route: "/copilot",
    resource: "copilot",
    defaultEnabled: false,
  },
] as const satisfies readonly ModuleManifestEntry[]

/** Accès typé au manifeste sans dupliquer le catalogue. */
export function moduleManifestEntry(code: ModuleCode): ModuleManifestEntry {
  const entry = MODULE_MANIFEST.find((candidate) => candidate.code === code)
  if (!entry) throw new Error(`Module inconnu : ${code}`)
  return entry
}
