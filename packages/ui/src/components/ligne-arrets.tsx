import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface Arret {
  nom: string
  /** Heure réelle (ou prévue s'il n'y a pas d'écart), « 13:07 ». */
  heure: string
  /** Heure prévue, barrée sous l'heure réelle quand elle diffère. */
  heurePrevue?: string
  km?: number
  majeur?: boolean
  passe?: boolean
  /** Pastille en bout de ligne : « Prochain », « Vous »… */
  mention?: React.ReactNode
}

export interface LigneArretsProps extends React.ComponentProps<"ol"> {
  arrets: Arret[]
  /**
   * Position estimée du train, en rang d'arrêt fractionnaire : 2.4 = entre le
   * 3e et le 4e arrêt, aux deux cinquièmes. La rame (le ruban) y glisse à
   * chaque mise à jour (1,2 s) ; absente si le train n'est pas en route.
   */
  rame?: number
  /** Hauteur d'une ligne, en px. */
  pas?: number
}

/**
 * Les arrêts d'un train, comme un plan de ligne : la voie à gauche, grise
 * pour le trajet parcouru, bleutée pour la suite ; heure réelle en gras.
 */
export function LigneArrets({ arrets, rame, pas = 44, className, ...props }: LigneArretsProps) {
  const centre = (i: number) => pas / 2 + i * pas
  const dernier = arrets.length - 1
  const hauteurRame = 22
  // La rame reste entre deux gares, sans jamais couvrir leur point.
  const yRame =
    rame !== undefined
      ? Math.min(Math.max(centre(rame) - hauteurRame / 2, centre(Math.floor(rame)) + 8), centre(Math.ceil(rame)) - hauteurRame - 8)
      : undefined
  const limite = rame !== undefined ? centre(rame) : centre(arrets.filter((a) => a.passe).length - 1)

  return (
    <ol className={cn("relative", className)} {...props}>
      {limite > centre(0) && <span aria-hidden className="voie-v left-[58px]" style={{ top: centre(0), height: limite - centre(0) }} />}
      <span aria-hidden className="voie-v left-[58px]" data-etat="a-venir" style={{ top: Math.max(limite, centre(0)), bottom: pas / 2 }} />
      {yRame !== undefined && (
        <span
          aria-hidden
          className="bg-ruban-v absolute left-[61px] z-[2] w-2 rounded-[4px] shadow-[0_0_0_3px_var(--c-canvas)] transition-[top] duration-[1200ms] ease-[var(--ease-glisse)]"
          style={{ top: yRame, height: hauteurRame }}
        />
      )}
      {arrets.map((arret, index) => (
        <li
          key={`${arret.nom}-${index}`}
          className={cn(
            "relative grid grid-cols-[52px_26px_minmax(0,1fr)_auto] items-center text-[14px]",
            arret.passe ? "text-ink-faint" : "text-ink",
            arret.majeur && "font-bold"
          )}
          style={{ minHeight: pas }}
        >
          <span className="font-mono text-[14px] font-semibold tabular-nums">
            {arret.heure}
            {arret.heurePrevue && arret.heurePrevue !== arret.heure && (
              <s className="block text-[11px] font-normal text-ink-faint">{arret.heurePrevue}</s>
            )}
          </span>
          <span
            aria-hidden
            className={cn(
              "z-[1] justify-self-center rounded-pill border-[3px] bg-surface",
              arret.majeur || index === 0 || index === dernier ? "size-[18px]" : "size-[14px]",
              arret.passe ? "border-line-strong" : "border-accent-base"
            )}
          />
          <span className="flex min-w-0 items-baseline gap-2 truncate">
            {arret.nom}
            {arret.km !== undefined && <small className="font-mono text-[12px] font-normal text-ink-faint">PK {arret.km}</small>}
            {arret.passe && <span className="sr-only">(desservi)</span>}
          </span>
          {arret.mention}
        </li>
      ))}
    </ol>
  )
}
