"use client"

import * as React from "react"
import { Minus, Plus } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Compteur à deux boutons — nombre d'adultes, nombre d'enfants.
 *
 * Le nombre est porté par un `output` en lecture seule plutôt que par un champ
 * de saisie : au clavier mobile, un `input type="number"` ouvrirait un pavé
 * numérique pour une valeur qui varie de un en un.
 *
 * L'accessibilité passe par les deux boutons, dont le libellé nomme l'effet
 * (« Retirer un adulte ») ; le total est annoncé par `aria-live`.
 */
function Counter({
  className,
  label,
  description,
  value,
  onValueChange,
  min = 0,
  max = 9,
  unitLabel,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  label: string
  description?: React.ReactNode
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  /** Nom au singulier employé dans les libellés des boutons — « adulte ». */
  unitLabel: string
}) {
  const decreaseDisabled = value <= min
  const increaseDisabled = value >= max

  return (
    <div
      data-slot="counter"
      className={cn("flex items-center gap-s-3", className)}
      {...props}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-body font-medium">{label}</span>
        {description && (
          <span className="text-caption text-ink-muted">{description}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-s-1">
        <button
          type="button"
          disabled={decreaseDisabled}
          onClick={() => onValueChange(Math.max(min, value - 1))}
          aria-label={`Retirer un ${unitLabel}`}
          className="inline-flex size-target items-center justify-center rounded-pill border border-line-strong bg-surface text-ink transition-colors duration-200 ease-setrag hover:bg-surface-sunk disabled:pointer-events-none disabled:border-line disabled:text-ink-faint"
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <output
          aria-live="polite"
          aria-label={`${label} : ${value}`}
          className="tabular text-body w-8 text-center font-semibold"
        >
          {value}
        </output>
        <button
          type="button"
          disabled={increaseDisabled}
          onClick={() => onValueChange(Math.min(max, value + 1))}
          aria-label={`Ajouter un ${unitLabel}`}
          className="inline-flex size-target items-center justify-center rounded-pill border border-line-strong bg-surface text-ink transition-colors duration-200 ease-setrag hover:bg-surface-sunk disabled:pointer-events-none disabled:border-line disabled:text-ink-faint"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </span>
    </div>
  )
}

export { Counter }
