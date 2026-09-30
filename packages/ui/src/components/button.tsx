import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Bouton SETRAG.
 *
 * Règles de la charte :
 * — hauteur d'action minimale 44 px (taille `md`, valeur par défaut) ;
 * — un seul bouton `primary` par écran : celui qui fait avancer le voyage ;
 * — pastille, libellé 600, anneau de focus jamais supprimé ;
 * — en attente, le libellé reste et le bouton garde sa taille : un ruban fin
 *   passe sous le texte (voir `.st-en-cours`, marque.css).
 */
const buttonVariants = cva(
  "relative isolate inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-pill border font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-setrag outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent-base text-ink-inverse hover:bg-accent-hover active:bg-accent-active",
        secondary: "border-accent-line bg-surface text-accent-ink hover:bg-accent-soft",
        ghost: "border-transparent bg-transparent text-accent-ink hover:bg-accent-soft",
        danger: "border-danger/40 bg-surface text-danger-ink hover:bg-danger-soft",
        /** Wallet d'Apple et de Google : noir, comme l'exigent leurs chartes. */
        noir: "rounded-md border-transparent bg-black text-white hover:bg-black/85",
      },
      size: {
        /* Plus compact que `md` par le texte et les marges, jamais par la hauteur :
           une action fait 44 px au moins (règle SETRAG). */
        sm: "h-11 px-4 text-[14px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-13 px-6 text-[16px]",
        /* Boutons ronds — flèches, fermeture, inversion. */
        "icon-sm": "size-11 p-0",
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

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Action en cours : le libellé reste, un ruban passe dessous, le clic est neutralisé. */
  loading?: boolean
  /** Libellé de substitution pendant l'attente (« Recherche… »). */
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
  onClick,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={cn(buttonVariants({ variant, size, block, className }))} {...props}>
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled}
      // En attente, le clic est neutralisé — y compris la soumission du
      // formulaire qu'un `type="submit"` déclencherait sans passer par onClick
      // (clic ou touche Entrée) : sans cela, un code partirait deux fois.
      onClick={loading ? (event) => event.preventDefault() : onClick}
      className={cn(buttonVariants({ variant, size, block }), loading && "st-en-cours cursor-progress", className)}
      {...props}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

export { Button, buttonVariants }
