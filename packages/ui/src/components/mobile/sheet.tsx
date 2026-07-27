"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Feuille glissante ancrée au bas de l'écran — sélection de date, choix du
 * nombre de voyageurs, ajout au Wallet.
 *
 * Bâtie sur la primitive Dialog de Radix, et non sur `Dialog` du design
 * system : celui-ci centre son contenu et n'a pas d'ancrage bas. Les deux
 * cohabitent — `Dialog` pour le bureau, `Sheet` pour le mobile.
 */
function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetContent({
  className,
  children,
  showHandle = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Poignée de glisse. Purement indicative : elle signale qu'on peut fermer. */
  showHandle?: boolean
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  /**
   * Le focus va sur la feuille elle-même, pas sur son premier élément.
   *
   * Radix vise sinon le premier bouton, et le navigateur fait défiler ce qui
   * le contient pour le rendre visible — un bandeau de pastilles se retrouve
   * alors décalé, première pastille rognée. La feuille reste focalisable
   * (`tabIndex` −1 posé par Radix), donc le piège à focus et l'annonce du
   * titre par les lecteurs d'écran sont préservés.
   */
  function handleOpenAutoFocus(event: Event) {
    onOpenAutoFocus?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    contentRef.current?.focus()
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-ink/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="sheet-content"
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          // `max-h-[85svh]` et non `dvh` : sur iOS la barre d'URL rétractable
          // ferait sauter la hauteur de la feuille pendant le défilement.
          "pb-safe fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col gap-s-4 rounded-t-lg bg-surface px-s-5 pt-s-3 shadow-lg outline-none duration-200 ease-setrag data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
          className
        )}
        {...props}
      >
        {showHandle && (
          <span
            aria-hidden
            className="mx-auto h-1 w-9 shrink-0 rounded-pill bg-line-strong"
          />
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("grid shrink-0 gap-1 pt-s-2", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-h4", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-small text-ink-muted", className)}
      {...props}
    />
  )
}

/**
 * Corps défilant. La feuille garde son en-tête et son pied fixes.
 *
 * Aucune compensation de retrait ici : celui de `SheetContent` suffit, et un
 * `-mx` s'ajouterait à celui d'un `ChipScroller` imbriqué — les pastilles
 * démarreraient alors hors de la colonne de texte.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("no-scrollbar grid gap-s-3 overflow-y-auto", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("grid shrink-0 gap-s-2 pb-s-5", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
}
