import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface StepperStep {
  label: string
}

export interface StepperProps extends React.ComponentProps<"div"> {
  steps: StepperStep[]
  /** Index de l'étape courante (0-based). Les précédentes sont validées. */
  current: number
}

/**
 * Progression SETRAG — pastilles 26 px reliées par un filet de 2 px.
 * Les étapes franchies portent une coche, la courante son numéro.
 */
function Stepper({ steps, current, className, ...props }: StepperProps) {
  return (
    <div data-slot="stepper" className={cn("grid gap-3", className)} {...props}>
      <ol
        className="flex items-center gap-2.5"
        aria-label={`Étape ${current + 1} sur ${steps.length}`}
      >
        {steps.map((step, index) => {
          const done = index < current
          const active = index === current

          return (
            <React.Fragment key={step.label}>
              {index > 0 && (
                <li
                  aria-hidden
                  className={cn(
                    "h-0.5 flex-1",
                    index <= current ? "bg-accent-base" : "bg-line"
                  )}
                />
              )}
              <li
                aria-current={active ? "step" : undefined}
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-pill border-2 text-[13px] leading-none font-semibold",
                  done && "border-accent-base bg-accent-base text-ink-inverse",
                  active && "border-accent-base bg-transparent text-accent-ink",
                  !done && !active && "border-line bg-transparent text-ink-muted"
                )}
              >
                {done ? "✓" : index + 1}
                <span className="sr-only">{step.label}</span>
              </li>
            </React.Fragment>
          )
        })}
      </ol>

      <div className="flex justify-between text-[12px] leading-none font-medium text-ink-muted">
        {steps.map((step) => (
          <span key={step.label}>{step.label}</span>
        ))}
      </div>
    </div>
  )
}

export { Stepper }
