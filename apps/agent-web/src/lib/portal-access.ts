import {
  APP_ROLES,
  can,
  type AppRole,
  type Permission,
  type ProtectedResource,
} from "@workspace/backend/permissions"

export type StaffPortal = "vente" | "gestion"

export const SELLER_ROLES: readonly AppRole[] = [
  "vendeur_guichet",
  "vendeur_agence",
  "taxateur",
]

export const MANAGEMENT_DESTINATIONS = [
  { href: "/gestion", resource: "rapports" },
  { href: "/gestion/livrets", resource: "livrets_horaires" },
  { href: "/gestion/tarifs", resource: "tarifs" },
  { href: "/gestion/yield", resource: "yield" },
  { href: "/gestion/trains", resource: "referentiel" },
  { href: "/gestion/places", resource: "places" },
  { href: "/gestion/points-de-vente", resource: "referentiel" },
  { href: "/gestion/voyageurs", resource: "donnees_voyageurs" },
  { href: "/gestion/recettes", resource: "journee_comptable" },
  { href: "/gestion/comptabilite", resource: "journal_comptable" },
  { href: "/gestion/rapports", resource: "rapports" },
  { href: "/gestion/incidents", resource: "incidents" },
  { href: "/gestion/utilisateurs", resource: "utilisateurs" },
  { href: "/gestion/parametrage", resource: "parametrage" },
  { href: "/gestion/integrations", resource: "integrations" },
] as const satisfies readonly {
  href: string
  resource: ProtectedResource
}[]

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
  const destination = [...MANAGEMENT_DESTINATIONS]
    .sort((left, right) => right.href.length - left.href.length)
    .find(
      ({ href }) =>
        pathname === href ||
        (href !== "/gestion" && pathname.startsWith(`${href}/`))
    )
  return Boolean(destination && can(role, destination.resource, "consulter"))
}

export function defaultManagementPath(role: AppRole) {
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
