"use client"

import { Handshake, LogOut, Menu, X } from "lucide-react"
import { usePathname } from "next/navigation"
import { ReactNode, useState } from "react"

import { MODULE_MANIFEST } from "@workspace/backend/modules"
import {
  EXTERNAL_STAKEHOLDER_ROLES,
  type AppRole,
} from "@workspace/backend/permissions"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { initials, sellerDisplayName } from "@/lib/format"
import { asAppRole } from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"
import { EnterpriseTopNav } from "./enterprise-nav"
import {
  canPerformModuleActions,
  ModuleAccessBadge,
  ModuleSidebarNavigation,
  useModuleNavigationAccesses,
} from "./module-access-navigation"
import { usePortalSession } from "./portal-guard"

export function EnterpriseShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const session = usePortalSession()
  const user = session?.profile.user
  const role = asAppRole(user?.role)
  const displayName = sellerDisplayName(user?.firstName, user?.lastName)
  const isExternalStakeholder = Boolean(
    role && (EXTERNAL_STAKEHOLDER_ROLES as readonly AppRole[]).includes(role)
  )
  const activeModule = MODULE_MANIFEST.find(
    (module) => module.route !== "/gestion" && pathname.startsWith(module.route)
  )
  const { accesses: moduleAccesses, loading: moduleAccessesLoading } =
    useModuleNavigationAccesses(role)
  const activeAccess = activeModule
    ? moduleAccesses.find(({ code }) => code === activeModule.code)
    : undefined
  const isSystemGovernance = role === "admin_it" && Boolean(activeModule)
  const isReadOnly = Boolean(
    activeModule &&
    (moduleAccessesLoading ||
      (activeAccess &&
        !canPerformModuleActions(activeAccess.accessLevel, role)))
  )

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <EnterpriseTopNav />

      {/* En-tête de module et espace du collaborateur connecté */}
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {activeModule ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="shrink-0 lg:hidden"
                aria-label="Ouvrir la navigation des modules"
                aria-expanded={menuOpen}
                aria-controls="enterprise-module-sidebar"
                onClick={() => setMenuOpen(true)}
              >
                <Menu />
              </Button>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[#0F2C59] sm:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-xs text-ink-muted sm:text-sm">{subtitle}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isExternalStakeholder ? (
              <Badge variant="warning">
                <Handshake aria-hidden />
                Accès partenaire · lecture seule
              </Badge>
            ) : null}

            {activeAccess?.accessLevel ? (
              <ModuleAccessBadge
                level={activeAccess.accessLevel}
                systemAdmin={role === "admin_it"}
                className="text-[#0F2C59]"
              />
            ) : null}

            {actions && !isReadOnly ? (
              <div className="flex items-center gap-2.5">{actions}</div>
            ) : null}

            {user ? (
              <div className="bg-surface-raised flex items-center gap-2.5 rounded-pill border border-line py-1.5 pr-1.5 pl-3">
                <div
                  aria-hidden
                  className="text-caption flex size-9 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink"
                >
                  {initials(user.firstName, user.lastName)}
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="text-caption truncate font-semibold">
                    {displayName}
                    {user.matricule ? ` · ${user.matricule}` : ""}
                  </p>
                  <p className="text-caption text-ink-muted">
                    {role ? ROLE_LABELS[role] : "Habilitation inconnue"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Se déconnecter"
                  disabled={session?.signingOut}
                  onClick={() => void session?.signOut()}
                >
                  <LogOut />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1">
        {activeModule ? (
          <aside
            id="enterprise-module-sidebar"
            aria-label="Navigation latérale des modules"
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground shadow-xl transition-[transform,visibility] lg:visible lg:sticky lg:top-28 lg:z-20 lg:h-[calc(100dvh-7rem)] lg:shrink-0 lg:translate-x-0 lg:shadow-none",
              menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
            )}
          >
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="text-xs font-bold tracking-widest uppercase">
                Navigation
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Fermer la navigation des modules"
                onClick={() => setMenuOpen(false)}
              >
                <X />
              </Button>
            </div>
            <ModuleSidebarNavigation
              role={role}
              activeModuleCode={activeModule.code}
              onNavigate={() => setMenuOpen(false)}
            />
          </aside>
        ) : null}

        {menuOpen && activeModule ? (
          <button
            type="button"
            aria-label="Fermer la navigation des modules"
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        {/* Un seul landmark principal, partagé par tous les modules. */}
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4">
            {isReadOnly ? (
              <div
                role="status"
                className="rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-muted"
              >
                {isSystemGovernance
                  ? "Administration système : le module reste visible pour la gouvernance des accès, sans action métier."
                  : "Mode Lecture : les informations restent visibles, mais les actions du module sont désactivées."}
              </div>
            ) : null}
            <fieldset disabled={isReadOnly} className="contents">
              {children}
            </fieldset>
          </div>
        </main>
      </div>

      {/* Pied de page institutionnel */}
      <footer className="border-t border-line bg-surface py-4 text-center text-xs text-ink-muted">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
          <span>
            SETRAG · Société d&apos;Exploitation du Transgabonais · Réseau
            National (648 km)
          </span>
          <span className="font-mono text-[11px]">
            Conformité OHADA · Lois du Gabon · ARTF
          </span>
        </div>
      </footer>
    </div>
  )
}
