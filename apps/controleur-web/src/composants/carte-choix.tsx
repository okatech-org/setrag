"use client"

import type { ReactNode } from "react"

import { flecheRadio } from "@workspace/ui/lib/clavier"
import { cn } from "@workspace/ui/lib/utils"

export interface OptionCarte<T extends string> {
  valeur: T
  titre: ReactNode
  sousTitre?: ReactNode
  /** À droite : pastille « choisie », montant de l'amende. */
  fin?: ReactNode
  /** Nom complet annoncé aux lecteurs d'écran. */
  nom?: string
}

/**
 * Choix en cartes : une desserte, un motif de procès-verbal. L'agent voit ce
 * qu'il choisit — et le montant qu'il annoncera — avant de choisir.
 */
export function CartesChoix<T extends string>({
  options,
  valeur,
  onChange,
  label,
  className,
}: {
  options: OptionCarte<T>[]
  valeur: T | undefined
  onChange: (valeur: T) => void
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) =>
        flecheRadio(
          event,
          options.map((o) => o.valeur),
          valeur,
          (v) => onChange(v as T)
        )
      }
      className={cn("grid gap-2", className)}
    >
      {options.map((option) => {
        const choisie = option.valeur === valeur
        return (
          <button
            key={option.valeur}
            type="button"
            role="radio"
            aria-checked={choisie}
            aria-label={option.nom}
            data-valeur={option.valeur}
            tabIndex={
              choisie || (valeur === undefined && option === options[0])
                ? 0
                : -1
            }
            onClick={() => onChange(option.valeur)}
            className={cn(
              "grid min-h-[52px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md border bg-surface px-3.5 py-2.5 text-left transition-colors duration-[var(--dur-fast)]",
              choisie
                ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]"
                : "border-line"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "row-span-2 size-[22px] rounded-pill transition-[border-width] duration-[var(--dur-fast)]",
                choisie
                  ? "border-[7px] border-accent-base"
                  : "border-2 border-line-strong"
              )}
            />
            <span className="text-[15px] leading-snug font-bold">
              {option.titre}
            </span>
            {option.sousTitre && (
              <span className="col-start-2 text-[12.5px] leading-snug font-medium text-ink-muted">
                {option.sousTitre}
              </span>
            )}
            {option.fin && (
              <span className="col-start-3 row-span-2 row-start-1 justify-self-end">
                {option.fin}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
