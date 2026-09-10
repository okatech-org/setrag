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
  LogOut,
  Menu,
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
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ReactNode, useEffect, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import type {
  CashSessionSummary,
  PointOfSaleSummary,
  SellerIdentity,
} from "@/lib/agent-data"
import { formatTime, initials, sellerDisplayName } from "@/lib/format"
import {
  asAppRole,
  canAccessManagementPath,
  canAccessSalePath,
} from "@/lib/portal-access"
import { usePortalSession } from "./portal-guard"
import { EnterpriseTopNav } from "./enterprise-nav"

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
  const [clock, setClock] = useState<Date | null>(null)
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

  useEffect(() => {
    const update = () => setClock(new Date())
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="min-h-dvh bg-canvas">
      <EnterpriseTopNav role={role} />
      <header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b border-line bg-surface px-4 shadow-sm lg:px-6">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="lg:hidden"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>

        <Image
          src="/setrag-logo.png"
          alt="SETRAG"
          width={118}
          height={42}
          priority
          className="h-10 w-auto"
        />

        <div
          className="ml-3 hidden items-center rounded-pill bg-surface-sunk p-1 md:flex"
          aria-label="Espace actif"
        >
          <span className="text-small rounded-pill bg-ink px-4 py-2 font-semibold text-ink-inverse">
            {portal === "vente" ? "Vente" : "Gestion"}
          </span>
        </div>

        <div className="ml-auto hidden min-w-0 text-right md:block">
          <p className="text-small truncate font-semibold">
            {pointOfSale.name}
          </p>
          <p className="text-caption text-ink-muted">
            {sellerDisplayName(seller.firstName, seller.lastName)}
            {seller.matricule ? ` · ${seller.matricule}` : ""}
          </p>
        </div>

        <div className="hidden h-8 w-px bg-line sm:block" />
        <span className="tabular text-small hidden min-w-12 text-center font-semibold sm:block">
          {clock ? formatTime(clock) : "--:--"}
        </span>

        <div
          className="text-small flex size-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink"
          aria-label={`Agent ${sellerDisplayName(seller.firstName, seller.lastName)}`}
        >
          {initials(seller.firstName, seller.lastName)}
        </div>

        {effectiveSignOut ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Se déconnecter"
            onClick={effectiveSignOut}
          >
            <LogOut />
          </Button>
        ) : null}
      </header>

      <div className="flex min-w-0">
        <aside
          className={cn(
            "fixed inset-y-18 left-0 z-20 flex w-72 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground transition-transform lg:sticky lg:top-18 lg:h-[calc(100dvh-4.5rem)] lg:translate-x-0",
            menuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <nav
            aria-label={`Navigation du portail de ${portal}`}
            className="grid gap-1.5"
          >
            {authorizedNavigation.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href ||
                (href === "/vente" &&
                  (pathname.startsWith("/vente/billet") ||
                    pathname.startsWith("/vente/encaissement") ||
                    pathname.startsWith("/vente/confirmation")))
              const classes = cn(
                "text-small flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )
              return (
                <Link
                  key={href}
                  href={href}
                  className={classes}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              )
            })}
          </nav>

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
            className="fixed inset-0 top-18 z-10 bg-ink/30 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
