import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface StepperStep {
  label: string
}

export interface StepperProps extends React.ComponentProps<"div"> {
  steps: StepperStep[]
  /** Index de l'étape courante (0-based). Les précédentes sont franchies. */
  current: number
}

/**
 * Étapes SETRAG : chaque étape est une gare, le ruban avance jusqu'à la
 * courante (480 ms, départ progressif). Le numéro d'étape reste écrit pour
 * les lecteurs d'écran : le ruban accompagne l'information, il ne la porte pas.
 */
function Stepper({ steps, current, className, ...props }: StepperProps) {
  const n = steps.length
  const avance = n > 1 ? Math.min(Math.max(current, 0), n - 1) / (n - 1) : 0
  const demiColonne = `calc(50% / ${n})`

  return (
    <div data-slot="stepper" className={cn("min-w-0", className)} {...props}>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label={`Étape ${current + 1} sur ${n}`}>
        <span aria-hidden className="absolute top-2 h-1.5 rounded-[3px] bg-line" style={{ left: demiColonne, right: demiColonne }} />
        <span
          aria-hidden
          className="bg-ruban absolute top-2 h-1.5 rounded-[3px] transition-[width] duration-[var(--dur-glisse)] ease-[var(--ease-glisse)]"
          style={{ left: demiColonne, width: `calc((100% - 100% / ${n}) * ${avance})` }}
        />
        {steps.map((step, index) => {
          const faite = index < current
          const ici = index === current
          return (
            <li
              key={step.label}
              aria-current={ici ? "step" : undefined}
              className={cn(
                "relative grid min-w-0 justify-items-center gap-2 text-center text-[13px] leading-tight font-medium",
                ici ? "font-bold text-ink" : "text-ink-muted"
              )}
            >
              <span
                className={cn(
                  "z-[1] grid size-[22px] place-items-center rounded-pill border-[3px] bg-surface transition-colors duration-[var(--dur-base)]",
                  faite && "border-accent-base bg-accent-base",
                  ici && "border-accent-base",
                  !faite && !ici && "border-line-strong"
                )}
              >
                {faite && (
                  <svg viewBox="0 0 12 12" className="size-3 text-ink-inverse" aria-hidden>
                    <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="w-full truncate px-1">
                {step.label}
                {faite && <span className="sr-only"> (franchie)</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export { Stepper }
