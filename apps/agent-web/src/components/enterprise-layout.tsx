"use client"

import { X } from "lucide-react"
import { usePathname } from "next/navigation"
import { ReactNode, useState } from "react"

import { MODULE_MANIFEST } from "@workspace/backend/modules"
import { Button } from "@workspace/ui/components/button"

import { asAppRole, EXECUTIVE_PATH } from "@/lib/portal-access"
import { EnterpriseHeader, enterpriseSidebarClassName } from "./enterprise-nav"
import {
  canPerformModuleActions,
  canShowDecisionResources,
  canShowExecutiveSpace,
  ModuleSidebarNavigation,
  useModuleNavigationAccesses,
} from "./module-access-navigation"
import { usePortalSession } from "./portal-guard"

export interface EnterpriseShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
  /** Libellé de la pastille d'espace ; dérivé de l'URL quand il est absent. */
  space?: string
  /** Périmètre affiché dans le bloc compte (réseau, direction, site). */
  scope?: string
  /**
   * Rubriques d'un espace transverse, rendues dans la barre latérale avant
   * « Mes modules ». Le rappel reçoit la fermeture du tiroir mobile.
   */
  navigation?: (context: { onNavigate: () => void }) => ReactNode
  /** Élément rendu au-dessus du titre : lien de retour, surtitre. */
  eyebrow?: ReactNode
}

export function EnterpriseShell({
  title,
  subtitle,
  children,
  actions,
  space,
  scope,
  navigation,
  eyebrow,
}: EnterpriseShellProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const session = usePortalSession()
  const user = session?.profile.user
  const role = asAppRole(user?.role)
  const activeModule = MODULE_MANIFEST.find(
    (module) => module.route !== "/gestion" && pathname.startsWith(module.route)
  )
  const isExecutiveSpace =
    pathname === EXECUTIVE_PATH || pathname.startsWith(`${EXECUTIVE_PATH}/`)
  const showLateralNavigation = Boolean(
    activeModule ||
    (pathname.startsWith("/etudes") && canShowDecisionResources(role)) ||
    (isExecutiveSpace && canShowExecutiveSpace(role))
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
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      {/* Lien d'évitement : premier élément focalisable, visible au clavier. */}
      <a
        href="#contenu"
        className="text-small sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold"
      >
        Aller au contenu
      </a>
      <EnterpriseHeader
        space={space}
        scope={scope}
        user={
          user
            ? {
                firstName: user.firstName,
                lastName: user.lastName,
                matricule: user.matricule,
                role,
              }
            : undefined
        }
        menu={
          showLateralNavigation
            ? {
                open: menuOpen,
                controls: "enterprise-module-sidebar",
                onToggle: () => setMenuOpen((current) => !current),
              }
            : undefined
        }
        onSignOut={session ? () => void session.signOut() : undefined}
        signingOut={session?.signingOut}
      />

      <div className="flex min-w-0 flex-1 lg:gap-6 lg:px-6">
        {showLateralNavigation ? (
          <aside
            id="enterprise-module-sidebar"
            aria-label="Navigation latérale des modules"
            className={enterpriseSidebarClassName(menuOpen)}
          >
            <div className="mb-4 flex min-h-11 items-center justify-between lg:hidden">
              <span className="text-xs font-bold tracking-widest uppercase">
                Navigation
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Fermer la navigation des modules"
                onClick={closeMenu}
              >
                <X />
              </Button>
            </div>
            <ModuleSidebarNavigation
              role={role}
              activeModuleCode={activeModule?.code}
              leading={navigation?.({ onNavigate: closeMenu })}
              onNavigate={closeMenu}
            />
          </aside>
        ) : null}

        {menuOpen && showLateralNavigation ? (
          <button
            type="button"
            aria-label="Fermer la navigation des modules"
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
            onClick={closeMenu}
          />
        ) : null}

        {/* Colonne de contenu : le pied de page y reste pour que la barre
            latérale collante garde son décalage jusqu'en bas de page. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Un seul landmark principal, partagé par tous les modules. */}
          <main
            id="contenu"
            className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-4"
          >
            <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-5">
              {/* En-tête de page : surtitre éventuel, titre, sous-titre et actions */}
              <header className="grid gap-3">
                {eyebrow ? (
                  <div className="flex items-center">{eyebrow}</div>
                ) : null}
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-h2">{title}</h1>
                    {subtitle ? (
                      <p className="text-small mt-2 max-w-3xl text-ink-muted">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                  {actions && !isReadOnly ? (
                    <div className="flex flex-wrap items-center gap-2.5">
                      {actions}
                    </div>
                  ) : null}
                </div>
              </header>

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
      </div>
    </div>
  )
}
