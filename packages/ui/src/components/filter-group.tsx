"use client"

import * as React from "react"
import { Slider } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Groupe de filtres — un surtitre mono en capitales, puis le contrôle.
 * C'est le rythme du panneau de filtres : « HORAIRE DE DÉPART », « CONFORT »,
 * « PRIX MAX ».
 */
export interface FilterGroupProps extends React.ComponentProps<"div"> {
  label: string
}

function FilterGroup({ label, className, children, ...props }: FilterGroupProps) {
  return (
    <div className={cn("grid gap-2.5", className)} {...props}>
      <span className="text-mono-label text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

export interface RangeFilterProps
  extends Omit<React.ComponentProps<typeof Slider.Root>, "onValueChange"> {
  /** Texte sous la piste (« jusqu'à 90 000 F »). */
  valueLabel?: string
  onValueChange?: (value: number[]) => void
}

/** Curseur de plage — piste 4 px, remplissage accent, poignée saisissable. */
function RangeFilter({
  valueLabel,
  className,
  onValueChange,
  ...props
}: RangeFilterProps) {
  return (
    <div className="grid gap-2">
      <Slider.Root
        data-slot="range-filter"
        className={cn(
          "relative flex h-5 w-full touch-none items-center select-none",
          className
        )}
        onValueChange={onValueChange}
        {...props}
      >
        <Slider.Track className="relative h-1 w-full grow rounded-pill bg-line">
          <Slider.Range className="absolute h-full rounded-pill bg-accent-base" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Prix maximum"
          className="block size-4 rounded-pill border-2 border-accent-base bg-surface shadow-sm outline-none"
        />
      </Slider.Root>
      {valueLabel && (
        <span className="tabular text-[12px] leading-none text-ink-muted">
          {valueLabel}
        </span>
      )}
    </div>
  )
}

export interface ResultsToolbarProps extends React.ComponentProps<"div"> {
  /** « 14 dessertes · la moins chère à 18 000 F ». */
  summary: string
  sortLabel?: string
  onSortClick?: () => void
}

/** Bandeau au-dessus d'une liste de résultats : décompte à gauche, tri à droite. */
function ResultsToolbar({
  summary,
  sortLabel,
  onSortClick,
  className,
  ...props
}: ResultsToolbarProps) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4", className)}
      {...props}
    >
      <span className="text-[14px] leading-none font-medium text-ink-muted">
        {summary}
      </span>
      {sortLabel && (
        <button
          type="button"
          onClick={onSortClick}
          disabled={!onSortClick}
          className="text-[13px] leading-none font-semibold text-ink hover:text-accent-ink disabled:hover:text-ink"
        >
          {sortLabel}
        </button>
      )}
    </div>
  )
}

export { FilterGroup, RangeFilter, ResultsToolbar }
