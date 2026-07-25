"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { formatPrice } from "@workspace/ui/lib/format"

export interface PriceCalendarDay {
  /** Quantième affiché (« 03 »). */
  day: number
  /** Prix le plus bas du jour, en XAF. `null` = aucune desserte. */
  priceXaf: number | null
  /** Clé stable renvoyée à la sélection (date ISO, par exemple). */
  value: string
}

export interface PriceCalendarProps
  extends Omit<React.ComponentProps<"div">, "onSelect"> {
  /** Libellé du mois affiché (« Août 2026 »). */
  monthLabel: string
  days: PriceCalendarDay[]
  selected?: string
  onSelect?: (value: string) => void
  onPrevious?: () => void
  onNext?: () => void
}

/**
 * Calendrier des prix — une pastille par jour, prix en mono sous le quantième.
 * Le meilleur prix du mois est mis en avant en accent doux.
 */
function PriceCalendar({
  monthLabel,
  days,
  selected,
  onSelect,
  onPrevious,
  onNext,
  className,
  ...props
}: PriceCalendarProps) {
  const prices = days
    .map((d) => d.priceXaf)
    .filter((p): p is number => p !== null)
  const best = prices.length > 0 ? Math.min(...prices) : null

  return (
    <div
      data-slot="price-calendar"
      className={cn(
        "grid gap-4 rounded-lg border border-line bg-surface p-6",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-[16px] leading-none font-semibold">{monthLabel}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!onPrevious}
            aria-label="Mois précédent"
            className="grid size-9 place-items-center rounded-pill border border-line text-ink-muted transition-colors hover:bg-surface-sunk disabled:opacity-50 disabled:hover:bg-transparent"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label="Mois suivant"
            className="grid size-9 place-items-center rounded-pill border border-line transition-colors hover:bg-surface-sunk disabled:opacity-50 disabled:hover:bg-transparent"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const unavailable = day.priceXaf === null
          const isSelected = day.value === selected
          const isBest = !unavailable && best !== null && day.priceXaf === best

          return (
            <button
              key={day.value}
              type="button"
              disabled={unavailable || !onSelect}
              aria-pressed={isSelected}
              onClick={() => onSelect?.(day.value)}
              className={cn(
                "grid justify-items-center gap-[3px] rounded-md px-1 py-2.5 transition-colors duration-200 ease-setrag",
                isSelected
                  ? "bg-ink"
                  : unavailable
                    ? "cursor-not-allowed bg-surface-sunk"
                    : isBest
                      ? "bg-accent-soft"
                      : "border border-line bg-surface hover:bg-surface-sunk"
              )}
            >
              <span
                className={cn(
                  "tabular text-[13px] leading-none font-medium",
                  isSelected
                    ? "font-semibold text-ink-inverse"
                    : unavailable
                      ? "text-ink-faint"
                      : "text-ink"
                )}
              >
                {String(day.day).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "tabular text-[11px] leading-none",
                  isSelected
                    ? "font-semibold text-accent-base"
                    : unavailable
                      ? "font-medium text-ink-faint"
                      : isBest
                        ? "font-semibold text-accent-ink"
                        : "font-medium text-ink-muted"
                )}
              >
                {day.priceXaf === null ? "—" : formatPrice(day.priceXaf)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-[12px] leading-none font-medium text-ink-muted">
        <Legend swatch="bg-accent-soft" label="Meilleur prix" />
        <Legend swatch="bg-ink" label="Jour sélectionné" />
        <Legend swatch="bg-surface-sunk" label="Indisponible" />
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-3 rounded-xs", swatch)} />
      {label}
    </span>
  )
}

export { PriceCalendar }
