"use client"

import { cn } from "@workspace/ui/lib/utils"

import { useTerminal } from "./terminal-provider"

/**
 * État du réseau, toujours écrit en toutes lettres.
 *
 * Règle SETRAG : aucune information n'est portée par la couleur seule. Une
 * pastille verte ne dit rien à un agent daltonien, ni à quiconque regarde
 * l'écran en plein soleil sur un quai d'Owendo.
 */
export function NetworkBadge({ className }: { className?: string }) {
  const { online } = useTerminal()
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[13px] font-semibold",
        online
          ? "bg-success-soft text-success-ink"
          : "bg-warning-soft text-warning-ink",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-pill",
          online ? "bg-success" : "bg-warning"
        )}
      />
      {online ? "réseau" : "hors ligne"}
    </span>
  )
}

/** Pastille de statut générique, texte compris. */
export function StatusTag({
  tone,
  children,
  className,
}: {
  tone: "success" | "warning" | "danger" | "neutral"
  children: React.ReactNode
  className?: string
}) {
  const tones = {
    success: "bg-success-soft text-success-ink",
    warning: "bg-warning-soft text-warning-ink",
    danger: "bg-danger-soft text-danger-ink",
    neutral: "bg-surface-sunk text-ink-muted",
  } as const
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 text-[13px] font-semibold",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
