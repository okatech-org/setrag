"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Bandeau de pastilles défilant horizontalement — dates proposées, trajets
 * mémorisés, filtres de type de desserte.
 *
 * Le retrait latéral est repris à l'intérieur du conteneur pour que la
 * première et la dernière pastille s'alignent sur la colonne de texte tout en
 * pouvant défiler jusqu'au bord de l'écran.
 */
function ChipScroller({
  className,
  label,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div
      data-slot="chip-scroller"
      role="group"
      aria-label={label}
      // Pas d'accrochage au défilement : `snap-mandatory` recale la position
      // sur une pastille dès que le bandeau est rendu et rogne la première.
      className={cn(
        "no-scrollbar -mx-s-5 flex gap-s-2 overflow-x-auto px-s-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Pastille du bandeau. `selected` bascule sur le fond encre — le seul contraste
 * encore disponible à côté des pastilles de statut, dont les fonds teintés sont
 * déjà pris (même arbitrage que `SegmentedControl`).
 */
function Chip({
  className,
  selected = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  selected?: boolean
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="chip"
      data-selected={selected || undefined}
      aria-pressed={asChild ? undefined : selected}
      className={cn(
        // 44 px de haut : une pastille est une commande, la règle SETRAG des
        // cibles tactiles s'y applique comme aux boutons.
        "text-small inline-flex h-target shrink-0 items-center gap-s-2 rounded-pill px-s-4 whitespace-nowrap transition-colors duration-200 ease-setrag [&_svg]:size-4 [&_svg]:shrink-0",
        selected
          ? "bg-ink font-semibold text-ink-inverse"
          : "border border-line-strong bg-surface font-medium text-ink-muted hover:bg-surface-sunk",
        className
      )}
      {...(asChild ? {} : { type: "button" as const })}
      {...props}
    >
      {children}
    </Comp>
  )
}

export { Chip, ChipScroller }
