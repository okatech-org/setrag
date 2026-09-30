import type { ReactNode } from "react"

import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Une progression mesurée — téléchargement du manifeste, envoi de la file :
 * une voie que le ruban remplit. « Ça avance », et de combien.
 */
export function Progression({
  titre,
  fait,
  total,
  note,
  className,
}: {
  titre: ReactNode
  fait: number
  total: number
  note?: ReactNode
  className?: string
}) {
  const part = total > 0 ? Math.min(1, fait / total) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={fait}
      aria-label={typeof titre === "string" ? titre : undefined}
      className={cn(
        "grid gap-1.5 rounded-md border border-line bg-surface px-3.5 py-3",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3 text-[15px] font-bold">
        <span>{titre}</span>
        <span className="font-mono font-semibold tabular-nums">
          {fait} / {total}
        </span>
      </div>
      <Voie rempli={part} className="w-full flex-none" />
      {note && (
        <small className="text-[12.5px] font-medium text-ink-muted">
          {note}
        </small>
      )}
    </div>
  )
}
