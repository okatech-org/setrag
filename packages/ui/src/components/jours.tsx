"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { IndicateurRuban, useIndicateur } from "./indicateur"

export interface Jour {
  /** Date ISO (AAAA-MM-JJ) : la valeur transmise au choix. */
  valeur: string
  /** « Ven. 2 » */
  libelle: string
  /** Prix le plus bas, nombre de trains, « complet »… */
  detail?: string
  etat?: "meilleur" | "complet"
}

export interface JoursProps extends Omit<React.ComponentProps<"div">, "onChange"> {
  jours: Jour[]
  valeur: string
  onChange: (valeur: string) => void
  label?: string
}

/**
 * Bande des jours autour de la date cherchée : le ruban glisse sous le jour
 * choisi. Défile au doigt sur mobile, tient sur une ligne sur grand écran.
 */
export function Jours({ jours, valeur, onChange, label = "Choisir un jour", className, ...props }: JoursProps) {
  const { ref, position, anime } = useIndicateur<HTMLDivElement>(valeur)

  // Le jour choisi reste visible quand la bande défile.
  // Défilement horizontal seul : scrollIntoView ferait aussi défiler la page.
  React.useEffect(() => {
    const bande = ref.current
    const actif = bande?.querySelector<HTMLElement>('[data-actif="true"]')
    if (!bande || !actif) return
    bande.scrollTo({ left: actif.offsetLeft - (bande.clientWidth - actif.offsetWidth) / 2, behavior: "smooth" })
  }, [valeur, ref])

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cn(
        "no-scrollbar relative grid snap-x auto-cols-[minmax(76px,1fr)] grid-flow-col overflow-x-auto rounded-md border border-line bg-surface",
        className
      )}
      {...props}
    >
      {jours.map((jour, index) => {
        const actif = jour.valeur === valeur
        return (
          <button
            key={jour.valeur}
            type="button"
            role="radio"
            aria-checked={actif}
            data-actif={actif}
            disabled={jour.etat === "complet"}
            onClick={() => onChange(jour.valeur)}
            className={cn(
              "grid snap-start justify-items-center gap-px px-1 pt-2.5 pb-3 transition-colors hover:bg-surface-sunk disabled:hover:bg-transparent",
              index > 0 && "border-l border-line"
            )}
          >
            <span className="text-[12px] font-medium text-ink-muted">{jour.libelle.split(" ")[0]}</span>
            <span className={cn("text-[15px] font-bold", actif ? "text-accent-ink" : "text-ink")}>{jour.libelle.split(" ").slice(1).join(" ")}</span>
            {jour.detail && (
              <span
                className={cn(
                  "font-mono text-[11.5px] font-medium",
                  jour.etat === "meilleur" ? "font-semibold text-success-ink" : jour.etat === "complet" ? "text-ink-faint" : "text-ink-muted"
                )}
              >
                {jour.detail}
              </span>
            )}
          </button>
        )
      })}
      <IndicateurRuban position={position} anime={anime} className="bottom-0 rounded-b-none" />
    </div>
  )
}
