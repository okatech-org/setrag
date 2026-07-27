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
  /**
   * `touch` porte les options à 44 px de haut.
   *
   * À utiliser dès que le contrôle est une commande de premier plan sur
   * mobile — étape d'un dossier, période affichée — où la règle SETRAG des
   * cibles tactiles s'applique. `compact`, la valeur par défaut, garde la
   * densité d'origine des filtres du bureau.
   */
  size?: "compact" | "touch"
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
  size = "compact",
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
              size === "touch" &&
                "inline-flex h-target items-center px-s-4 text-[13px]",
              active
                ? "bg-ink font-semibold text-ink-inverse"
                : "border border-line-strong font-medium text-ink-muted hover:bg-surface-sunk",
              // Retraits d'origine du mode compact, appliqués après les
              // variantes d'état pour rester prioritaires sur elles.
              size === "compact" &&
                (active ? "px-[11px] py-2" : "px-[11px] py-[7px]")
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
