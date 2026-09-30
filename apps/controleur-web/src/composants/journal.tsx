import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Un journal, pas une liste d'édition : aucune ligne n'offre de
 * modification, de suppression ni de glissement. Ce qui ressemblerait à un
 * geste d'édition n'existe pas — un contrôle enregistré ne se réécrit pas.
 */
export function Journal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-md border border-line bg-surface",
        className
      )}
    >
      {children}
    </ul>
  )
}

export function LigneJournal({
  heure,
  qui,
  reference,
  etat,
}: {
  heure: string
  qui: ReactNode
  reference?: ReactNode
  /** Pastille : verdict, état d'envoi, montant. */
  etat?: ReactNode
}) {
  return (
    <li className="grid min-h-[52px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-px border-t border-line px-2.5 py-1.5 first:border-t-0">
      <span className="row-span-2 font-mono text-[13px] font-semibold tabular-nums">
        {heure}
      </span>
      <span className="col-start-2 row-start-1 truncate text-[13px] font-semibold">
        {qui}
      </span>
      {reference && (
        <span className="col-span-2 col-start-2 row-start-2 truncate font-mono text-[10.5px] text-ink-muted">
          {reference}
        </span>
      )}
      {etat && (
        <span className="col-start-3 row-start-1 justify-self-end">{etat}</span>
      )}
    </li>
  )
}

/** Séparateur : « Confirmés à 11:52 · 3 contrôles ». */
export function SeparateurJournal({
  icone: Icone,
  children,
}: {
  icone?: LucideIcon
  children: ReactNode
}) {
  return (
    <li className="flex min-h-7 items-center gap-1.5 border-t border-line bg-surface-sunk px-3 text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase first:border-t-0">
      {Icone && <Icone aria-hidden className="size-[13px]" />}
      {children}
    </li>
  )
}
