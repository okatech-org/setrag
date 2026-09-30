import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Ce que l'on sait d'un titre quand il n'y a pas de billet à montrer : ce
 * que dit le code, ou qu'il ne dit rien. `vide` : en tirets, sur fond creux —
 * aucune identité à afficher, et le terminal n'en invente pas.
 */
export function CarteTitre({
  titre,
  children,
  vide,
  className,
}: {
  titre: ReactNode
  children?: ReactNode
  vide?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-md border px-4 py-3.5",
        vide ? "border-dashed border-line-strong bg-surface-sunk" : "border-line bg-surface",
        className
      )}
    >
      <b className="text-[17px] leading-snug font-bold">{titre}</b>
      {children && (
        <div className="grid gap-1 text-[13.5px] leading-snug font-medium text-ink-muted">{children}</div>
      )}
    </div>
  )
}
