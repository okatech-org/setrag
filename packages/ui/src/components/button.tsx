import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Bouton SETRAG.
 *
 * Règles du design system :
 * — hauteur d'action minimale 44 px (taille `md`, valeur par défaut) ;
 * — un seul bouton `primary` par écran : celui qui fait avancer le voyage ;
 * — rayon pill, libellé 600, anneau de focus jamais supprimé.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-pill border font-semibold whitespace-nowrap transition-colors duration-200 ease-setrag outline-none select-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-accent-base text-ink-inverse hover:bg-accent-hover active:bg-accent-active active:translate-y-px disabled:bg-line disabled:text-ink-faint",
        secondary:
          "border-[1.5px] border-ink bg-surface text-ink hover:bg-surface-sunk active:translate-y-px disabled:border-line disabled:text-ink-faint",
        ghost:
          "border-transparent bg-transparent text-accent-ink hover:bg-accent-soft active:translate-y-px disabled:text-ink-faint",
        danger:
          "border-transparent bg-danger text-ink-inverse hover:bg-danger-hover active:translate-y-px disabled:bg-line disabled:text-ink-faint",
      },
      size: {
        sm: "h-9 px-4 text-[14px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-13 px-7 text-[16px]",
        /* Boutons ronds — flèches de calendrier, fermeture, inversion. */
        "icon-sm": "size-9 p-0",
        icon: "size-11 p-0",
        "icon-lg": "size-13 p-0",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Affiche la barre de progression indéterminée et neutralise le clic. */
  loading?: boolean
  /** Libellé de substitution pendant le chargement (« Recherche… »). */
  loadingLabel?: string
}

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  // En `asChild`, le contenu appartient à l'enfant : on ne l'enveloppe pas.
  if (asChild) {
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, block, className }))}
        {...props}
      >
        {children}
      </Comp>
    )
  }

  return (
    <button
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, block, className }))}
      {...props}
    >
      {loading ? (
        <>
          <span>{loadingLabel ?? children}</span>
          <span
            aria-hidden
            className="h-[3px] w-[42px] overflow-hidden rounded-pill bg-current/35"
          >
            <span
              data-motion="progress"
              className="animate-progress-slide block h-full w-2/5 rounded-pill bg-current"
            />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

export { Button, buttonVariants }
