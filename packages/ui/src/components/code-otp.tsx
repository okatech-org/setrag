"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Code reçu par SMS ou par e-mail. Un seul champ réel (lu automatiquement par
 * le téléphone grâce à `autocomplete="one-time-code"`), dessiné en cases.
 * Une erreur s'écrit sous le champ : pas de secousse.
 */
export function CodeOtp({
  valeur,
  onChange,
  longueur = 6,
  invalide,
  autoFocus,
  label = "Code de connexion",
  className,
}: {
  valeur: string
  onChange: (valeur: string) => void
  longueur?: number
  invalide?: boolean
  autoFocus?: boolean
  label?: string
  className?: string
}) {
  const [focus, setFocus] = React.useState(false)
  return (
    <div className={cn("relative grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${longueur}, minmax(0, 1fr))` }}>
      {Array.from({ length: longueur }, (_, i) => {
        const courant = focus && i === Math.min(valeur.length, longueur - 1)
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "grid h-14 place-items-center rounded-md border bg-surface font-mono text-[24px] font-semibold transition-[border-color,box-shadow]",
              invalide ? "border-danger" : courant ? "border-accent-base shadow-[var(--focus-ring)]" : "border-line-strong"
            )}
          >
            {valeur[i] ?? (courant ? <span className="h-6 w-0.5 animate-[st-veille_1.1s_steps(1)_infinite] bg-accent-base" /> : "")}
          </span>
        )
      })}
      <input
        aria-label={label}
        aria-invalid={invalide || undefined}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={longueur}
        value={valeur}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, longueur))}
        className="absolute inset-0 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
      />
    </div>
  )
}
