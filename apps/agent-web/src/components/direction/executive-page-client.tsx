"use client"

import type { Route } from "next"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { usePortalSession } from "@/components/portal-guard"

import type { ExecutiveVolet } from "./executive-navigation"
import {
  PERIOD_QUERY_PARAM,
  parsePeriodPreset,
  periodHref,
  periodRange,
  todayInLibreville,
} from "./executive-period"
import { ExecutiveShell } from "./executive-shell"
import { useExecutiveCockpit } from "./use-executive-cockpit"
import { ActivitiesVolet } from "./volets/activities"
import { DecisionsVolet } from "./volets/decisions"
import { FinancesVolet } from "./volets/finances"
import { OverviewVolet } from "./volets/overview"
import { RisksVolet } from "./volets/risks"
import type { ExecutiveVoletProps } from "./volets/types"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

/** Repli de la frontière `Suspense` et de la vérification de session. */
export function ExecutivePageFallback({
  children = "Chargement de l’espace Direction générale…",
}: {
  children?: string
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <p role="status" className="text-small text-center text-ink-muted">
        {children}
      </p>
    </main>
  )
}

const VOLET_COMPONENTS: Readonly<
  Record<ExecutiveVolet, (props: ExecutiveVoletProps) => React.ReactNode>
> = {
  overview: OverviewVolet,
  activities: ActivitiesVolet,
  finances: FinancesVolet,
  risks: RisksVolet,
  decisions: DecisionsVolet,
}

/**
 * Page cliente d'un volet. La période se lit dans l'URL à chaque rendu et
 * s'écrit par remplacement d'historique ; la date du jour est figée au
 * montage (initialiseur paresseux, sans horloge dans le rendu).
 */
export function ExecutivePageClient({ volet }: { volet: ExecutiveVolet }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const portalSession = usePortalSession()
  const preset = parsePeriodPreset(searchParams.get(PERIOD_QUERY_PARAM))
  const [today] = useState(() => todayInLibreville())
  const range = periodRange(preset, today)
  const data = useExecutiveCockpit({ preset, range, serviceDate: today })

  if (!E2E_MODE && !portalSession) {
    return (
      <ExecutivePageFallback>Vérification de la session…</ExecutivePageFallback>
    )
  }

  const Volet = VOLET_COMPONENTS[volet]

  return (
    <ExecutiveShell volet={volet} preset={preset}>
      <Volet
        data={data}
        preset={preset}
        onPresetChange={(value) =>
          router.replace(
            periodHref(pathname, parsePeriodPreset(value)) as Route
          )
        }
      />
    </ExecutiveShell>
  )
}
