"use client"

import * as React from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/** Compteur − / + : voyageurs, bagages. Chiffre en mono, cibles de 36 px. */
export function Compteur({
  valeur,
  onChange,
  min = 0,
  max = 9,
  label,
  className,
}: {
  valeur: number
  onChange: (valeur: number) => void
  min?: number
  max?: number
  label: string
  className?: string
}) {
  const bouton =
    "grid size-9 place-items-center rounded-pill border border-line-strong bg-surface text-accent-ink transition-colors hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-surface"
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      <button type="button" className={bouton} onClick={() => onChange(valeur - 1)} disabled={valeur <= min} aria-label={`Retirer — ${label}`}>
        <MinusIcon className="size-4" />
      </button>
      <output aria-live="polite" className="min-w-[26px] text-center font-mono text-[16px] font-semibold">
        {valeur}
      </output>
      <button type="button" className={bouton} onClick={() => onChange(valeur + 1)} disabled={valeur >= max} aria-label={`Ajouter — ${label}`}>
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
