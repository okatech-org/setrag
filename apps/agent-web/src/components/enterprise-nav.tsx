"use client"

import { LogOut, Menu, Ticket, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ReactNode, useEffect, useState } from "react"

import { MODULE_MANIFEST } from "@workspace/backend/modules"
import {
  EXTERNAL_STAKEHOLDER_ROLES,
  type AppRole,
} from "@workspace/backend/permissions"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { formatTime, initials, sellerDisplayName } from "@/lib/format"
import { canAccessSalePath } from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"

/**
 * Barre latérale détachée, partagée par les deux shells : tiroir plein écran
 * sous `lg`, carte flottante collée sous l'en-tête au-delà (marges, coins
 * arrondis, bordure et ombre légère). Les décalages supposent l'en-tête de
 * 4 rem rendu par `EnterpriseHeader` et la marge verticale de 1.5 rem.
 */
export function enterpriseSidebarClassName(open: boolean) {
  return cn(
    "fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-x-hidden overflow-y-auto bg-sidebar p-4 text-sidebar-foreground shadow-xl transition-[transform,visibility]",
    "lg:visible lg:sticky lg:top-22 lg:z-20 lg:my-6 lg:h-[calc(100dvh-7rem)] lg:shrink-0 lg:translate-x-0 lg:rounded-2xl lg:border lg:border-sidebar-border lg:shadow-sm",
    open ? "visible translate-x-0" : "invisible -translate-x-full"
  )
}

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** Libellé de l'espace actif porté par la pastille de l'en-tête. */
export function spaceLabelForPathname(pathname: string) {
  if (matchesRoute(pathname, "/vente")) return "Vente"
  if (matchesRoute(pathname, "/administration")) return "Administration"
  if (matchesRoute(pathname, "/etudes")) return "Audit & documents"
  if (matchesRoute(pathname, "/direction")) return "Direction générale"

  const activeModule = MODULE_MANIFEST.find(
    (candidate) =>
      candidate.route !== "/gestion" && matchesRoute(pathname, candidate.route)
  )

  return activeModule?.label ?? "Gestion"
}

/** Heure de Libreville, rafraîchie au changement de minute ; vide avant hydratation. */
function useLibrevilleClock() {
  const [clock, setClock] = useState("")

  useEffect(() => {
    let timer = 0
    const tick = () => {
      const now = new Date()
      setClock(formatTime(now))
      timer = window.setTimeout(tick, 60_000 - (now.getTime() % 60_000) + 250)
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [])

  return clock
}

export interface EnterpriseHeaderUser {
  firstName?: string
  lastName?: string
  matricule?: string
  role?: AppRole
}

export interface EnterpriseHeaderProps {
  /** Libellé de l'espace actif ; dérivé de l'URL quand il n'est pas fourni. */
  space?: string
  /** Périmètre de travail (point de vente, direction, réseau). */
  scope?: string
  user?: EnterpriseHeaderUser
  /** Bouton du tiroir de navigation, affiché sous `lg` seulement. */
  menu?: { open: boolean; controls: string; onToggle: () => void }
  actions?: ReactNode
  onSignOut?: () => void
  signingOut?: boolean
}

/**
 * En-tête unique du portail : marque, espace actif, périmètre, compte et heure
 * de Libreville sur une seule barre claire. Les modules se choisissent dans la
 * barre latérale, jamais ici.
 */
export function EnterpriseHeader({
  space,
  scope,
  user,
  menu,
  actions,
  onSignOut,
  signingOut = false,
}: EnterpriseHeaderProps) {
  const pathname = usePathname()
  const clock = useLibrevilleClock()
  const role = user?.role
  const isExternalStakeholder = Boolean(
    role && (EXTERNAL_STAKEHOLDER_ROLES as readonly AppRole[]).includes(role)
  )
  const maySell = Boolean(role && canAccessSalePath(role, "/vente"))
  const roleLabel = role ? ROLE_LABELS[role] : undefined
  const identity = user
    ? [sellerDisplayName(user.firstName, user.lastName), user.matricule]
        .filter(Boolean)
        .join(" · ")
    : undefined
  const accountTitle = [identity, roleLabel].filter(Boolean).join(" · ")

  return (
    <header
      data-slot="enterprise-header"
      className="sticky top-0 z-40 border-b border-line bg-surface text-ink shadow-xs"
    >
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        {menu ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="-ml-2 lg:hidden"
            aria-label={menu.open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menu.open}
            aria-controls={menu.controls}
            onClick={menu.onToggle}
          >
            {menu.open ? <X /> : <Menu />}
          </Button>
        ) : null}

        {/* Marque unique du portail */}
        <div className="flex shrink-0 items-center gap-3">
          <Image
            src="/setrag-logo.png"
            alt="SETRAG"
            width={118}
            height={42}
            priority
            className="h-9 w-auto"
          />
          <div className="hidden leading-tight xl:block">
            <p className="text-caption font-semibold">
              Enterprise Operating System
            </p>
            <p className="text-caption text-ink-muted">
              {isExternalStakeholder ? "Portail partenaire" : "Portail interne"}
            </p>
          </div>
        </div>

        <div aria-hidden className="hidden h-8 w-px bg-line sm:block" />

        <div
          className="flex min-w-0 items-center rounded-pill bg-surface-sunk p-1"
          aria-label="Espace actif"
        >
          <span className="text-small truncate rounded-pill bg-ink px-3 py-2 font-semibold text-ink-inverse sm:px-4">
            {space ?? spaceLabelForPathname(pathname)}
          </span>
        </div>

        {/* Sous md, seuls l'avatar et la déconnexion restent : le bloc ne doit
            pas rétrécir sous leur largeur, la pastille d'espace se tronque. */}
        <div className="ml-auto flex shrink-0 items-center gap-3 md:min-w-0 md:shrink">
          {maySell ? (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="hidden sm:inline-flex"
            >
              <Link href="/vente">
                <Ticket />
                Guichet Direct
              </Link>
            </Button>
          ) : null}

          {actions ? (
            <div className="hidden items-center gap-2.5 md:flex">{actions}</div>
          ) : null}

          {user ? (
            <div
              className="hidden min-w-0 text-right md:block"
              title={accountTitle || undefined}
            >
              <p className="text-small truncate font-semibold">
                {scope ?? roleLabel ?? "Habilitation inconnue"}
              </p>
              <p className="text-caption truncate text-ink-muted">{identity}</p>
            </div>
          ) : null}

          <div aria-hidden className="hidden h-8 w-px bg-line sm:block" />

          <div className="hidden min-w-14 text-center sm:block">
            <p className="font-mono text-sm font-semibold tabular-nums">
              {clock || "--:--"}
            </p>
            <p className="text-caption text-ink-muted">Libreville</p>
          </div>

          {user ? (
            <div
              className="text-small flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink"
              title={accountTitle || undefined}
            >
              <span aria-hidden>{initials(user.firstName, user.lastName)}</span>
              <span className="sr-only md:hidden">{accountTitle}</span>
            </div>
          ) : null}

          {onSignOut ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Se déconnecter"
              disabled={signingOut}
              onClick={onSignOut}
            >
              <LogOut />
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
