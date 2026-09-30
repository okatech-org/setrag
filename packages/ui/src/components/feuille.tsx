"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Feuille SETRAG : choix d'une gare, d'une date, filtres, confirmations.
 *
 * Sur mobile, elle monte du bas (320 ms, sans rebond) et se ferme en la
 * tirant vers le bas ; sur grand écran, c'est une fenêtre centrée. Un seul
 * composant, pour que le contenu soit le même partout.
 */
export interface FeuilleProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: React.ReactNode
  description?: React.ReactNode
  /** Zone d'actions collée en bas (bouton principal). */
  pied?: React.ReactNode
  /** `haute` : la feuille occupe presque tout l'écran sur mobile (listes). */
  hauteur?: "auto" | "haute"
  className?: string
  children: React.ReactNode
}

export function Feuille({ open, onOpenChange, titre, description, pied, hauteur = "auto", className, children }: FeuilleProps) {
  const [decalage, setDecalage] = React.useState(0)
  const depart = React.useRef<number | null>(null)

  const glisser = {
    onPointerDown: (e: React.PointerEvent) => {
      depart.current = e.clientY
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (depart.current !== null) setDecalage(Math.max(0, e.clientY - depart.current))
    },
    onPointerUp: () => {
      if (decalage > 90) onOpenChange(false)
      depart.current = null
      setDecalage(0)
    },
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.15_0.02_257/0.42)] data-open:animate-in data-open:fade-in-0 data-open:duration-200 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col bg-canvas text-ink shadow-lg outline-none",
            // Mobile : feuille du bas.
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[22px] pb-safe data-open:animate-in data-open:slide-in-from-bottom data-open:duration-[320ms] data-open:ease-[var(--ease)] data-closed:animate-out data-closed:slide-out-to-bottom data-closed:duration-[160ms]",
            hauteur === "haute" && "h-[92dvh]",
            // Grand écran : fenêtre centrée.
            "md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[min(720px,88dvh)] md:w-[min(560px,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[22px] md:pb-0 md:data-open:slide-in-from-bottom-0 md:data-open:zoom-in-95 md:data-closed:slide-out-to-bottom-0 md:data-closed:zoom-out-95",
            className
          )}
          style={decalage ? { translate: `0 ${decalage}px`, transition: "none" } : undefined}
        >
          <div {...glisser} className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 md:hidden" aria-hidden>
            <span className="h-[5px] w-10 rounded-[3px] bg-line-strong" />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-1 pb-3 md:px-6 md:pt-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[18px] font-bold">{titre}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-small mt-0.5 text-ink-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{titre}</DialogPrimitive.Description>
              )}
            </div>
            {/* Pastille de 36 px, zone tactile de 44 px (charte). */}
            <DialogPrimitive.Close className="relative grid size-9 shrink-0 place-items-center rounded-pill bg-surface-sunk text-ink-muted after:absolute after:-inset-1 after:content-[''] hover:text-ink" aria-label="Fermer">
              <XIcon className="size-[18px]" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6">{children}</div>
          {pied && <div className="shrink-0 border-t border-line bg-surface px-4 py-3 md:rounded-b-[22px] md:px-6">{pied}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
