"use client"

import {
  Boxes,
  Construction,
  FileText,
  Landmark,
  Radio,
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
  moduleAccessLevelLabel,
  type ModuleAccessLevel,
  type ModuleCode,
} from "@workspace/backend/modules"
import { can, type AppRole } from "@workspace/backend/permissions"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { PLATFORM_MODULES_API_ENABLED } from "@/lib/platform-modules-runtime"

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
  return (
    role !== "admin_it" && (level === "utilisation" || level === "admin")
  )
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

export function ModuleAccessBadge({
  level,
  systemAdmin = false,
  className,
}: {
  level: ModuleAccessLevel
  systemAdmin?: boolean
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border-current/25 bg-current/10 text-[10px] leading-4 font-semibold text-inherit",
        className
      )}
    >
      {systemAdmin && level === "admin"
        ? "Admin système"
        : moduleAccessLevelLabel(level)}
    </Badge>
  )
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
          "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#D39E00] focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
        )}
        onClick={onNavigate}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{module.label}</span>
        {module.accessLevel ? (
          <ModuleAccessBadge level={module.accessLevel} />
        ) : null}
      </Link>
    )
  })
}

export function ModuleSidebarNavigation({
  role,
  activeModuleCode,
  children,
  onNavigate,
  className,
}: {
  role: AppRole | undefined
  activeModuleCode: ModuleCode
  children?: ReactNode
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()
  const { accesses, loading } = useModuleNavigationAccesses(role)
  const activeModule = MODULE_MANIFEST.find(
    (module) => module.code === activeModuleCode
  )
  const activeAccess = accesses.find(
    (access) => access.code === activeModuleCode
  )

  return (
    <div className={cn("grid content-start gap-5", className)}>
      <section
        aria-labelledby="active-module-heading"
        className="rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3"
      >
        <p className="text-[10px] font-semibold tracking-widest text-sidebar-foreground/65 uppercase">
          Module actif
        </p>
        <div className="mt-2 flex items-center gap-2">
          {activeModule ? (
            <span className="rounded-md bg-sidebar-primary/15 p-2 text-sidebar-primary-foreground">
              {(() => {
                const Icon = MODULE_ICONS[activeModule.code]
                return <Icon aria-hidden className="size-5" />
              })()}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2
              id="active-module-heading"
              className="truncate text-sm font-bold text-sidebar-foreground"
            >
              Module {activeModule?.label ?? "métier"}
            </h2>
            <p className="text-[11px] text-sidebar-foreground/65">
              Espace opérationnel
            </p>
          </div>
          {activeAccess?.accessLevel ? (
            <ModuleAccessBadge
              level={activeAccess.accessLevel}
              systemAdmin={role === "admin_it"}
            />
          ) : null}
        </div>
      </section>

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
    </div>
  )
}
