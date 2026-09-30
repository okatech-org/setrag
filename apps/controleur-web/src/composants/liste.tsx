import { ChevronRightIcon, type LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/** Liste en carte : des lignes séparées d'un filet. */
export function Liste({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-line bg-surface", className)}>
      {children}
    </div>
  )
}

/**
 * Une ligne : icône, libellé et son détail, et à droite ce qu'elle vaut. Une
 * ligne actionnable porte un chevron et fait au moins 52 px.
 */
export function Ligne({
  icone: Icone,
  libelle,
  detail,
  fin,
  href,
  onClick,
  className,
}: {
  icone?: LucideIcon
  libelle: ReactNode
  detail?: ReactNode
  fin?: ReactNode
  href?: Route
  onClick?: () => void
  className?: string
}) {
  const actionnable = Boolean(href || onClick)
  const contenu = (
    <>
      {Icone && <Icone aria-hidden className="size-5 shrink-0 text-ink-muted" />}
      <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-medium">
        <span className="block">{libelle}</span>
        {detail && (
          <small className="block text-[12.5px] font-medium text-ink-muted">{detail}</small>
        )}
      </span>
      {(fin || actionnable) && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[14px] font-medium whitespace-nowrap text-ink-muted">
          {fin}
          {actionnable && <ChevronRightIcon aria-hidden className="size-[18px]" />}
        </span>
      )}
    </>
  )
  const classes = cn(
    "flex min-h-[52px] w-full items-center gap-3 border-t border-line px-4 py-2 text-left first:border-t-0",
    actionnable && "active:bg-surface-sunk",
    className
  )
  if (href) {
    return (
      <Link href={href} className={classes}>
        {contenu}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {contenu}
      </button>
    )
  }
  return <div className={classes}>{contenu}</div>
}
