import { PortalGuard } from "@/components/portal-guard"

/**
 * L'espace Direction générale n'est pas un module : pas de `ModuleGuard`.
 * `PortalGuard` vérifie la session et `canAccessManagementPath` réserve
 * `/direction` aux rôles exécutifs ; chaque donnée reste gardée côté serveur.
 */
export default function DirectionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PortalGuard portal="gestion">{children}</PortalGuard>
}
