"use client"

import * as React from "react"

import { flecheRadio } from "@workspace/ui/lib/clavier"
import { cn } from "@workspace/ui/lib/utils"

export interface OptionChoix {
  valeur: string
  libelle: React.ReactNode
  detail?: React.ReactNode
  /** À droite : prix, logo d'opérateur. */
  fin?: React.ReactNode
  indisponible?: boolean
}

/**
 * Choix exclusif en cartes — classe, moyen de paiement. Le contenu propre à
 * l'option retenue (numéro Airtel Money…) s'affiche juste sous elle.
 */
export function ChoixCartes({
  options,
  valeur,
  onChange,
  label,
  sousChoix,
  colonnes = 1,
  className,
}: {
  options: OptionChoix[]
  valeur: string
  onChange: (valeur: string) => void
  label: string
  /** Rendu sous l'option retenue. */
  sousChoix?: React.ReactNode
  colonnes?: 1 | 2 | 3
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
          onChange,
          (v) => options.find((o) => o.valeur === v)?.indisponible === true
        )
      }
      className={cn("grid gap-2", colonnes === 2 && "md:grid-cols-2", colonnes === 3 && "md:grid-cols-3", className)}
    >
      {options.map((option) => {
        const actif = option.valeur === valeur
        return (
          <React.Fragment key={option.valeur}>
            <button
              type="button"
              role="radio"
              aria-checked={actif}
              data-valeur={option.valeur}
              tabIndex={actif || (!options.some((o) => o.valeur === valeur) && option === options.find((o) => !o.indisponible)) ? 0 : -1}
              disabled={option.indisponible}
              onClick={() => onChange(option.valeur)}
              className={cn(
                "grid min-h-[60px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border bg-surface px-4 py-2.5 text-left transition-[border-color,box-shadow] duration-[var(--dur-base)] disabled:opacity-50",
                actif ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]" : "border-line hover:border-line-strong"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-[22px] rounded-pill border-2 transition-[border-width,border-color] duration-[var(--dur-fast)]",
                  actif ? "border-[7px] border-accent-base" : "border-line-strong"
                )}
              />
              <span className="min-w-0">
                <b className="block text-[15px] font-bold">{option.libelle}</b>
                {option.detail && <small className="block text-[12.5px] font-normal text-ink-muted">{option.detail}</small>}
              </span>
              {option.fin && <span className="text-[16px] font-bold">{option.fin}</span>}
            </button>
            {actif && sousChoix && <div className="px-0.5 md:col-span-full">{sousChoix}</div>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/** Pastille d'opérateur (texte neutre : les marques ne colorent pas l'interface). */
export function MarqueOperateur({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-[30px] w-11 place-items-center rounded-[6px] border border-line bg-surface-sunk text-[9.5px] font-extrabold tracking-[0.02em] text-ink-muted [&_svg]:size-[18px]">
      {children}
    </span>
  )
}
