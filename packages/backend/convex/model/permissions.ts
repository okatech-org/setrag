/**
 * Matrice de droits fins — logique pure.
 *
 * Le CDC §9.1.2 impose de « dissocier les droits en consultation,
 * modification, suppression, validation ». Cette matrice est la source unique
 * de vérité du contrôle d'accès : les fonctions Convex ne codent jamais une
 * liste de rôles en dur, elles demandent un droit sur une ressource.
 *
 * Aucune dépendance à Convex : entièrement testable unitairement, ce qui
 * permet de couvrir tous les rôles, ressources et droits sans base de
 * données.
 */

export const APP_ROLES = [
  "voyageur",
  "vendeur_guichet",
  "vendeur_agence",
  "taxateur",
  "controleur_train",
  "controleur_recettes",
  "chef_gare",
  "comptable",
  "responsable_kpi",
  "admin_fonctionnel",
  "admin_it",
  "direction_generale",
  "audit_risques",
  "juriste",
  "regulateur_cotraf",
  "conducteur_ligne",
  "visiteur_rames",
  "responsable_atelier",
  "magasinier",
  "agent_voie",
  "responsable_prn",
  "technicien_signalisation",
  "gestionnaire_fret",
  "fiscaliste_tresorier",
  "gestionnaire_paie",
  "planificateur_roulements",
  "medecin_travail",
  "inspecteur_securite",
  "chef_train",
  "ingenieur_atelier",
  "contremaitre_atelier",
  "gestionnaire_stocks",
  "cantonnier",
  "agent_ouvrages_ponts",
  "technicien_telecoms",
  "chef_vente",
  "gestionnaire_litiges_fret",
  "comptable_auxiliaire",
  "fiscaliste",
  "tresorier",
  "infirmier_travail",
  "enqueteur_accidents",
  "responsable_environnement",
  "representant_comilog",
  "representant_meridiam",
  "representant_etat",
  "auditeur_artf",
  "controleur_eaux_forets",
  "agent_douanes",
  "operateur_gsez",
  "agent_dgi",
  "organisme_social",
  "bailleur_fonds",
] as const
export type AppRole = (typeof APP_ROLES)[number]

/** Les cinq droits élémentaires du cahier des charges. */
export const PERMISSIONS = [
  "consulter",
  "creer",
  "modifier",
  "supprimer",
  "valider",
] as const
export type Permission = (typeof PERMISSIONS)[number]

/** Ressources protégées du système. */
export const PROTECTED_RESOURCES = [
  "ventes",
  "annulations",
  "remboursements",
  "duplicatas",
  "ventes_manuelles",
  "caisse",
  "journee_comptable",
  "journal_comptable",
  "referentiel",
  "livrets_horaires",
  "tarifs",
  "yield",
  "places",
  "quotas_agences",
  "donnees_voyageurs",
  "controles",
  "proces_verbaux",
  "incidents",
  "utilisateurs",
  "parametrage",
  "integrations",
  "rapports",
  "fret",
  "voyageurs",
  "cotraf",
  "gmao",
  "infrastructure",
  "finance",
  "rh",
  "ged",
  "securite",
  "copilot",
] as const
export type ProtectedResource = (typeof PROTECTED_RESOURCES)[number]

/** Ressources servant de porte d'entrée aux dix modules du SI intégré. */
export const MODULE_RESOURCES = [
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
] as const satisfies readonly ProtectedResource[]

/** Parties prenantes externes : leurs habilitations sont toujours en lecture. */
export const EXTERNAL_STAKEHOLDER_ROLES = [
  "representant_comilog",
  "representant_meridiam",
  "representant_etat",
  "auditeur_artf",
  "controleur_eaux_forets",
  "agent_douanes",
  "operateur_gsez",
  "agent_dgi",
  "organisme_social",
  "bailleur_fonds",
] as const satisfies readonly AppRole[]

/** Rôles du personnel interne, hors client et parties prenantes externes. */
export const INTERNAL_ROLES: readonly AppRole[] = APP_ROLES.filter(
  (role) =>
    role !== "voyageur" &&
    !EXTERNAL_STAKEHOLDER_ROLES.includes(
      role as (typeof EXTERNAL_STAKEHOLDER_ROLES)[number]
    )
)

/** Rôles habilités à contrôler les titres à bord. */
export const ONBOARD_ROLES: readonly AppRole[] = [
  "controleur_train",
  "chef_train",
  "chef_gare",
  "admin_fonctionnel",
]

