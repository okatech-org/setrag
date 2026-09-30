import type { ReactNode } from "react"

import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import type { Famille } from "@/lib/verdicts"

const OCTOGONE = "20.5,4.3 43.5,4.3 59.7,20.5 59.7,43.5 43.5,59.7 20.5,59.7 4.3,43.5 4.3,20.5"

/**
 * La forme d'une famille de verdict : cercle et coche (accepté), triangle et
 * point d'exclamation (à vérifier), octogone et croix (refusé), cadre en
 * tirets (lecture impossible). Elle se lit sans la couleur.
 */
export function PictoVerdict({ famille, className }: { famille: Famille; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      {famille === "accepte" && (
        <>
          <circle cx="32" cy="32" r="29" className="fill-success" />
          <path
            d="M19.5 33.5l8.5 8.5 17-18.5"
            fill="none"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-ink-inverse"
          />
        </>
      )}
      {famille === "vigilance" && (
        <>
          <path
            d="M28.2 7.6a4.4 4.4 0 0 1 7.6 0l24.3 42.8A4.4 4.4 0 0 1 56.3 57H7.7a4.4 4.4 0 0 1-3.8-6.6z"
            className="fill-warning"
          />
          <path
            d="M32 23v15"
            fill="none"
            strokeWidth="6.5"
            strokeLinecap="round"
            className="stroke-brand-encre"
          />
          <circle cx="32" cy="47.5" r="3.9" className="fill-brand-encre" />
        </>
      )}
      {famille === "refus" && (
        <>
          <polygon
            points={OCTOGONE}
            strokeWidth="5"
            strokeLinejoin="round"
            className="fill-danger stroke-danger"
          />
          <path
            d="M22.5 22.5l19 19M41.5 22.5l-19 19"
            fill="none"
            strokeWidth="6.5"
            strokeLinecap="round"
            className="stroke-ink-inverse"
          />
        </>
      )}
      {famille === "lecture" && (
        <>
          <rect
            x="5"
            y="5"
            width="54"
            height="54"
            rx="12"
            fill="none"
            strokeWidth="4"
            strokeDasharray="8 6"
            className="stroke-ink-muted"
          />
          <path d="M17 32h30" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-ink-muted" />
        </>
      )}
    </svg>
  )
}

const TON_TAG: Record<Famille, "success" | "warning" | "danger" | "neutral"> = {
  accepte: "success",
  vigilance: "warning",
  refus: "danger",
  lecture: "neutral",
}

/** Pastille d'un verdict, avec sa forme en miniature : historique, recherche. */
export function TagVerdict({
  famille,
  children,
  className,
}: {
  famille: Famille
  children: ReactNode
  className?: string
}) {
  return (
    <Tag tone={TON_TAG[famille]} className={className}>
      <PictoVerdict famille={famille} className="size-3.5" />
      {children}
    </Tag>
  )
}
