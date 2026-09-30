import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Pastille SETRAG — 26 px, libellé 12,5/600, icône 14 px en tête.
 *
 * Un statut n'est jamais porté par la couleur seule : le libellé dit toujours
 * l'information (« +12 min », « Supprimé »), l'icône et la teinte la
 * renforcent. `marque` (bleu sur jaune, comme les boutons du site) sert aux
 * mises en avant commerciales — « Meilleur prix » —, jamais à un statut.
 */
const tagVariants = cva(
  "inline-flex h-[26px] w-fit shrink-0 items-center gap-[5px] rounded-pill px-2.5 text-[12.5px] leading-none font-semibold whitespace-nowrap [&>svg]:size-3.5 [&>svg]:stroke-[2.2]",
  {
    variants: {
      tone: {
        accent: "bg-accent-soft text-accent-ink",
        second: "bg-second-soft text-second-ink",
        success: "bg-success-soft text-success-ink",
        warning: "bg-warning-soft text-warning-ink",
        danger: "bg-danger-soft text-danger-ink",
        info: "bg-info-soft text-info-ink",
        neutral: "bg-surface-sunk text-ink-muted",
        strong: "bg-ink text-ink-inverse",
        marque: "bg-brand-jaune text-brand-bleu",
        /** Filtre actif — se retire au clic. */
        filterOn: "h-[34px] border border-accent-line bg-accent-soft px-3 text-[13px] text-accent-ink",
        /** Filtre inactif. */
        filterOff: "h-[34px] border border-line-strong bg-surface px-3 text-[13px] text-ink",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

export interface TagProps extends React.ComponentProps<"span">, VariantProps<typeof tagVariants> {
  /** Affiche une croix de retrait et rend la pastille actionnable. */
  onRemove?: () => void
  removeLabel?: string
}

function Tag({ className, tone, onRemove, removeLabel = "Retirer le filtre", children, ...props }: TagProps) {
  return (
    <span data-slot="tag" className={cn(tagVariants({ tone }), className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          // Zone tactile de 44 px autour d'une croix de 20 : elle déborde de la
          // pastille sans l'agrandir.
          className="-my-[9px] -mr-3.5 grid size-11 place-items-center rounded-pill leading-none opacity-70 transition-opacity hover:opacity-100"
        >
          ✕
        </button>
      )}
    </span>
  )
}

export { Tag, tagVariants }
