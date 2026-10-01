"use client"


import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import {
  MODULE_MANIFEST,
  type ModuleAccessLevel,
  type ModuleCode,
} from "@workspace/backend/modules"
import { can, type AppRole } from "@workspace/backend/permissions"

import { PLATFORM_MODULES_API_ENABLED } from "@/lib/platform-modules-runtime"
import { canAccessManagementPath } from "@/lib/portal-access"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export interface ModuleNavigationAccess {
  code: ModuleCode
  label: string
  route: string
  enabled: boolean
  canAccess: boolean
  accessLevel: ModuleAccessLevel | null
  accessSource: string | null
}

function fallbackLevelForRole(
  role: AppRole,
  resource: (typeof MODULE_MANIFEST)[number]["resource"]
): ModuleAccessLevel {
  if (role === "admin_it") return "admin"
  if (
    can(role, resource, "creer") ||
    can(role, resource, "modifier") ||
    can(role, resource, "supprimer") ||
    can(role, resource, "valider")
  ) {
    return "utilisation"
  }
  return "lecture"
}

/**
 * Repli fermé par défaut : seuls les modules activés par défaut ET autorisés
 * par la matrice historique sont révélés avant l'activation de la nouvelle API.
 */
export function fallbackModuleAccesses(
  role: AppRole | undefined
): ModuleNavigationAccess[] {
  if (!role) return []

  return MODULE_MANIFEST.filter(
    (module) => module.defaultEnabled && can(role, module.resource, "consulter")
  ).map((module) => ({
    code: module.code,
    label: module.label,
    route: module.route,
    enabled: true,
    canAccess: true,
    accessLevel: fallbackLevelForRole(role, module.resource),
    accessSource: "role",
  }))
}

export function visibleModuleAccesses(
  accesses: readonly ModuleNavigationAccess[]
) {
  return accesses.filter(
    (access) => access.enabled && access.canAccess && access.accessLevel
  )
}

/** Lecture seule ne permet aucune action métier ou de paramétrage. */
export function canPerformModuleActions(
  level: ModuleAccessLevel | null | undefined,
  role?: AppRole
) {
  return role !== "admin_it" && (level === "utilisation" || level === "admin")
}

export function canAdministerModules(
  role: AppRole | undefined,
  decisions: readonly Pick<ModuleNavigationAccess, "accessLevel">[]
) {
  return (
    role === "admin_it" ||
    decisions.some(({ accessLevel }) => accessLevel === "admin")
  )
}

export function canShowDecisionResources(role: AppRole | undefined) {
  return Boolean(role && canAccessManagementPath(role, "/etudes"))
}

export function useModuleNavigationAccesses(role: AppRole | undefined) {
  const shouldUseApi =
    Boolean(role) && PLATFORM_MODULES_API_ENABLED && !E2E_MODE
  const liveAccesses = useQuery(
    api.modules.platform.queries.listMyModuleAccesses,
    shouldUseApi ? {} : "skip"
  )
  const fallback = fallbackModuleAccesses(role)
  const decisions = shouldUseApi ? (liveAccesses ?? []) : fallback

  return {
    accesses: visibleModuleAccesses(decisions),
    decisions,
    loading: shouldUseApi && liveAccesses === undefined,
  }
}
