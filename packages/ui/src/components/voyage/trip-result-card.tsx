import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { formatDuration, formatPrice, formatTime, spellTime } from "@workspace/ui/lib/format"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"

/**
 * Carte de résultat trajet — la brique centrale de la recherche.
 *
 * Règle de hiérarchie SETRAG : l'heure d'abord (mono, 25 px), le prix
 * ensuite, le reste en gris. Les heures sont annoncées en clair aux lecteurs
 * d'écran.
 */

export type TripCardState = "default" | "selected" | "cancelled"

export interface TripResultCardProps
  extends Omit<React.ComponentProps<"article">, "onSelect"> {
  departureAt: number | Date
  arrivalAt: number | Date
  /** Durée du trajet en minutes. */
  durationMinutes: number
  originLabel: string
  destinationLabel: string
  /** « Direct » ou « 1 correspondance · Booué ». */
  connectionLabel?: string
  priceXaf?: number
  /** « 2de classe · par personne ». */
  priceNote?: string
  tags?: Array<{ label: string; tone?: React.ComponentProps<typeof Tag>["tone"] }>
  state?: TripCardState
  /** Message affiché à la place du trajet quand la desserte est supprimée. */
  cancelledNotice?: string
  actionLabel?: string
  onSelect?: () => void
  /** Détail affiché sous les heures quand la carte est sélectionnée. */
  selectionNote?: string
}

function TripResultCard({
  departureAt,
  arrivalAt,
  durationMinutes,
  originLabel,
  destinationLabel,
  connectionLabel = "Direct",
  priceXaf,
  priceNote = "Classe économique · par personne",
  tags = [],
  state = "default",
  cancelledNotice,
  actionLabel,
  onSelect,
  selectionNote,
  className,
  ...props
}: TripResultCardProps) {
  const selected = state === "selected"
  const cancelled = state === "cancelled"
  const direct = connectionLabel.toLowerCase().startsWith("direct")

  return (
    <article
      data-slot="trip-result-card"
      data-state={state}
      className={cn(
        "grid items-center gap-6 rounded-[16px] border p-5 px-6 transition-[box-shadow,border-color] duration-200 ease-setrag md:grid-cols-[1fr_auto]",
        selected
          ? "border-[1.5px] border-accent-base bg-accent-soft"
          : "border-line bg-surface",
        cancelled && "opacity-70",
        !selected && !cancelled && onSelect && "hover:border-line-strong hover:shadow-md",
        className
      )}
      {...props}
    >
      <div className="grid gap-2.5">
        {cancelled ? (
          <>
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="tabular text-time text-ink-muted line-through">
                {formatTime(departureAt)}
              </span>
              <Tag tone="danger">Train supprimé</Tag>
            </div>
            {cancelledNotice && (
              <p className="text-[13px] leading-normal text-ink-muted">
                {cancelledNotice}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="tabular text-time">
                <span className="sr-only">Départ à {spellTime(departureAt)}</span>
                <span aria-hidden>{formatTime(departureAt)}</span>
              </span>

              <span className="grid min-w-30 gap-1">
                <span
                  className={cn(
                    "tabular text-center text-[11px] leading-none font-medium",
                    selected ? "text-accent-ink" : "text-ink-muted"
                  )}
                >
                  {formatDuration(durationMinutes)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "relative h-0.5",
                    selected ? "bg-accent-line" : "bg-line"
                  )}
                >
                  <span
                    className={cn(
                      "absolute -top-0.5 size-1.5 rounded-pill",
                      direct
                        ? "-right-px bg-accent-base"
                        : "left-1/2 bg-line-strong"
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "text-center text-[11px] leading-none font-medium",
                    selected ? "text-accent-ink" : "text-ink-muted"
                  )}
                >
                  {connectionLabel}
                </span>
              </span>

              <span className="tabular text-time">
                <span className="sr-only">Arrivée à {spellTime(arrivalAt)}</span>
                <span aria-hidden>{formatTime(arrivalAt)}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selected && selectionNote ? (
                <span className="text-[13px] leading-none font-medium text-accent-ink">
                  {selectionNote}
                </span>
              ) : (
                <span className="text-[13px] leading-none font-medium text-ink-muted">
                  {originLabel} → {destinationLabel}
                </span>
              )}
              {tags.map((tag) => (
                <Tag key={tag.label} tone={tag.tone ?? "neutral"}>
                  {tag.label}
                </Tag>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid justify-items-start gap-2 md:justify-items-end">
        {priceXaf !== undefined && !cancelled && (
          <>
            <span className="text-h3 font-bold text-ink">
              {formatPrice(priceXaf)}
            </span>
            {selected ? (
              <span className="text-[12px] leading-none font-semibold text-accent-ink">
                ✓ Dans votre panier
              </span>
            ) : (
              <span className="text-[12px] leading-none text-ink-muted">
                {priceNote}
              </span>
            )}
          </>
        )}

        {onSelect && (
          <Button
            size="sm"
            variant={
              cancelled ? "danger" : selected ? "secondary" : "primary"
            }
            onClick={onSelect}
          >
            {actionLabel ??
              (cancelled ? "Voir les solutions" : selected ? "Modifier" : "Choisir")}
          </Button>
        )}
      </div>
    </article>
  )
}

export { TripResultCard }
