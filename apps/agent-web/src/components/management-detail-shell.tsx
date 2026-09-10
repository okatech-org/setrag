"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"

import { useOnlineStatus } from "@/hooks/use-online-status"
import { asAppRole } from "@/lib/portal-access"
import {
  canPerformModuleActions,
  useModuleNavigationAccesses,
} from "./module-access-navigation"
import { SellerShell } from "./seller-shell"
import { usePortalSession } from "./portal-guard"

const MANAGEMENT_SCOPE = {
  code: "DCO",
  name: "Direction commerciale · réseau entier",
  type: "siege",
}

export function ManagementDetailShell({
  title,
  eyebrow,
  backHref,
  children,
}: {
  title: string
  eyebrow: string
  backHref: string
  children: ReactNode
}) {
  const online = useOnlineStatus()
  const session = usePortalSession()
  const user = session?.profile.user
  const role = asAppRole(user?.role)
  const { accesses: moduleAccesses, loading: moduleAccessesLoading } =
    useModuleNavigationAccesses(role)
  const voyageursAccessLevel = moduleAccesses.find(
    ({ code }) => code === "voyageurs"
  )?.accessLevel
  const isReadOnly =
    moduleAccessesLoading ||
    (voyageursAccessLevel !== undefined &&
      !canPerformModuleActions(voyageursAccessLevel, role))

  if (!user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <p role="status" className="text-small text-ink-muted">
          Vérification de la session…
        </p>
      </main>
    )
  }

  return (
    <SellerShell
      seller={{
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        matricule: user.matricule,
        role: user.role,
      }}
      pointOfSale={MANAGEMENT_SCOPE}
      session={null}
      online={online}
      portal="gestion"
    >
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <span className="text-mono-label text-accent-ink">{eyebrow}</span>
            <h1 className="text-h2 mt-1">{title}</h1>
          </div>
          <Button asChild variant="secondary">
            <Link href={backHref as Route}>
              <ArrowLeft />
              Retour à la liste
            </Link>
          </Button>
        </header>
        {isReadOnly ? (
          <div
            role="status"
            className="rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-muted"
          >
            {role === "admin_it"
              ? "Administration système : ce dossier est visible pour la gouvernance, sans action métier."
              : "Mode Lecture : vous pouvez consulter ce dossier, mais ses actions sont désactivées."}
          </div>
        ) : null}
        <fieldset disabled={isReadOnly} className="contents">
          {children}
        </fieldset>
      </div>
    </SellerShell>
  )
}
