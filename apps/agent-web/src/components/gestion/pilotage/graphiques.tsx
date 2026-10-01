"use client"

import type { ReactNode } from "react"

import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

export interface PointSerie {
  cle: string
  /** Étiquette d’axe, courte (« 18 », « 1er »). */
  etiquette: string
  /** Libellé complet, pour la table et l’infobulle. */
  libelle: string
  valeur: number
  /** Valeur écrite (« 6,4 »). */
  texte: string
}

/**
 * Série en barres CSS, une seule teinte d’accent. La dernière barre (le jour
 * le plus récent) et la barre survolée affichent leur valeur ; toutes les
 * valeurs sont doublées d’un tableau replié, jamais portées par la hauteur
 * seule.
 */
export function Barres({
  points,
  libelle,
  unite,
  legendeTableau,
}: {
  points: readonly PointSerie[]
  libelle: string
  unite: string
  legendeTableau: string
}) {
  const max = Math.max(1, ...points.map((p) => p.valeur)) * 1.1
  const pas = points.length > 16 ? Math.ceil(points.length / 12) : 1
  return (
    <div className="grid min-w-0 gap-2">
      <div
        role="img"
        aria-label={`${libelle}, en ${unite}. Valeurs détaillées dans le tableau qui suit.`}
        className="grid h-[180px] items-end gap-[3px] pt-5 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((point, index) => {
          const dernier = index === points.length - 1
          return (
            <div
              key={point.cle}
              title={`${point.libelle} : ${point.texte} ${unite}`}
              className={cn(
                "group relative min-h-0.5 rounded-t-[4px] transition-colors duration-[var(--dur-fast)]",
                dernier ? "bg-accent-base" : "bg-accent-line hover:bg-accent-base"
              )}
              style={{ height: `${(Math.max(0, point.valeur) / max) * 100}%` }}
            >
              <b
                className={cn(
                  "pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 font-mono text-[11px] font-semibold whitespace-nowrap text-ink transition-opacity",
                  dernier ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                {point.texte}
              </b>
            </div>
          )
        })}
      </div>
      <div
        aria-hidden
        className="grid gap-[3px] border-t border-line-strong pt-1.5 text-center font-mono text-[11px] text-ink-muted sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((point, index) => (
          <span key={point.cle} className="truncate">
            {index % pas === 0 || index === points.length - 1 ? point.etiquette : ""}
          </span>
        ))}
      </div>
      <details className="text-small">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-ink">
          Voir le tableau : {legendeTableau}
        </summary>
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-[13.5px]">
            <caption className="sr-only">{legendeTableau}</caption>
            <thead>
              <tr className="bg-surface-sunk text-left text-[11.5px] tracking-[0.05em] text-ink-muted uppercase">
                <th scope="col" className="px-3 py-2">
                  Jour
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {unite}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.cle} className="border-t border-line">
                  <td className="px-3 py-1.5">{point.libelle}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{point.texte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** Remplissage : libellé, voie (le ruban jusqu’au taux) et chiffre écrit. */
export function LigneRemplissage({
  titre,
  detail,
  taux,
  complement,
}: {
  titre: ReactNode
  detail?: ReactNode
  /** 0 → 100 */
  taux: number
  complement?: ReactNode
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-x-3 gap-y-1 text-[13.5px] font-medium sm:grid-cols-[minmax(150px,200px)_minmax(0,1fr)_56px]">
      <span className="min-w-0">
        <span className="block truncate">{titre}</span>
        {detail ? <small className="block truncate text-[12px] font-normal text-ink-muted">{detail}</small> : null}
      </span>
      <Voie rempli={Math.max(0, Math.min(1, taux / 100))} className="order-3 col-span-2 w-full flex-none sm:order-none sm:col-span-1" />
      <b className="text-right font-mono text-[14px] font-semibold tabular-nums">
        {Math.round(taux)} %{complement}
      </b>
    </li>
  )
}
