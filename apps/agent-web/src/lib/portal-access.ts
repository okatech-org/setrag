import {
  APP_ROLES,
  can,
  isInternalRole,
  type AppRole,
  type Permission,
  type ProtectedResource,
} from "@workspace/backend/permissions"
import { MODULE_MANIFEST } from "@workspace/backend/modules"

export type StaffPortal = "vente" | "gestion"

export const SELLER_ROLES: readonly AppRole[] = [
  "vendeur_guichet",
  "vendeur_agence",
  "taxateur",
]

export const MANAGEMENT_DESTINATIONS = [
  { href: "/gestion", resource: "voyageurs" },
  { href: "/gestion/livrets", resource: "livrets_horaires" },
  { href: "/gestion/tarifs", resource: "tarifs" },
  { href: "/gestion/yield", resource: "yield" },
  { href: "/gestion/trains", resource: "referentiel" },
  { href: "/gestion/places", resource: "places" },
  { href: "/gestion/points-de-vente", resource: "referentiel" },
  { href: "/gestion/voyageurs", resource: "donnees_voyageurs" },
  // Après-vente du réseau : annulations, remboursements et duplicatas qui
  // dépassent le guichet (le remboursement exige un encadrant).
  { href: "/gestion/apres-vente", resource: "remboursements" },
  { href: "/gestion/recettes", resource: "journee_comptable" },
  { href: "/gestion/comptabilite", resource: "journal_comptable" },
  { href: "/gestion/rapports", resource: "rapports" },
  { href: "/gestion/incidents", resource: "incidents" },
  { href: "/gestion/utilisateurs", resource: "utilisateurs" },
  // Le journal d'audit suit la gouvernance des comptes : qui gère les accès
  // voit ce que les comptes ont fait.
  { href: "/gestion/audit", resource: "utilisateurs" },
  { href: "/gestion/parametrage", resource: "parametrage" },
  { href: "/gestion/integrations", resource: "integrations" },
] as const satisfies readonly {
  href: string
  resource: ProtectedResource
}[]

/** Destinations officielles dérivées du manifeste partagé avec le serveur. */
export const ENTERPRISE_DESTINATIONS = MODULE_MANIFEST.map(
  ({ route, resource }) => ({ href: route, resource })
) satisfies readonly {
  href: string
  resource: ProtectedResource
}[]

/** Utilitaires internes qui ne constituent pas un module officiel. */
export const STAFF_WIDE_PATHS = ["/etudes"] as const

/**
 * La page n'expose aucune donnée seule : la query serveur filtre les modules
 * administrables. L'accès statique laisse donc la garde fine aux niveaux
 * modulaires, y compris pour un administrateur délégué.
 */
export const MODULE_ADMINISTRATION_PATH = "/administration" as const

/**
 * Espace de pilotage de la Direction générale : des rubriques de lecture
 * consolidée, pas un module. Les données restent gardées côté serveur par les
 * ressources module et `rapports/consulter` ; la liste des rôles n'est élargie
 * qu'après validation SETRAG.
 */
export const EXECUTIVE_PATH = "/direction" as const
export const EXECUTIVE_ROLES: readonly AppRole[] = ["direction_generale"]

const PRIMARY_MANAGEMENT_PATHS: Partial<Record<AppRole, string>> = {
  admin_it: MODULE_ADMINISTRATION_PATH,
  direction_generale: EXECUTIVE_PATH,
  audit_risques: "/securite",
  juriste: "/bureautique",
  regulateur_cotraf: "/cotraf",
  conducteur_ligne: "/cotraf",
  visiteur_rames: "/materiel",
  responsable_atelier: "/materiel",
  magasinier: "/materiel",
  agent_voie: "/infrastructures",
  responsable_prn: "/infrastructures",
  technicien_signalisation: "/infrastructures",
  gestionnaire_fret: "/fret",
  fiscaliste_tresorier: "/finances",
  gestionnaire_paie: "/rh",
  planificateur_roulements: "/rh",
  medecin_travail: "/rh",
  inspecteur_securite: "/securite",
  chef_train: "/securite",
  ingenieur_atelier: "/materiel",
  contremaitre_atelier: "/materiel",
  gestionnaire_stocks: "/materiel",
  cantonnier: "/infrastructures",
  agent_ouvrages_ponts: "/infrastructures",
  technicien_telecoms: "/infrastructures",
  chef_vente: "/gestion",
  gestionnaire_litiges_fret: "/fret",
  comptable_auxiliaire: "/finances",
  fiscaliste: "/finances",
  tresorier: "/finances",
  infirmier_travail: "/rh",
  enqueteur_accidents: "/securite",
  responsable_environnement: "/securite",
  representant_comilog: "/fret",
  representant_meridiam: "/infrastructures",
  representant_etat: "/gestion",
  auditeur_artf: "/securite",
  controleur_eaux_forets: "/fret",
  agent_douanes: "/fret",
  operateur_gsez: "/fret",
  agent_dgi: "/finances",
  organisme_social: "/rh",
  bailleur_fonds: "/infrastructures",
}

function matchesPath(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function asAppRole(role: string | undefined): AppRole | undefined {
  return APP_ROLES.find((candidate) => candidate === role)
}

export function portalForRole(role: AppRole): StaffPortal | null {
  if (role === "voyageur") return null
  return SELLER_ROLES.includes(role) ? "vente" : "gestion"
}

export function canRole(
  role: AppRole | undefined,
  resource: ProtectedResource,
  permission: Permission = "consulter"
) {
  return Boolean(role && can(role, resource, permission))
}

export function canAccessManagementPath(role: AppRole, pathname: string) {
  if (matchesPath(MODULE_ADMINISTRATION_PATH, pathname)) {
    return isInternalRole(role)
  }
  if (STAFF_WIDE_PATHS.some((href) => matchesPath(href, pathname))) {
    return isInternalRole(role)
  }
  if (matchesPath(EXECUTIVE_PATH, pathname)) {
    return EXECUTIVE_ROLES.includes(role)
  }
  const destination = [...MANAGEMENT_DESTINATIONS, ...ENTERPRISE_DESTINATIONS]
    .sort((left, right) => right.href.length - left.href.length)
    .find(({ href }) =>
      href === "/gestion" ? pathname === href : matchesPath(href, pathname)
    )
  return Boolean(destination && can(role, destination.resource, "consulter"))
}

export function defaultManagementPath(role: AppRole) {
  const primaryPath = PRIMARY_MANAGEMENT_PATHS[role]
  if (primaryPath) return primaryPath

  return (
    MANAGEMENT_DESTINATIONS.find(({ resource }) =>
      can(role, resource, "consulter")
    )?.href ?? "/connexion"
  )
}

export function canAccessSalePath(role: AppRole, pathname: string) {
  if (!SELLER_ROLES.includes(role)) return false
  if (pathname.startsWith("/vente/caisse")) {
    return can(role, "caisse", "consulter")
  }
  if (pathname.startsWith("/vente/ventes-manuelles")) {
    return can(role, "ventes_manuelles", "consulter")
  }
  if (
    pathname.startsWith("/vente/billet") ||
    pathname.startsWith("/vente/bagage") ||
    pathname.startsWith("/vente/colis") ||
    pathname.startsWith("/vente/prestation-speciale") ||
    pathname.startsWith("/vente/encaissement")
  ) {
    return can(role, "ventes", "creer")
  }
  return can(role, "ventes", "consulter")
}