/** Rôles disposant d'un accès complet au paramétrage. */
export const ADMIN_ROLES: readonly AppRole[] = ["admin_fonctionnel", "admin_it"]

type ResourceGrants = Partial<Record<ProtectedResource, readonly Permission[]>>

const ALL: readonly Permission[] = PERMISSIONS
const READ: readonly Permission[] = ["consulter"]
const READ_WRITE: readonly Permission[] = ["consulter", "creer", "modifier"]
const READ_CREATE: readonly Permission[] = ["consulter", "creer"]

function moduleGrants(
  resources: readonly (typeof MODULE_RESOURCES)[number][],
  writable: readonly (typeof MODULE_RESOURCES)[number][] = []
): ResourceGrants {
  return Object.fromEntries(
    resources.map((resource) => [
      resource,
      writable.includes(resource) ? READ_WRITE : READ,
    ])
  ) as ResourceGrants
}

function fullModuleGrants(
  resources: readonly (typeof MODULE_RESOURCES)[number][]
): ResourceGrants {
  return Object.fromEntries(
    resources.map((resource) => [resource, ALL])
  ) as ResourceGrants
}

/**
 * Droits par rôle. Un droit absent vaut refus — le principe du moindre
 * privilège exigé par le CDC §8.7 s'applique par construction.
 */
