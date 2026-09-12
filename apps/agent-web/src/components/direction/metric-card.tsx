import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { ExecutiveSourceState } from "./executive-dto"
import { ProvenanceTag } from "./provenance"

/** Liste de définitions : le libellé est un `<dt>`, jamais un titre. */
export function MetricGrid({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <dl
      aria-label={label}
      className={cn("grid gap-4 md:grid-cols-2", className)}
    >
      {children}
    </dl>
  )
}

function placeholderFor(state: ExecutiveSourceState) {
  switch (state) {
    case "loading":
      return "Chargement…"
    case "unavailable":
      return "Non accessible à ce compte"
    case "not_connected":
      return "Non raccordé"
    default:
      return "Aucune donnée consolidée"
  }
}

/**
 * Chiffre de tête SETRAG : les chiffres seuls en `text-time` (IBM Plex Mono,
 * 25 px), l'unité à part en `text-mono-label` — un montant de 25 px avec son
 * unité déborderait une cellule de 156 px à quatre colonnes.
 */
export function MetricCard({
  label,
  value,
  unit,
  supporting,
  state,
  className,
}: {
  label: string
  /** Chiffres déjà formatés (`fr-FR`), sans unité. */
  value?: string
  unit?: string
  supporting?: string
  state: ExecutiveSourceState
  className?: string
}) {
  const shown =
    (state === "operational" || state === "synthetic_demo") &&
    value !== undefined
      ? value
      : undefined

  return (
    <div
      className={cn(
        "grid min-w-0 content-start gap-3 rounded-lg border border-line bg-surface p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <dt className="text-mono-label text-ink-muted">{label}</dt>
        <ProvenanceTag state={state} />
      </div>
      <dd className="grid gap-1">
        {shown !== undefined ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-time text-ink">{shown}</span>
            {unit ? (
              <span className="font-mono text-xs font-medium tracking-wide text-ink-muted">
                {unit}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-small text-ink-muted">
            {placeholderFor(state)}
          </span>
        )}
        {supporting ? (
          <span className="text-caption text-ink-muted">{supporting}</span>
        ) : null}
      </dd>
    </div>
  )
}
