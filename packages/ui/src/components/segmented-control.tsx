"use client"

import * as React from "react"

import { flecheRadio } from "@workspace/ui/lib/clavier"
import { cn } from "@workspace/ui/lib/utils"

import { useIndicateur } from "./indicateur"

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedControlProps extends Omit<React.ComponentProps<"div">, "onChange"> {
  options: SegmentedOption[]
  value?: string
  onValueChange?: (value: string) => void
  /** Étiquette du groupe, annoncée aux lecteurs d'écran. */
  label: string
  /** `touch` porte les options à 44 px (commandes de premier plan sur mobile). */
  size?: "compact" | "touch"
}

/**
 * Choix exclusif — à venir / passés, téléphone / e-mail, période.
 *
 * L'option retenue a un fond clair qui glisse d'une option à l'autre
 * (320 ms) : c'est le seul mouvement du contrôle.
 */
function SegmentedControl({
  options,
  value,
  onValueChange,
  label,
  size = "compact",
  className,
  ...props
}: SegmentedControlProps) {
  const { ref, position, anime } = useIndicateur<HTMLDivElement>(value)

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) =>
        onValueChange &&
        flecheRadio(
          event,
          options.map((o) => o.value),
          value,
          onValueChange
        )
      }
      className={cn("relative inline-grid auto-cols-fr grid-flow-col gap-[3px] rounded-pill bg-surface-sunk p-[3px]", className)}
      {...props}
    >
      {position && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-[3px] bottom-[3px] left-0 rounded-pill bg-surface shadow-sm",
            anime && "transition-[translate,width] duration-[var(--dur-slow)] ease-[var(--ease-glisse)]"
          )}
          style={{ width: position.w, translate: `${position.x}px 0` }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-actif={active}
            data-valeur={option.value}
            tabIndex={active || (value === undefined && option === options[0]) ? 0 : -1}
            onClick={() => onValueChange?.(option.value)}
            className={cn(
              "relative z-[1] grid place-items-center rounded-pill px-3.5 font-semibold whitespace-nowrap transition-colors duration-[var(--dur-base)]",
              size === "touch" ? "min-h-[44px] text-[14px]" : "min-h-8 text-[13px]",
              active ? "text-ink" : "text-ink-muted hover:text-ink"
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