const MATRIX: Readonly<Record<AppRole, ResourceGrants>> = {
  /* Client : ne voit que ses propres achats, via des fonctions dédiées. */
  voyageur: {
    ventes: READ_CREATE,
    annulations: READ_CREATE,
  },

  /* Vente au comptoir. */
  vendeur_guichet: {
    ...moduleGrants(["voyageurs"], ["voyageurs"]),
    ventes: READ_CREATE,
    annulations: READ_CREATE,
    remboursements: READ,
    duplicatas: READ_CREATE,
    ventes_manuelles: READ_CREATE,
    caisse: READ_WRITE,
    referentiel: READ,
    livrets_horaires: READ,
    tarifs: READ,
    places: READ,
    donnees_voyageurs: READ,
  },

  /* Agence accréditée : comme le guichet, borné à son quota. */
  vendeur_agence: {
    ...moduleGrants(["voyageurs"], ["voyageurs"]),
    ventes: READ_CREATE,
    annulations: READ,
    duplicatas: READ_CREATE,
    caisse: READ_WRITE,
    referentiel: READ,
    livrets_horaires: READ,
    tarifs: READ,
    places: READ,
    quotas_agences: READ,
  },

  /* Taxation et régularisation des opérations manuelles. */
  taxateur: {
    ...moduleGrants(["voyageurs"], ["voyageurs"]),
    ventes: READ_CREATE,
    ventes_manuelles: READ_WRITE,
    annulations: READ_CREATE,
    duplicatas: READ_CREATE,
    referentiel: READ,
    tarifs: READ,
    donnees_voyageurs: READ,
  },

  /* Contrôle à bord. */
  controleur_train: {
    ...moduleGrants(["voyageurs", "securite"], ["securite"]),
    ventes: READ_CREATE,
    controles: READ_CREATE,
    proces_verbaux: READ_CREATE,
    incidents: READ_CREATE,
    donnees_voyageurs: READ,
    livrets_horaires: READ,
    tarifs: READ,
    /**
     * Le contrôleur encaisse à bord — ventes de régularisation et amendes —
     * il tient donc sa propre caisse embarquée. Comme le vendeur guichet, il
     * ne la valide pas lui-même : cela reste au contrôleur de recettes.
     */
    caisse: READ_WRITE,
  },

  /* Contrôle des recettes et clôture de journée. */
  controleur_recettes: {
    ...moduleGrants(["voyageurs", "finance"], ["finance"]),
    ventes: READ,
    annulations: READ,
    remboursements: ["consulter", "valider"],
    ventes_manuelles: READ,
    caisse: ["consulter", "modifier", "valider"],
    journee_comptable: ["consulter", "valider"],
    journal_comptable: READ,
    rapports: READ_CREATE,
    donnees_voyageurs: READ,
  },

  /* Encadrement d'une gare. */
  chef_gare: {
    ...moduleGrants(
      ["voyageurs", "fret", "cotraf", "ged", "securite"],
      ["cotraf"]
    ),
    ventes: READ,
    annulations: READ_CREATE,
    remboursements: READ_CREATE,
    caisse: READ,
    places: READ_WRITE,
    controles: READ,
    proces_verbaux: READ_WRITE,
    incidents: ["consulter", "creer", "modifier", "valider"],
    donnees_voyageurs: READ,
    rapports: READ,
    livrets_horaires: READ,
    tarifs: READ,
    fret: READ,
  },

  /* Comptabilité et déversement SAGE. */
  comptable: {
    ...moduleGrants(["voyageurs", "fret", "finance", "ged"], ["finance"]),
    ventes: READ,
    remboursements: READ,
    journee_comptable: ["consulter", "valider"],
    journal_comptable: READ_WRITE,
    caisse: READ,
    rapports: READ_CREATE,
    integrations: READ,
  },

  /* Pilotage et statistiques. */
  responsable_kpi: {
    ...moduleGrants(MODULE_RESOURCES),
    ventes: READ,
    rapports: ALL,
    yield: READ,
    places: READ,
    donnees_voyageurs: READ,
    livrets_horaires: READ,
    tarifs: READ,
    fret: READ,
  },

  /* Administration fonctionnelle : le paramétrage métier. */
  admin_fonctionnel: {
    ...fullModuleGrants(MODULE_RESOURCES),
    ventes: READ,
    annulations: ALL,
    remboursements: ALL,
    duplicatas: ALL,
    ventes_manuelles: ALL,
    caisse: ALL,
    journee_comptable: ALL,
    journal_comptable: READ,
    referentiel: ALL,
    livrets_horaires: ALL,
    tarifs: ALL,
    yield: ALL,
    places: ALL,
    quotas_agences: ALL,
    donnees_voyageurs: READ,
    controles: READ,
    proces_verbaux: ALL,
    incidents: ALL,
    utilisateurs: READ_WRITE,
    parametrage: ALL,
    rapports: ALL,
    integrations: READ,
    fret: ALL,
  },

  /* Administration technique : utilisateurs, intégrations, supervision. */
  admin_it: {
    ...moduleGrants(MODULE_RESOURCES),
    utilisateurs: ALL,
    parametrage: ALL,
    integrations: ALL,
    rapports: READ,
    referentiel: READ,
    journal_comptable: READ,
  },

  /* Gouvernance : vision transverse, sans écriture opérationnelle. */
  direction_generale: moduleGrants(MODULE_RESOURCES),
  audit_risques: moduleGrants(
    ["finance", "ged", "securite", "copilot"],
    ["securite"]
  ),
  juriste: moduleGrants(["ged", "securite", "copilot"], ["ged"]),

  /* Exploitation ferroviaire. */
  regulateur_cotraf: moduleGrants(
    ["cotraf", "securite", "copilot"],
    ["cotraf"]
  ),
  conducteur_ligne: moduleGrants(["cotraf", "ged", "securite"], ["cotraf"]),
  visiteur_rames: moduleGrants(["gmao", "securite"], ["gmao"]),

  /* Matériel roulant. */
  responsable_atelier: moduleGrants(
    ["gmao", "finance", "ged", "copilot"],
    ["gmao"]
  ),
  magasinier: moduleGrants(["gmao", "finance"], ["gmao"]),

  /* Installations fixes. */
  agent_voie: moduleGrants(
    ["infrastructure", "ged", "securite"],
    ["infrastructure"]
  ),
  responsable_prn: moduleGrants(
    ["cotraf", "infrastructure", "finance", "ged", "copilot"],
    ["infrastructure"]
  ),
  technicien_signalisation: moduleGrants(
    ["cotraf", "gmao", "infrastructure", "securite"],
    ["infrastructure"]
  ),

  /* Commercial, finance et ressources humaines. */
  gestionnaire_fret: moduleGrants(
    ["fret", "finance", "ged", "copilot"],
    ["fret"]
  ),
  fiscaliste_tresorier: moduleGrants(
    ["finance", "ged", "copilot"],
    ["finance"]
  ),
  gestionnaire_paie: moduleGrants(["finance", "rh", "ged"], ["rh"]),
  planificateur_roulements: moduleGrants(
    ["cotraf", "rh", "ged", "copilot"],
    ["rh"]
  ),
  medecin_travail: moduleGrants(["rh", "ged", "securite"], ["rh"]),
  inspecteur_securite: moduleGrants(
    ["cotraf", "gmao", "infrastructure", "ged", "securite", "copilot"],
    ["securite"]
  ),

  /* Fonctions internes distinguées par la cartographie détaillée. */
  chef_train: {
    ...moduleGrants(["voyageurs", "cotraf", "ged", "securite"], ["securite"]),
    ventes: READ,
    controles: READ_CREATE,
    proces_verbaux: READ,
    incidents: ["consulter", "creer", "modifier", "valider"],
    donnees_voyageurs: READ,
    livrets_horaires: READ,
  },
  ingenieur_atelier: moduleGrants(
    ["gmao", "finance", "ged", "copilot"],
    ["gmao"]
  ),
  contremaitre_atelier: moduleGrants(["gmao", "ged", "securite"], ["gmao"]),
  gestionnaire_stocks: moduleGrants(["gmao", "finance", "copilot"], ["gmao"]),
  cantonnier: moduleGrants(
    ["infrastructure", "ged", "securite"],
    ["infrastructure"]
  ),
  agent_ouvrages_ponts: moduleGrants(
    ["gmao", "infrastructure", "ged", "securite"],
    ["infrastructure"]
  ),
  technicien_telecoms: moduleGrants(
    ["cotraf", "gmao", "infrastructure", "securite"],
    ["infrastructure"]
  ),
  chef_vente: moduleGrants(["voyageurs", "finance", "copilot"], ["voyageurs"]),
  gestionnaire_litiges_fret: moduleGrants(["fret", "finance", "ged"], ["fret"]),
  comptable_auxiliaire: moduleGrants(
    ["voyageurs", "fret", "finance", "ged"],
    ["finance"]
  ),
  fiscaliste: moduleGrants(["finance", "ged", "copilot"], ["finance"]),
  tresorier: moduleGrants(["finance", "ged", "copilot"], ["finance"]),
  infirmier_travail: moduleGrants(["rh", "ged", "securite"], ["rh"]),
  enqueteur_accidents: moduleGrants(
    ["cotraf", "gmao", "infrastructure", "ged", "securite", "copilot"],
    ["securite"]
  ),
  responsable_environnement: moduleGrants(
    ["fret", "infrastructure", "ged", "securite", "copilot"],
    ["securite"]
  ),

  /* Écosystème externe : portails strictement consultatifs. */
  representant_comilog: moduleGrants(["fret", "cotraf", "finance", "ged"]),
  representant_meridiam: moduleGrants([
    "infrastructure",
    "finance",
    "ged",
    "securite",
    "copilot",
  ]),
  representant_etat: moduleGrants(MODULE_RESOURCES),
  auditeur_artf: moduleGrants([
    "cotraf",
    "gmao",
    "infrastructure",
    "ged",
    "securite",
  ]),
  controleur_eaux_forets: moduleGrants(["fret", "ged", "securite"]),
  agent_douanes: moduleGrants(["fret", "finance", "ged"]),
  operateur_gsez: moduleGrants(["fret", "cotraf", "ged"]),
  agent_dgi: moduleGrants(["finance", "ged"]),
  organisme_social: moduleGrants(["finance", "rh", "ged"]),
  bailleur_fonds: moduleGrants([
    "infrastructure",
    "finance",
    "ged",
    "securite",
  ]),
}

/** Vrai si le rôle dispose du droit demandé sur la ressource. */
export function can(
  role: AppRole,
  resource: ProtectedResource,
  permission: Permission
): boolean {
  const grants = MATRIX[role]?.[resource]
  return grants !== undefined && grants.includes(permission)
}

/** Ensemble des droits d'un rôle sur une ressource. */
export function permissionsFor(
  role: AppRole,
  resource: ProtectedResource
): readonly Permission[] {
  return MATRIX[role]?.[resource] ?? []
}

/** Ressources auxquelles un rôle a accès, à quelque titre que ce soit. */
export function accessibleResources(
  role: AppRole
): readonly ProtectedResource[] {
  return PROTECTED_RESOURCES.filter(
    (resource) => permissionsFor(role, resource).length > 0
  )
}

/** Vrai si le rôle appartient au personnel interne. */
export function isInternalRole(role: AppRole): boolean {
  return INTERNAL_ROLES.includes(role)
}

/**
 * Vrai si le rôle exige une authentification forte.
 *
 * Le CDC impose le MFA à tous les accès internes ; le rôle client en est
 * exempté puisqu'il s'authentifie par code à usage unique.
 */
export function requiresMfa(role: AppRole): boolean {
  return role !== "voyageur"
}
