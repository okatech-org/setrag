"use client"

import type { Permission, ProtectedResource } from "@workspace/backend/permissions"

import { usePortalSession } from "@/components/portal-guard"
import {
  canPerformModuleActions,
  useModuleNavigationAccesses,
} from "@/components/module-access-navigation"
import { asAppRole, canRole } from "@/lib/portal-access"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

/**
 * Ressources de gouvernance : l'administrateur système y agit, alors qu'il
 * reste en lecture sur toute action métier (vente, tarifs, exploitation).
 */
const GOUVERNANCE = new Set<ProtectedResource>(["utilisateurs", "parametrage", "integrations"])

/**
 * Droits de l'agent sur les écrans de gestion, avec la même logique que
 * `ManagementPageClient` : la matrice fine (`canRole`) d'abord, puis le
 * niveau d'accès au module Voyageurs — un niveau « lecture » coupe toute
 * action. La consultation, elle, ne dépend que de la matrice.
 */
export function useDroitsGestion() {
  const session = usePortalSession()
  const role = E2E_MODE ? ("admin_fonctionnel" as const) : asAppRole(session?.profile.user.role)
  const { accesses, loading } = useModuleNavigationAccesses(role)
  const niveau = accesses.find(({ code }) => code === "voyageurs")?.accessLevel
  const actionsModule = canPerformModuleActions(niveau, role)

  function may(resource: ProtectedResource, permission: Permission = "consulter") {
    if (!canRole(role, resource, permission)) return false
    if (permission === "consulter") return true
    if (role === "admin_it") return GOUVERNANCE.has(resource)
    return actionsModule
  }

  return {
    role,
    utilisateur: session?.profile.user ?? null,
    may,
    /** Les habilitations modulaires sont encore en lecture. */
    chargement: loading,
    /** Niveau « lecture » sur le module : les actions sont coupées. */
    lectureModule: !loading && !actionsModule,
  }
}

export type DroitsGestion = ReturnType<typeof useDroitsGestion>
