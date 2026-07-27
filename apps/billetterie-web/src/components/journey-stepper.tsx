import { Stepper } from "@workspace/ui/components/stepper"
import { cn } from "@workspace/ui/lib/utils"

const STEPS = [
  { label: "Recherche" },
  { label: "Voyageurs" },
  { label: "Paiement" },
  { label: "Billets" },
]

/**
 * Fil du tunnel, en quatre étapes. Le mobile lui préfère `TunnelStepper`, qui
 * en compte trois — les pages le masquent alors par `className`.
 */
export function JourneyStepper({
  current,
  className,
}: {
  current: number
  className?: string
}) {
  return (
    <Stepper
      current={current}
      steps={STEPS}
      className={cn("mx-auto w-full max-w-2xl min-w-0", className)}
    />
  )
}
