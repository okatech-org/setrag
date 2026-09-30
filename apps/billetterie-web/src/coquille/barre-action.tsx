import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Barre d'action collée en bas de l'écran, dans le tunnel d'achat : ce qui est
 * choisi à gauche, le total à droite, le bouton qui fait avancer le voyage.
 * Sur mobile, elle tient au-dessus de la barre d'accueil du téléphone.
 */
export function BarreAction({
  info,
  total,
  children,
  className,
}: {
  /** « Express 201 · 2e classe » */
  info?: ReactNode
  /** Montant principal, déjà formaté. */
  total?: { libelle: ReactNode; montant: ReactNode }
  /** L'action — un seul bouton primaire. */
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "pb-safe sticky bottom-0 z-30 border-t border-line bg-surface shadow-[0_-6px_18px_oklch(0.22_0.025_257/0.06)]",
        className
      )}
    >
      <div className="mx-auto grid w-full max-w-[1240px] gap-2 px-4 py-3 md:flex md:items-center md:gap-5 md:px-8 md:py-3.5">
        {info && <div className="hidden min-w-0 text-small text-ink-muted md:grid [&_b]:text-[16px] [&_b]:text-ink">{info}</div>}
        {total && (
          <div className="flex items-baseline justify-between gap-3 text-small text-ink-muted md:ml-auto md:grid md:justify-items-end md:gap-0">
            <span>{total.libelle}</span>
            <b className="text-[20px] text-ink md:text-[22px]">{total.montant}</b>
          </div>
        )}
        <div className={cn("grid md:flex md:gap-3", !total && "md:ml-auto")}>{children}</div>
      </div>
    </div>
  )
}
