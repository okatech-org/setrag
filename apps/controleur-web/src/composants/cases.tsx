"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { flecheRadio } from "@workspace/ui/lib/clavier"
import { cn } from "@workspace/ui/lib/utils"

export interface OptionCase<T extends string> {
  valeur: T
  libelle: ReactNode
  /** Nom annoncé aux lecteurs d'écran, quand le libellé est abrégé. */
  nom?: string
  icone?: LucideIcon
  desactivee?: boolean
}

/**
 * Choix exclusif en cases : classe, mode de paiement, gravité, catégorie.
 *
 * Pas de liste déroulante quand un choix suffit : un doigt ganté appuie
 * large, et l'agent voit toutes les options d'un coup d'œil. La case retenue
 * porte une coche en plus de sa teinte — l'information n'est jamais portée
 * par la couleur seule.
 */
export function Cases<T extends string>({
  options,
  valeur,
  onChange,
  label,
  colonnes = options.length,
  variante = "cases",
  serre,
  className,
}: {
  options: OptionCase<T>[]
  valeur: T | undefined
  onChange: (valeur: T) => void
  label: string
  colonnes?: number
  /** `puces` : icône et libellé en ligne, 48 px (catégories d'incident). */
  variante?: "cases" | "puces"
  /** Formulaire dense : 48 px au lieu de 52. */
  serre?: boolean
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
          (v) => onChange(v as T),
          (v) => Boolean(options.find((o) => o.valeur === v)?.desactivee)
        )
      }
      // Les puces prennent la largeur de leur mot et passent à la ligne :
      // « Comportement » ne tient pas dans un tiers d'écran.
      className={cn(
        variante === "puces" ? "flex flex-wrap gap-1.5" : "grid gap-1.5",
        className
      )}
      style={
        variante === "puces"
          ? undefined
          : { gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }
      }
    >
      {options.map((option) => {
        const choisie = option.valeur === valeur
        const Icone = option.icone
        return (
          <button
            key={option.valeur}
            type="button"
            role="radio"
            aria-checked={choisie}
            aria-label={option.nom}
            data-valeur={option.valeur}
            disabled={option.desactivee}
            tabIndex={
              choisie || (valeur === undefined && option === options[0])
                ? 0
                : -1
            }
            onClick={() => onChange(option.valeur)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md border bg-surface px-1.5 text-center transition-colors duration-[var(--dur-fast)] disabled:opacity-45",
              variante === "puces"
                ? "min-h-11 grow basis-[28%] px-3 text-[13px] font-semibold"
                : cn(
                    serre ? "min-h-12 text-[15px]" : "min-h-[52px] text-[16px]",
                    "font-bold"
                  ),
              choisie
                ? "border-accent-base bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_var(--c-accent)]"
                : "border-line-strong text-ink"
            )}
          >
            {variante === "puces" && Icone ? (
              <Icone
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  choisie ? "text-accent-ink" : "text-ink-muted"
                )}
              />
            ) : (
              choisie && (
                <svg
                  viewBox="0 0 12 12"
                  aria-hidden
                  className="size-3.5 shrink-0"
                >
                  <path
                    d="M2 6.4 4.8 9 10 3.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )
            )}
            <span className="min-w-0">{option.libelle}</span>
          </button>
        )
      })}
    </div>
  )
}
