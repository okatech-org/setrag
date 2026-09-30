"use client"

import {
  Banknote,
  BarChart3,
  BookOpenCheck,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileWarning,
  Gauge,
  Landmark,
  Network,
  Percent,
  Receipt,
  ReceiptText,
  Settings,
  ShoppingCart,
  Tickets,
  TrainFront,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ReactNode, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import type {
  CashSessionSummary,
  PointOfSaleSummary,
  SellerIdentity,
} from "@/lib/agent-data"
import { formatTime } from "@/lib/format"
import {
  asAppRole,
  canAccessManagementPath,
  canAccessSalePath,
} from "@/lib/portal-access"
import { usePortalSession } from "./portal-guard"
import { EnterpriseHeader, enterpriseSidebarClassName } from "./enterprise-nav"
import {
  DecisionResourcesNavigation,
  ModuleSidebarNavigation,
} from "./module-access-navigation"

interface SellerShellProps {
  seller: SellerIdentity
  pointOfSale: PointOfSaleSummary
  session: CashSessionSummary | null
  online: boolean
  onSignOut?: () => void
  portal?: "vente" | "gestion"
  children: ReactNode
}

const saleNavigation = [
  { href: "/vente", label: "Vendre", icon: ShoppingCart },
  {
    href: "/vente/operations",
    label: "Opérations",
    icon: ReceiptText,
  },
  {
    href: "/vente/caisse",
    label: "Ma caisse",
    icon: CircleDollarSign,
  },
  {
    href: "/vente/ventes-manuelles",
    label: "Ventes manuelles",
    icon: BookOpenCheck,
  },
] as const

const managementNavigation = [
  { href: "/gestion", label: "Vue d’ensemble", icon: Gauge },
  { href: "/gestion/livrets", label: "Livrets horaires", icon: BookOpenCheck },
  { href: "/gestion/tarifs", label: "Tarifs", icon: Receipt },
  { href: "/gestion/yield", label: "Yield", icon: Percent },
  { href: "/gestion/trains", label: "Trains & voitures", icon: TrainFront },
  { href: "/gestion/places", label: "Places", icon: Tickets },
  {
    href: "/gestion/points-de-vente",
    label: "Points de vente",
    icon: Building2,
  },
  { href: "/gestion/voyageurs", label: "Voyageurs", icon: Users },
  {
    href: "/gestion/recettes",
    label: "Contrôle des recettes",
    icon: ClipboardCheck,
  },
  { href: "/gestion/comptabilite", label: "Comptabilité", icon: Landmark },
  { href: "/gestion/rapports", label: "Rapports & KPI", icon: BarChart3 },
  { href: "/gestion/incidents", label: "PV & incidents", icon: FileWarning },
  { href: "/gestion/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/gestion/parametrage", label: "Paramétrage", icon: Settings },
  { href: "/gestion/integrations", label: "Intégrations", icon: Network },
] as const

export function SellerShell({
  seller,
  pointOfSale,
  session,
  online,
  onSignOut,
  portal = "vente",
  children,
}: SellerShellProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const portalSession = usePortalSession()
  const role = asAppRole(seller.role)
  const navigation =
    portal === "gestion" ? managementNavigation : saleNavigation
  const authorizedNavigation = role
    ? navigation.filter(({ href }) =>
        portal === "gestion"
          ? canAccessManagementPath(role, href)
          : canAccessSalePath(role, href)
      )
    : navigation
  const effectiveSignOut = portalSession?.signOut ?? onSignOut

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <EnterpriseHeader
        space={portal === "vente" ? "Vente" : "Gestion"}
        scope={pointOfSale.name}
        user={{
          firstName: seller.firstName,
          lastName: seller.lastName,
          matricule: seller.matricule,
          role,
        }}
        menu={{
          open: menuOpen,
          controls: "seller-navigation-sidebar",
          onToggle: () => setMenuOpen((current) => !current),
        }}
        onSignOut={effectiveSignOut}
        signingOut={portalSession?.signingOut}
      />

      <div className="flex min-w-0 flex-1 lg:gap-6 lg:px-6">
        <aside
          id="seller-navigation-sidebar"
          aria-label="Navigation latérale"
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
              aria-label="Fermer la navigation"
              onClick={() => setMenuOpen(false)}
            >
              <X />
            </Button>
          </div>
          {(() => {
            const sectionNavigation = (
              <section
                aria-label={
                  portal === "gestion"
                    ? "Rubriques de gestion"
                    : "Rubriques de vente"
                }
              >
                {portal === "gestion" ? (
                  <h2 className="px-3 text-[10px] font-semibold tracking-widest text-sidebar-foreground/65 uppercase">
                    Rubriques de gestion
                  </h2>
                ) : null}
                <nav
                  aria-label={`Navigation du portail de ${portal}`}
                  className={cn("grid gap-1.5", portal === "gestion" && "mt-2")}
                >
                  {authorizedNavigation.map(({ href, label, icon: Icon }) => {
                    const active =
                      pathname === href ||
                      (href === "/vente" &&
                        (pathname.startsWith("/vente/billet") ||
                          pathname.startsWith("/vente/encaissement") ||
                          pathname.startsWith("/vente/confirmation")))
                    const classes = cn(
                      "text-small flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-warning focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={classes}
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon aria-hidden className="size-5" />
                        {label}
                      </Link>
                    )
                  })}
                </nav>
              </section>
            )

            return portal === "gestion" ? (
              <ModuleSidebarNavigation
                role={role}
                activeModuleCode="voyageurs"
                onNavigate={() => setMenuOpen(false)}
              >
                {sectionNavigation}
              </ModuleSidebarNavigation>
            ) : (
              <div className="grid gap-5">
                {sectionNavigation}
                <DecisionResourcesNavigation
                  role={role}
                  onNavigate={() => setMenuOpen(false)}
                />
              </div>
            )
          })()}

          <div className="mt-auto grid gap-3 border-t border-sidebar-border pt-4">
            <div className="flex items-center gap-3">
              {portal === "vente" ? (
                <Banknote className="size-5" />
              ) : (
                <Boxes className="size-5" />
              )}
              <div className="min-w-0">
                <p className="text-caption font-semibold">
                  {portal === "gestion"
                    ? "Périmètre réseau"
                    : session
                      ? "Caisse ouverte"
                      : "Caisse fermée"}
                </p>
                <p className="tabular text-caption text-ink-muted">
                  {portal === "gestion"
                    ? "Toutes gares et agences"
                    : session
                      ? `depuis ${formatTime(session.openedAt)}`
                      : "vente bloquée"}
                </p>
              </div>
            </div>
            <Badge
              variant={online ? "success" : "warning"}
              className="w-full justify-start py-1.5"
            >
              {online ? <Wifi /> : <WifiOff />}
              {online ? "Connecté au système central" : "Hors ligne"}
            </Badge>
          </div>
        </aside>

        {menuOpen ? (
          <button
            type="button"
            aria-label="Fermer le menu"
            className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-4">
          {children}
        </main>
      </div>
    </div>
  )
}
