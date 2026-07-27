"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Barre d'onglets du bas — la navigation principale en mobile.
 *
 * Le design system ne connaît pas le routeur de l'application : chaque onglet
 * s'enveloppe autour du lien de l'hôte via `asChild`.
 *
 *     <BottomNav label="Navigation principale">
 *       <BottomNavItem active asChild>
 *         <Link href="/"><Home /> Accueil</Link>
 *       </BottomNavItem>
 *     </BottomNav>
 *
 * La barre expose sa hauteur en `--mobile-tabbar-h` pour que le contenu de la
 * page réserve la place correspondante sans la coder en dur de son côté.
 */
function BottomNav({
  className,
  label,
  children,
  ...props
}: React.ComponentProps<"nav"> & { label: string }) {
  return (
    <nav
      data-slot="bottom-nav"
      aria-label={label}
      className={cn(
        "pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch">{children}</div>
    </nav>
  )
}

function BottomNavItem({
  className,
  active = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"a"> & {
  active?: boolean
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="bottom-nav-item"
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        // L'état actif ne tient pas qu'à la couleur : la graisse change aussi,
        // et `aria-current` le porte pour les lecteurs d'écran.
        "text-caption flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200 ease-setrag [&_svg]:size-5 [&_svg]:shrink-0",
        active
          ? "font-semibold text-accent-ink [&_svg]:stroke-2"
          : "font-medium text-ink-faint hover:text-ink-muted [&_svg]:stroke-[1.6]",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

export { BottomNav, BottomNavItem }
