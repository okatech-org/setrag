import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { RAILS, S } from "../marque/traces"

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  /** Toujours proposer une sortie : un jour voisin, une recherche. */
  action?: React.ReactNode
  /** Le S gris, rame à quai, par défaut ; `false` pour ne rien afficher. */
  illustration?: React.ReactNode | false
}

/** Le S en gris, la rame à quai en haut : rien ne roule encore. Jamais animé. */
export function SAttente({ className }: { className?: string }) {
  const id = `sa${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg viewBox="12 1 76 98" aria-hidden className={cn("h-24 w-auto", className)}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={79} y1={0} x2={52} y2={0}>
          <stop offset="0" stopColor="#029E60" />
          <stop offset=".5" stopColor="#FCDF49" />
          <stop offset="1" stopColor="#0F50A0" />
        </linearGradient>
      </defs>
      <path d={S} fill="none" stroke="var(--c-line-strong)" strokeOpacity={0.55} strokeWidth={12} strokeDasharray="1.8 2.9" />
      {RAILS.map((d) => (
        <path key={d.slice(0, 24)} d={d} fill="none" stroke="var(--c-line-strong)" strokeWidth={1.5} strokeLinecap="round" />
      ))}
      <path d={S} pathLength={1} fill="none" stroke={`url(#${id})`} strokeWidth={8.4} strokeLinecap="round" strokeDasharray="0.13 2" strokeDashoffset={-0.02} />
    </svg>
  )
}

/**
 * État vide SETRAG : le S gris et une porte de sortie — « Le prochain part
 * samedi à 07:40 » plutôt qu'un simple « Aucun résultat ».
 */
function EmptyState({ title, description, action, illustration, className, ...props }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn("grid justify-items-center gap-3 px-4 py-6 text-center", className)} {...props}>
      {illustration === undefined ? <SAttente /> : illustration}
      <span className="text-[18px] leading-snug font-bold text-ink">{title}</span>
      {description && <span className="max-w-[34ch] text-[14px] leading-normal text-ink-muted">{description}</span>}
      {action && <span className="pt-1">{action}</span>}
    </div>
  )
}

/** Trois lignes grisées : chargement de moins d'une seconde. */
function SkeletonLines({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-2 rounded-md border border-line bg-surface p-4", className)}>
      <span className="h-[18px] w-3/5 rounded-[6px] bg-surface-sunk" />
      <span className="h-3 w-[85%] rounded-[6px] bg-surface-sunk" />
      <span className="h-3 w-2/5 rounded-[6px] bg-surface-sunk" />
    </div>
  )
}

export { EmptyState, SkeletonLines }
