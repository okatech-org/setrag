"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Barre d'action collée au bas de la zone défilante — « Voir les dessertes »,
 * « Passer au paiement », « Payer 38 000 FCFA ».
 *
 * `sticky` et non `fixed` : la barre reste dans le flux, donc elle ne recouvre
 * jamais la fin du contenu et aucune compensation de hauteur n'est à prévoir.
 * Elle s'étend sur toute la largeur de son conteneur ; si celui-ci porte un
 * retrait horizontal, poser la barre en dehors plutôt que d'annuler le retrait
 * ici.
 *
 * Le rappel SETRAG s'applique : un seul bouton `primary` par écran.
 */
function StickyActions({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sticky-actions"
      className={cn(
        "pb-safe sticky bottom-0 z-20 grid gap-s-2 border-t border-line bg-surface/95 px-s-5 py-s-3 backdrop-blur",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { StickyActions }
