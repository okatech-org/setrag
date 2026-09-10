"use client"

import { LogOut } from "lucide-react"
import { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"

import { initials, sellerDisplayName } from "@/lib/format"
import { asAppRole } from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"
import { EnterpriseTopNav } from "./enterprise-nav"
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
  const session = usePortalSession()
  const user = session?.profile.user
  const role = asAppRole(user?.role)
  const displayName = sellerDisplayName(user?.firstName, user?.lastName)

  return (
    <div className="min-h-dvh flex flex-col bg-canvas text-ink">
      <EnterpriseTopNav />

      {/* En-tête de module et espace du collaborateur connecté */}
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0F2C59] sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs text-ink-muted sm:text-sm">{subtitle}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {actions ? (
              <div className="flex items-center gap-2.5">{actions}</div>
            ) : null}

            {user ? (
              <div className="flex items-center gap-2.5 rounded-pill border border-line bg-surface-raised py-1.5 pr-1.5 pl-3">
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

      {/* Contenu principal */}
      <main className="flex-1 px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Pied de page institutionnel */}
      <footer className="border-t border-line bg-surface py-4 text-center text-xs text-ink-muted">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between px-4 gap-2">
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
