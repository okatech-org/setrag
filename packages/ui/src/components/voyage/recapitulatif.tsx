import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { Tenue } from "../compte-a-rebours"

export interface LigneRecap {
  libelle: React.ReactNode
  montant: string
  /** Réduction : écrite en vert, en montant négatif. */
  remise?: boolean
}

export interface RecapitulatifProps extends React.ComponentProps<"section"> {
  titre: React.ReactNode
  /** « Ven. 2 oct. · 07:40 → 19:25 · Express 201 » (mono). */
  sousTitre?: React.ReactNode
  lignes: LigneRecap[]
  total: string
  /** Fin de la tenue des places (horodatage) : affiche le compte à rebours. */
  tenueJusqua?: number
  children?: React.ReactNode
}

/** Le récapitulatif du panier : trajet, voyageurs, réductions, total. */
export function Recapitulatif({ titre, sousTitre, lignes, total, tenueJusqua, children, className, ...props }: RecapitulatifProps) {
  return (
    <section className={cn("overflow-hidden rounded-md border border-line bg-surface", className)} {...props}>
      <header className="grid gap-1 border-b border-line p-4">
        <b className="text-[17px] font-bold">{titre}</b>
        {sousTitre && <span className="font-mono text-[13px] text-ink-muted">{sousTitre}</span>}
      </header>
      <div className="grid gap-2.5 p-4 pt-3 text-small">
        {tenueJusqua && <Tenue fin={tenueJusqua} />}
        {lignes.map((ligne, i) => (
          <div key={i} className="flex justify-between gap-3 text-ink-muted">
            <span className="min-w-0">{ligne.libelle}</span>
            <span className={cn("font-mono tabular-nums", ligne.remise ? "text-success-ink" : "text-ink")}>{ligne.montant}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-[18px] font-bold">
          <span>Total</span>
          <span>{total}</span>
        </div>
        {children}
      </div>
    </section>
  )
}
