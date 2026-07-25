import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  title: string
  description?: string
  /** Toujours proposer une sortie : un jour voisin, un filtre à élargir. */
  action?: React.ReactNode
}

/**
 * État vide Cadence — contour pointillé, et systématiquement une porte de
 * sortie : « Essayez le jour suivant » plutôt qu'un simple « Aucun résultat ».
 */
function EmptyState({
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "grid justify-items-center gap-2.5 rounded-md border border-dashed border-line-strong p-6 text-center",
        className
      )}
      {...props}
    >
      <span className="text-[16px] leading-snug font-semibold text-ink">
        {title}
      </span>
      {description && (
        <span className="max-w-80 text-[14px] leading-normal text-ink-muted">
          {description}
        </span>
      )}
      {action && <span className="pt-1">{action}</span>}
    </div>
  )
}

/** Lignes de squelette — largeurs dégressives, comme dans la charte. */
function SkeletonLines({
  lines = 3,
  className,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  const widths = ["40%", "75%", "60%", "68%", "52%"]

  return (
    <div
      data-slot="skeleton-lines"
      aria-hidden
      className={cn("grid gap-2.5", className)}
      {...props}
    >
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-3.5 rounded-pill bg-surface-sunk"
          style={{ width: widths[index % widths.length] }}
        />
      ))}
    </div>
  )
}

export { EmptyState, SkeletonLines }
