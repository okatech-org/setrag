"use client"

import * as React from "react"
import { ChevronLeft } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Barre de titre du haut, en mobile.
 *
 * Trois zones de largeur fixe pour que le titre reste optiquement centré même
 * quand une seule des deux extrémités porte un bouton.
 */
function MobileAppBar({
  className,
  title,
  subtitle,
  back,
  action,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Bouton retour — voir `MobileAppBarButton`. Absent sur les onglets. */
  back?: React.ReactNode
  /** Action de droite : préférences, menu, synchronisation. */
  action?: React.ReactNode
}) {
  return (
    <header
      data-slot="mobile-app-bar"
      className={cn(
        "pt-safe sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur",
        className
      )}
      {...props}
    >
      <div className="flex h-14 items-center gap-s-2 px-s-2">
        <span className="flex size-target shrink-0 items-center justify-center">
          {back}
        </span>
        <span className="grid min-w-0 flex-1 justify-items-center text-center">
          <span className="text-body w-full truncate font-semibold">
            {title}
          </span>
          {subtitle && (
            <span className="text-caption w-full truncate text-ink-muted">
              {subtitle}
            </span>
          )}
        </span>
        <span className="flex size-target shrink-0 items-center justify-center">
          {action}
        </span>
      </div>
    </header>
  )
}

/**
 * Bouton d'extrémité de la barre de titre — 44 px de cible tactile pour une
 * icône de 20 px, conformément à la règle SETRAG.
 */
function MobileAppBarButton({
  className,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="mobile-app-bar-button"
      className={cn(
        "inline-flex size-target items-center justify-center rounded-pill text-ink transition-colors duration-200 ease-setrag hover:bg-surface-sunk [&_svg]:size-5 [&_svg]:shrink-0",
        className
      )}
      {...(asChild ? {} : { type: "button" as const })}
      {...props}
    >
      {children}
    </Comp>
  )
}

/** Retour arrière, avec le chevron et le libellé accessible déjà posés. */
function MobileAppBarBack({
  label = "Revenir à l'écran précédent",
  ...props
}: React.ComponentProps<typeof MobileAppBarButton> & { label?: string }) {
  return (
    <MobileAppBarButton {...props}>
      <ChevronLeft aria-hidden />
      <span className="sr-only">{label}</span>
    </MobileAppBarButton>
  )
}

export { MobileAppBar, MobileAppBarBack, MobileAppBarButton }
