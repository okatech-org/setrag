"use client"

import type { FunctionReturnType } from "convex/server"
import { Boxes, Database, ShieldCheck } from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { EnterpriseShell } from "@/components/enterprise-layout"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export type FreightDashboard = FunctionReturnType<
  typeof api.modules.fret.queries.dashboard
>

const E2E_EMPTY_DASHBOARD = {
  moduleCode: "fret",
  dataState: "empty",
  accessibleSiteIds: [],
  kpis: [],
  operations: [],
  alerts: [],
} satisfies FreightDashboard

function FreightDashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Chargement des données Fret"
      className="grid gap-4"
    >
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}

export function FreightDashboardScreen({
  dashboard,
}: {
  dashboard: FreightDashboard
}) {
  const itemCount =
    dashboard.kpis.length +
    dashboard.operations.length +
    dashboard.alerts.length

  return (
    <div className="grid gap-6">
      <Card className="border-line bg-surface">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <ShieldCheck aria-hidden className="size-5" />
            </span>
            <div className="grid gap-1">
              <CardTitle className="text-base text-[#0F2C59]">
                Socle Fret sécurisé
              </CardTitle>
              <p className="text-small text-ink-muted">
                Les données affichées proviennent du module Fret autorisé côté
                serveur.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-line bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[#0F2C59]">
            <Database aria-hidden className="size-5 text-[#D39E00]" />
            Activité Fret
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.dataState === "empty" && itemCount === 0 ? (
            <EmptyState
              title="Aucune donnée Fret disponible"
              description="Le module est actif et prêt à recevoir les premiers programmes, ordres et événements opérationnels validés."
              action={
                <span className="text-caption text-ink-subtle">
                  Aucun chiffre de démonstration n’est affiché.
                </span>
              }
            />
          ) : (
            <div
              role="status"
              className="grid justify-items-center gap-3 py-8 text-center"
            >
              <Boxes aria-hidden className="size-8 text-[#D39E00]" />
              <p className="font-semibold text-ink">
                Des données opérationnelles Fret sont disponibles.
              </p>
              <p className="text-small max-w-xl text-ink-muted">
                {dashboard.kpis.length} indicateur(s),{" "}
                {dashboard.operations.length} opération(s) et{" "}
                {dashboard.alerts.length} alerte(s) ont été reçus du serveur.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function FreightDashboardPage() {
  const liveDashboard = useQuery(
    api.modules.fret.queries.dashboard,
    E2E_MODE ? "skip" : {}
  )
  const dashboard = E2E_MODE ? E2E_EMPTY_DASHBOARD : liveDashboard

  return (
    <EnterpriseShell
      title="Fret & Marchandises"
      subtitle="Socle opérationnel du flux Fret, protégé par les habilitations et activations de module"
    >
      {dashboard === undefined ? (
        <FreightDashboardLoading />
      ) : (
        <FreightDashboardScreen dashboard={dashboard} />
      )}
    </EnterpriseShell>
  )
}
