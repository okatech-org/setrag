"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedControlProps
  extends Omit<React.ComponentProps<"div">, "onChange"> {
  options: SegmentedOption[]
  value?: string
  onValueChange?: (value: string) => void
  /** Étiquette du groupe, annoncée aux lecteurs d'écran. */
  label: string
}

/**
 * Choix exclusif en pastilles — créneau horaire, type de trajet, tri.
 *
 * L'option retenue prend le fond encre : c'est le seul contraste qui tienne à
 * côté des pastilles de statut, dont les fonds teintés sont déjà pris.
 */
function SegmentedControl({
  options,
  value,
  onValueChange,
  label,
  className,
  ...props
}: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap gap-1.5", className)}
      {...props}
    >
      {options.map((option) => {
        const active = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onValueChange?.(option.value)}
            className={cn(
              "rounded-pill text-[12px] leading-none whitespace-nowrap transition-colors duration-200 ease-setrag",
              active
                ? "bg-ink px-[11px] py-2 font-semibold text-ink-inverse"
                : "border border-line-strong px-[11px] py-[7px] font-medium text-ink-muted hover:bg-surface-sunk"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
