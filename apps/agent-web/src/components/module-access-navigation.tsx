"use client"

import {
  Boxes,
  Construction,
  FileText,
  Landmark,
  Radio,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import {
  MODULE_MANIFEST,
  type ModuleAccessLevel,
  type ModuleCode,
} from "@workspace/backend/modules"
import { can, type AppRole } from "@workspace/backend/permissions"
import { cn } from "@workspace/ui/lib/utils"

import { PLATFORM_MODULES_API_ENABLED } from "@/lib/platform-modules-runtime"
import { EXECUTIVE_PATH, canAccessManagementPath } from "@/lib/portal-access"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export const MODULE_ICONS: Record<ModuleCode, LucideIcon> = {
  voyageurs: Ticket,
  fret: Boxes,
  cotraf: Radio,
  gmao: Wrench,
  infrastructure: Construction,
  finance: Landmark,
  rh: Users,
  ged: FileText,
  securite: ShieldCheck,
  copilot: Sparkles,
}

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

/** L'espace Direction générale n'est proposé qu'aux rôles qui peuvent l'ouvrir. */
export function canShowExecutiveSpace(role: AppRole | undefined) {
  return Boolean(role && canAccessManagementPath(role, EXECUTIVE_PATH))
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

function ModuleLinks({
  accesses,
  pathname,
  onNavigate,
}: {
  accesses: readonly ModuleNavigationAccess[]
  pathname: string
  onNavigate?: () => void
}) {
  return accesses.map((module) => {
    const Icon = MODULE_ICONS[module.code]
    const active =
      module.route === "/gestion"
        ? pathname.startsWith("/gestion") || pathname.startsWith("/vente")
        : pathname.startsWith(module.route)

    return (
      <Link
        key={module.code}
        href={module.route as Route}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-warning focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
        )}
        onClick={onNavigate}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{module.label}</span>
      </Link>
    )
  })
}

export function DecisionResourcesNavigation({
  role,
  onNavigate,
}: {
  role: AppRole | undefined
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  if (!canShowDecisionResources(role)) return null

  const active = pathname === "/etudes" || pathname.startsWith("/etudes/")

  return (
    <section aria-labelledby="decision-resources-heading" className="min-w-0">
      <h2
        id="decision-resources-heading"
        className="px-3 text-[10px] font-semibold tracking-widest text-sidebar-foreground/65 uppercase"
      >
        Ressources de décision
      </h2>
      <nav aria-label="Ressources de décision" className="mt-2 grid gap-1">
        <Link
          href="/etudes"
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-warning focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          )}
          onClick={onNavigate}
        >
          <ScrollText aria-hidden className="size-5 shrink-0" />
          <span>Audit &amp; documents</span>
        </Link>
      </nav>
    </section>
  )
}

export function ModuleSidebarNavigation({
  role,
  activeModuleCode,
  leading,
  children,
  onNavigate,
  className,
}: {
  role: AppRole | undefined
  activeModuleCode?: ModuleCode
  /** Rubriques d'un espace transverse, rendues avant « Mes modules ». */
  leading?: ReactNode
  children?: ReactNode
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()
  const { accesses, loading } = useModuleNavigationAccesses(role)
  const activeModule = MODULE_MANIFEST.find(
    (module) => module.code === activeModuleCode
  )

  return (
    <div className={cn("grid content-start gap-5", className)}>
      {activeModule ? (
        <section
          aria-labelledby="active-module-heading"
          className="rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3"
        >
          <p className="text-[10px] font-semibold tracking-widest text-sidebar-foreground/65 uppercase">
            Module actif
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-sidebar-primary/15 p-2 text-sidebar-primary-foreground">
              {(() => {
                const Icon = MODULE_ICONS[activeModule.code]
                return <Icon aria-hidden className="size-5" />
              })()}
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="active-module-heading"
                className="truncate text-sm font-bold text-sidebar-foreground"
              >
                Module {activeModule.label}
              </h2>
              <p className="text-[11px] text-sidebar-foreground/65">
                Espace opérationnel
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {leading}

      <section aria-labelledby="my-modules-heading" className="min-w-0">
        <h2
          id="my-modules-heading"
          className="px-3 text-[10px] font-semibold tracking-widest text-sidebar-foreground/65 uppercase"
        >
          Mes modules
        </h2>
        <nav aria-label="Mes modules" className="mt-2 grid gap-1">
          {loading ? (
            <p
              role="status"
              className="min-h-11 px-3 py-3 text-xs text-sidebar-foreground/70"
            >
              Chargement des habilitations…
            </p>
          ) : accesses.length > 0 ? (
            <ModuleLinks
              accesses={accesses}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ) : (
            <p className="px-3 py-3 text-xs leading-relaxed text-sidebar-foreground/70">
              Aucun autre module autorisé.
            </p>
          )}
        </nav>
      </section>

      {children}

      <DecisionResourcesNavigation role={role} onNavigate={onNavigate} />
    </div>
  )
}
