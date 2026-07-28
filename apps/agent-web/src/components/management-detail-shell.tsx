"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"

import { useOnlineStatus } from "@/hooks/use-online-status"
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
        {children}
      </div>
    </SellerShell>
  )
}
