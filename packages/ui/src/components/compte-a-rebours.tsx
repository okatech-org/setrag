"use client"

import * as React from "react"
import { TimerIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/** Secondes restantes jusqu'à `fin` (horodatage ms), mises à jour chaque seconde. */
export function useCompteARebours(fin: number | undefined) {
  const [maintenant, setMaintenant] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!fin) return
    const minuterie = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(minuterie)
  }, [fin])
  return fin ? Math.max(0, Math.round((fin - maintenant) / 1000)) : 0
}

export const formatRebours = (secondes: number) =>
  `${String(Math.floor(secondes / 60)).padStart(2, "0")}:${String(secondes % 60).padStart(2, "0")}`

/**
 * Places tenues pendant le paiement. Le compte à rebours défile sans
 * clignoter ; sous deux minutes, le bandeau passe au rouge.
 */
export function Tenue({ fin, children = "Vos places sont tenues encore", className }: { fin: number; children?: React.ReactNode; className?: string }) {
  const restant = useCompteARebours(fin)
  const urgent = restant < 120
  return (
    <p
      role="timer"
      aria-live="off"
      className={cn(
        "flex items-center gap-2 rounded-md px-3.5 py-2.5 text-[13px] font-medium",
        restant === 0 ? "bg-danger-soft text-danger-ink" : urgent ? "bg-danger-soft text-danger-ink" : "bg-warning-soft text-warning-ink",
        className
      )}
    >
      <TimerIcon className="size-4 shrink-0" aria-hidden />
      {restant === 0 ? (
        <span>Le délai est écoulé : vos places ont été libérées.</span>
      ) : (
        <>
          <span>{children}</span>
          <b className="font-mono text-[14px] font-semibold tabular-nums">{formatRebours(restant)}</b>
        </>
      )}
    </p>
  )
}
