import type {
  AppRole,
  Permission,
  ProtectedResource,
} from "@workspace/backend/permissions"
import {
  hasModuleAccessLevel,
  moduleCodeForResource,
  type ModuleAccessLevel,
} from "@workspace/backend/modules"

import { canRole } from "@/lib/portal-access"

/**
 * Droits d’un écran de pilotage, calculés comme le serveur les applique
 * (`assertPermission`, `convex/lib/auth.ts`) :
 *
 * - une habilitation directe sur le module (« grant ») plafonne le droit ;
 *   pour les ressources ordinaires elle le remplace, pour les ressources
 *   fines (caisse, journées et journal comptables…) la matrice des rôles
 *   s’applique en plus ;
 * - sans habilitation directe, la matrice des rôles fait foi.
 *
 * L’administration système (`admin_it`) garde ses droits techniques
 * (intégrations, sécurité) mais n’exécute aucune action métier depuis la
 * gestion — comme dans le reste du portail.
 */

/** Ressources dont le module ne plafonne que s’il y a une habilitation directe. */
const RESSOURCES_FINES = new Set<ProtectedResource>([
  "ventes",
  "annulations",
  "remboursements",
  "duplicatas",
  "ventes_manuelles",
  "caisse",
  "journee_comptable",
  "journal_comptable",
  "donnees_voyageurs",
  "controles",
  "proces_verbaux",
  "incidents",
])

/** Ressources de paramétrage : une habilitation directe doit être « admin ». */
const RESSOURCES_CONFIGURATION = new Set<ProtectedResource>([
  "referentiel",
  "livrets_horaires",
  "tarifs",
  "yield",
  "places",
  "quotas_agences",
  "utilisateurs",
  "parametrage",
  "integrations",
])

/** Ce que l’administration système peut faire depuis la gestion. */
const ACTIONS_TECHNIQUES = new Set<ProtectedResource>(["integrations", "parametrage"])

export interface AccesModule {
  code: string
  accessLevel: ModuleAccessLevel | null
  accessSource: string | null
}

export function niveauRequis(resource: ProtectedResource, permission: Permission): ModuleAccessLevel {
  if (permission === "consulter") return "lecture"
  return RESSOURCES_CONFIGURATION.has(resource) ? "admin" : "utilisation"
}

export function peutAgir(
  role: AppRole | undefined,
  acces: readonly AccesModule[],
  resource: ProtectedResource,
  permission: Permission = "consulter"
): boolean {
  if (!role) return false
  if (role === "admin_it" && permission !== "consulter" && !ACTIONS_TECHNIQUES.has(resource)) {
    return false
  }
  const code = moduleCodeForResource(resource)
  const habilitation = code ? acces.find((a) => a.code === code && a.accessSource === "grant") : undefined
  if (habilitation && role !== "admin_it") {
    if (!hasModuleAccessLevel(habilitation.accessLevel, niveauRequis(resource, permission))) return false
    if (!RESSOURCES_FINES.has(resource)) return true
  }
  return canRole(role, resource, permission)
}
