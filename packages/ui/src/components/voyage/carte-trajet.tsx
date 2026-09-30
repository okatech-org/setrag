"use client"

import * as React from "react"
import { TrainFrontIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { Voie } from "../voie"

export interface PointTrajet {
  heure: string
  gare: string
  /** Arrivée le lendemain : « +1 » en exposant. */
  lendemain?: boolean
}

export interface CarteTrajetProps extends Omit<React.ComponentProps<"article">, "onSelect"> {
  depart: PointTrajet
  arrivee: PointTrajet
  /** « 11 h 45 » */
  duree: string
  /** « 6 arrêts » */
  detail?: string
  /** « Express 201 » */
  train: string
  /** Pastilles de statut ou de mise en avant (à l'heure, retard, meilleur prix). */
  pastilles?: React.ReactNode
  prix?: { montant: string; avant?: string; apres?: string }
  etat?: "defaut" | "choisi" | "supprime"
  onChoisir?: () => void
  /** Contenu dévoilé quand le trajet est choisi (les classes). */
  children?: React.ReactNode
}

/**
 * Un trajet dans les résultats. L'heure d'abord (mono 24), le prix ensuite,
 * le reste en gris. La voie relie départ et arrivée ; quand le trajet est
 * choisi, le ruban la remplit (480 ms). S'adapte à sa largeur : prix à droite
 * sur grand écran, sous les heures sur mobile.
 */
export function CarteTrajet({
  depart,
  arrivee,
  duree,
  detail,
  train,
  pastilles,
  prix,
  etat = "defaut",
  onChoisir,
  children,
  className,
  ...props
}: CarteTrajetProps) {
  const supprime = etat === "supprime"
  const choisi = etat === "choisi"

  return (
    <article
      data-etat={etat}
      className={cn(
        "@container rounded-md border bg-surface transition-[border-color,box-shadow] duration-[var(--dur-base)]",
        choisi ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]" : "border-line hover:border-line-strong",
        supprime && "opacity-70",
        className
      )}
      {...props}
    >
      <button
        type="button"
        aria-pressed={choisi}
        disabled={supprime || !onChoisir}
        onClick={onChoisir}
        className="grid w-full gap-3 rounded-md p-4 text-left @[560px]:grid-cols-[minmax(0,1fr)_auto] @[560px]:gap-x-6 @[560px]:px-5 disabled:cursor-default"
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Point point={depart} barre={supprime} />
          <div className="grid justify-items-center gap-1">
            <Voie etat={choisi ? "pleine" : "vide"} className="w-full" />
            <small className="font-mono text-[12px] whitespace-nowrap text-ink-muted">
              {duree}
              {detail && ` · ${detail}`}
            </small>
          </div>
          <Point point={arrivee} fin barre={supprime} />
        </div>
        <div className="flex flex-wrap items-center gap-2 @[560px]:col-start-1">
          <span className="inline-flex h-[26px] items-center gap-[5px] rounded-pill bg-surface-sunk px-2.5 text-[12.5px] font-semibold text-ink-muted">
            <TrainFrontIcon className="size-3.5" aria-hidden />
            {train}
          </span>
          {pastilles}
        </div>
        {prix && !supprime && (
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3 @[560px]:col-start-2 @[560px]:row-span-2 @[560px]:row-start-1 @[560px]:grid @[560px]:min-w-[140px] @[560px]:content-center @[560px]:justify-items-end @[560px]:gap-0.5 @[560px]:border-t-0 @[560px]:border-l @[560px]:pt-0 @[560px]:pl-5">
            {prix.avant && <small className="text-caption text-ink-muted">{prix.avant}</small>}
            <b className="text-[21px] font-bold whitespace-nowrap">{prix.montant}</b>
            {prix.apres && <span className="text-[12px] font-medium text-ink-muted">{prix.apres}</span>}
          </div>
        )}
      </button>
      {choisi && children && <div className="border-t border-line px-4 pt-3 pb-4 @[560px]:px-5">{children}</div>}
    </article>
  )
}

function Point({ point, fin, barre }: { point: PointTrajet; fin?: boolean; barre?: boolean }) {
  return (
    <div className={cn(fin && "text-right")}>
      <b className={cn("block font-mono text-[22px] leading-none font-semibold tabular-nums @[560px]:text-[24px]", barre && "line-through decoration-2")}>
        {point.heure}
        {point.lendemain && <sup className="ml-0.5 align-top font-mono text-[11px] font-semibold text-ink-muted">+1</sup>}
      </b>
      <span className="mt-1.5 block text-[13px] font-medium text-ink-muted">{point.gare}</span>
    </div>
  )
}
