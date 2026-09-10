/**
 * Matrice de droits fins — logique pure.
 *
 * Le CDC §9.1.2 impose de « dissocier les droits en consultation,
 * modification, suppression, validation ». Cette matrice est la source unique
 * de vérité du contrôle d'accès : les fonctions Convex ne codent jamais une
 * liste de rôles en dur, elles demandent un droit sur une ressource.
 *
 * Aucune dépendance à Convex : entièrement testable unitairement, ce qui
 * permet de couvrir les 11 rôles × 17 ressources × 5 droits sans base de
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
] as const
export type ProtectedResource = (typeof PROTECTED_RESOURCES)[number]

/** Rôles du personnel interne, par opposition au rôle client. */
export const INTERNAL_ROLES: readonly AppRole[] = APP_ROLES.filter(
  (r) => r !== "voyageur",
)

/** Rôles habilités à contrôler les titres à bord. */
export const ONBOARD_ROLES: readonly AppRole[] = [
  "controleur_train",
  "chef_gare",
  "admin_fonctionnel",
]

/** Rôles disposant d'un accès complet au paramétrage. */
export const ADMIN_ROLES: readonly AppRole[] = [
  "admin_fonctionnel",
  "admin_it",
]

type ResourceGrants = Partial<Record<ProtectedResource, readonly Permission[]>>

const ALL: readonly Permission[] = PERMISSIONS
const READ: readonly Permission[] = ["consulter"]
const READ_WRITE: readonly Permission[] = ["consulter", "creer", "modifier"]
const READ_CREATE: readonly Permission[] = ["consulter", "creer"]

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
    utilisateurs: ALL,
    parametrage: ALL,
    integrations: ALL,
    rapports: READ,
    referentiel: READ,
    journal_comptable: READ,
  },
}

/** Vrai si le rôle dispose du droit demandé sur la ressource. */
export function can(
  role: AppRole,
  resource: ProtectedResource,
  permission: Permission,
): boolean {
  const grants = MATRIX[role]?.[resource]
  return grants !== undefined && grants.includes(permission)
}

/** Ensemble des droits d'un rôle sur une ressource. */
export function permissionsFor(
  role: AppRole,
  resource: ProtectedResource,
): readonly Permission[] {
  return MATRIX[role]?.[resource] ?? []
}

/** Ressources auxquelles un rôle a accès, à quelque titre que ce soit. */
export function accessibleResources(
  role: AppRole,
): readonly ProtectedResource[] {
  return PROTECTED_RESOURCES.filter(
    (resource) => permissionsFor(role, resource).length > 0,
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
  return isInternalRole(role)
}
