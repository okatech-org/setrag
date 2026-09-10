"use client"

import {
  Boxes,
  Building2,
  Construction,
  FileText,
  Landmark,
  Radio,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Ticket,
  Train,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { MODULE_MANIFEST, type ModuleCode } from "@workspace/backend/modules"
import type { AppRole } from "@workspace/backend/permissions"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  asAppRole,
  canAccessManagementPath,
  canAccessSalePath,
  portalForRole,
} from "@/lib/portal-access"
import {
  LEGACY_SAFE_MODULE_CODES,
  PLATFORM_MODULES_API_ENABLED,
} from "@/lib/platform-modules-runtime"
import { usePortalSession } from "./portal-guard"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

const MODULE_ICONS: Record<ModuleCode, LucideIcon> = {
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

const UTILITY_MODULES = [
  {
    code: "etudes",
    label: "Audit & Documents",
    route: "/etudes",
    icon: ScrollText,
  },
] as const

export function officialModulesForCodes(enabledCodes: readonly ModuleCode[]) {
  const enabled = new Set(enabledCodes)

  return MODULE_MANIFEST.filter((module) => enabled.has(module.code))
}

export function EnterpriseTopNav({ role }: { role?: AppRole }) {
  const pathname = usePathname()
  const portalSession = usePortalSession()
  const [time, setTime] = useState<string>("")

  const effectiveRole =
    role ??
    (E2E_MODE
      ? "admin_fonctionnel"
      : asAppRole(portalSession?.profile.user.role))
  const isManagementUser = Boolean(
    effectiveRole && portalForRole(effectiveRole) === "gestion"
  )
  const liveModuleCodes = useQuery(
    api.modules.platform.queries.listMyModules,
    E2E_MODE || !PLATFORM_MODULES_API_ENABLED || !isManagementUser ? "skip" : {}
  )
  const enabledModuleCodes = E2E_MODE
    ? MODULE_MANIFEST.filter((module) => module.defaultEnabled).map(
        (module) => module.code
      )
    : PLATFORM_MODULES_API_ENABLED
      ? liveModuleCodes
      : LEGACY_SAFE_MODULE_CODES

  const officialModules = useMemo(
    () =>
      effectiveRole && isManagementUser && enabledModuleCodes !== undefined
        ? officialModulesForCodes(enabledModuleCodes)
        : [],
    [effectiveRole, enabledModuleCodes, isManagementUser]
  )
  const utilityModules =
    effectiveRole && isManagementUser
      ? UTILITY_MODULES.filter(({ route }) =>
          canAccessManagementPath(effectiveRole, route)
        )
      : []
  const maySell = effectiveRole
    ? canAccessSalePath(effectiveRole, "/vente")
    : false

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString("fr-FR", {
          timeZone: "Africa/Libreville",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  const navigationItems = [
    ...officialModules.map((module) => ({
      code: module.code,
      label: module.label,
      route: module.route,
      icon: MODULE_ICONS[module.code],
    })),
    ...utilityModules,
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-surface text-ink shadow-xs">
      {/* Barre institutionnelle supérieure */}
      <div className="flex h-12 items-center justify-between border-b border-line/60 bg-[#0F2C59] px-4 text-white lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Train className="h-5 w-5 text-[#D39E00]" />
            <span className="font-extrabold tracking-wider text-white">
              SETRAG
            </span>
            <span className="hidden text-xs font-semibold tracking-widest text-[#D39E00] uppercase sm:inline">
              · Transgabonais
            </span>
          </div>
          <span className="text-white/40">|</span>
          <span className="text-xs font-medium text-white/80">
            Enterprise Operating System
          </span>
          <Badge
            variant="outline"
            className="hidden border-[#D39E00]/60 bg-[#D39E00]/20 text-xs font-medium text-[#D39E00] md:inline-flex"
          >
            Portail interne
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="hidden items-center gap-2 font-mono text-white/90 sm:flex">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span>Heure de Libreville : {time || "--:--:--"}</span>
          </div>
          {maySell ? (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-7 border-[#D39E00] bg-[#D39E00] text-xs font-bold text-slate-900 hover:bg-[#D39E00]/90"
            >
              <Link href="/vente">
                <Ticket className="mr-1 h-3.5 w-3.5" />
                Guichet Direct
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Les modules officiels restent masqués jusqu'au retour de l'API. */}
      {navigationItems.length > 0 ? (
        <div className="bg-surface-raised no-scrollbar flex overflow-x-auto px-2 py-1.5 lg:px-6">
          <nav
            aria-label="Modules d’entreprise"
            className="flex min-w-max items-center gap-1.5"
          >
            {navigationItems.map((module) => {
              const Icon = module.icon ?? Building2
              const href = module.route as Route
              const isActive =
                (module.route === "/gestion" &&
                  (pathname.startsWith("/gestion") ||
                    pathname.startsWith("/vente"))) ||
                (module.route !== "/gestion" &&
                  pathname.startsWith(module.route))

              return (
                <Link
                  key={module.code}
                  href={href}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "bg-[#0F2C59] text-white shadow-xs"
                      : "text-ink-muted hover:bg-canvas hover:text-ink"
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "h-4 w-4",
                      isActive ? "text-[#D39E00]" : "text-ink-subtle"
                    )}
                  />
                  <span>{module.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
