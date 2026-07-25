import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Tag / pastille SETRAG — pill, libellé 12/600.
 *
 * Un statut n'est jamais porté par la couleur seule : le libellé dit toujours
 * l'information (« +12 min », « Supprimé »), la teinte ne fait que la renforcer.
 */
const tagVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-pill text-[12px] leading-none font-semibold whitespace-nowrap [&>svg]:size-3.5",
  {
    variants: {
      tone: {
        accent: "bg-accent-soft text-accent-ink px-3 py-2",
        second: "bg-second-soft text-second-ink px-3 py-2",
        success: "bg-success-soft text-success-ink px-3 py-2",
        warning: "bg-warning-soft text-warning-ink px-3 py-2",
        danger: "bg-danger-soft text-danger-ink px-3 py-2",
        info: "bg-info-soft text-info-ink px-3 py-2",
        neutral:
          "border border-line bg-surface-sunk text-ink-muted px-3 py-[7px]",
        strong: "bg-ink text-ink-inverse px-3 py-2",
        /** Filtre actif — contour épais, se retire au clic. */
        filterOn: "border-[1.5px] border-ink bg-surface text-ink px-3 py-2",
        /** Filtre inactif — contour léger. */
        filterOff:
          "border border-line-strong bg-surface text-ink-muted px-3 py-2 font-medium",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

export interface TagProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof tagVariants> {
  /** Affiche une croix de retrait et rend le tag actionnable. */
  onRemove?: () => void
  removeLabel?: string
}

function Tag({
  className,
  tone,
  onRemove,
  removeLabel = "Retirer le filtre",
  children,
  ...props
}: TagProps) {
  return (
    <span data-slot="tag" className={cn(tagVariants({ tone }), className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 grid size-4 place-items-center rounded-pill leading-none opacity-70 transition-opacity hover:opacity-100"
        >
          ✕
        </button>
      )}
    </span>
  )
}

export { Tag, tagVariants }
