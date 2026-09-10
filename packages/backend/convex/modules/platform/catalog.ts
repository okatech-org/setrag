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
    resource: "ventes",
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
    resource: "incidents",
    defaultEnabled: false,
  },
  {
    code: "gmao",
    label: "Matériel",
    route: "/materiel",
    resource: "referentiel",
    defaultEnabled: false,
  },
  {
    code: "infrastructure",
    label: "Infrastructures",
    route: "/infrastructures",
    resource: "referentiel",
    defaultEnabled: false,
  },
  {
    code: "finance",
    label: "Finances",
    route: "/finances",
    resource: "journal_comptable",
    defaultEnabled: false,
  },
  {
    code: "rh",
    label: "Ressources humaines",
    route: "/rh",
    resource: "utilisateurs",
    defaultEnabled: false,
  },
  {
    code: "ged",
    label: "Bureautique",
    route: "/bureautique",
    resource: "parametrage",
    defaultEnabled: false,
  },
  {
    code: "securite",
    label: "Sécurité",
    route: "/securite",
    resource: "incidents",
    defaultEnabled: false,
  },
  {
    code: "copilot",
    label: "Copilot",
    route: "/copilot",
    resource: "rapports",
    defaultEnabled: false,
  },
] as const satisfies readonly ModuleManifestEntry[]

/** Accès typé au manifeste sans dupliquer le catalogue. */
export function moduleManifestEntry(code: ModuleCode): ModuleManifestEntry {
  const entry = MODULE_MANIFEST.find((candidate) => candidate.code === code)
  if (!entry) throw new Error(`Module inconnu : ${code}`)
  return entry
}
