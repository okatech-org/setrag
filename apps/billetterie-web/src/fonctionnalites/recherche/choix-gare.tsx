"use client"

import { SearchIcon } from "lucide-react"
import { useState } from "react"

import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Feuille } from "@workspace/ui/components/feuille"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { GARES_REPERES } from "@/lib/voyage"

import type { Gare } from "../reference/use-reference"

const sansAccents = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/**
 * Choix d'une gare, sur la ligne : les gares dans l'ordre où le train les
 * dessert, la voie à gauche. On choisit sur le réseau, pas dans une liste
 * alphabétique — c'est ainsi que le voyageur se représente son trajet.
 */
export function ChoixGare({
  open,
  onOpenChange,
  titre,
  gares,
  valeur,
  autre,
  autreLibelle,
  onChoisir,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: string
  /** `undefined` tant que le référentiel n'a pas répondu. */
  gares: Gare[] | undefined
  valeur: string | null
  /** L'autre extrémité du trajet : marquée, et non choisissable. */
  autre: string | null
  autreLibelle: string
  onChoisir: (code: string) => void
}) {
  const [filtre, setFiltre] = useState("")
  const recherche = sansAccents(filtre.trim())
  const liste = gares ?? []
  const visibles = recherche ? liste.filter((gare) => sansAccents(gare.name).includes(recherche)) : liste

  return (
    <Feuille
      open={open}
      onOpenChange={(ouverte) => {
        onOpenChange(ouverte)
        if (!ouverte) setFiltre("")
      }}
      titre={titre}
      hauteur="haute"
    >
      <label className="sticky top-0 z-[2] -mx-1 mb-2 flex h-12 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent-base">
        <SearchIcon className="size-[18px] text-ink-muted" aria-hidden />
        <input
          value={filtre}
          onChange={(event) => setFiltre(event.target.value)}
          placeholder="Rechercher une gare"
          aria-label="Rechercher une gare"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-muted"
          autoComplete="off"
        />
      </label>
      <ol className="relative">
        {!recherche && visibles.length > 1 && <span aria-hidden className="voie-v top-[23px] bottom-[23px] left-[21px]" />}
        {visibles.map((gare) => {
          const choisie = gare.code === valeur
          const exclue = gare.code === autre
          const repere = GARES_REPERES.has(gare.code)
          return (
            <li key={gare.code}>
              <button
                type="button"
                disabled={exclue}
                aria-pressed={choisie}
                onClick={() => {
                  onChoisir(gare.code)
                  onOpenChange(false)
                  setFiltre("")
                }}
                className={cn(
                  "relative grid min-h-[46px] w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center rounded-md pr-3 text-left text-[15px] transition-colors",
                  choisie ? "bg-accent-soft" : "enabled:hover:bg-surface-sunk",
                  exclue && "cursor-default"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "z-[1] justify-self-center rounded-pill border-[3px] bg-surface",
                    repere ? "size-4 border-ink-muted" : "size-3 border-line-strong",
                    (choisie || exclue) && "border-accent-base",
                    exclue && "bg-accent-base"
                  )}
                />
                <span className={cn("truncate", repere ? "font-bold" : "font-medium", exclue && "text-ink-muted")}>{gare.name}</span>
                {exclue ? (
                  <Tag tone="accent" className="h-[22px] text-[11.5px]">
                    {autreLibelle}
                  </Tag>
                ) : (
                  <small className="font-mono text-[12px] text-ink-faint">PK {gare.kilometerPoint}</small>
                )}
              </button>
            </li>
          )
        })}
        {gares === undefined && (
          <li aria-label="Chargement des gares">
            <SkeletonLines />
          </li>
        )}
        {gares !== undefined && visibles.length === 0 && <li className="py-6 text-center text-small text-ink-muted">Aucune gare ne porte ce nom sur la ligne.</li>}
      </ol>
    </Feuille>
  )
}
