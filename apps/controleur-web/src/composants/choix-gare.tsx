"use client"

import { ChevronDownIcon } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { cn } from "@workspace/ui/lib/utils"

import { heure } from "@/lib/format"
import type { EmbarkedStop } from "@/lib/offline/types"
import { GARES_REPERES, heurePassage } from "@/lib/position"

import { TERRAIN } from "./boutons"

/**
 * Champ de sélection : il ouvre une feuille, où le choix se fait sur la
 * voie. Un bouton, pas une liste déroulante — la gare se choisit sur la
 * ligne, comme le voyageur se représente son trajet.
 */
export function ChampSelection({
  id,
  valeur,
  complement,
  onClick,
  "aria-describedby": describedBy,
}: {
  id?: string
  valeur: ReactNode
  complement?: ReactNode
  onClick: () => void
  "aria-describedby"?: string
}) {
  return (
    <button
      id={id}
      type="button"
      aria-haspopup="dialog"
      aria-describedby={describedBy}
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-2.5 rounded-md border border-line-strong bg-surface px-3.5 text-left text-[16px] font-semibold"
    >
      <span className="truncate">{valeur}</span>
      {complement && (
        <small className="shrink-0 font-mono text-[13px] font-medium text-ink-muted">
          {complement}
        </small>
      )}
      <ChevronDownIcon
        aria-hidden
        className="ml-auto size-[18px] shrink-0 text-ink-muted"
      />
    </button>
  )
}

/**
 * Les gares de la desserte sur la voie, dans l'ordre où le train les
 * dessert, avec leur heure et leur point kilométrique.
 *
 * Deux usages : choisir d'un toucher (départ, destination d'une vente), ou
 * désigner puis confirmer (dernière gare atteinte) — alors le bouton du bas
 * dit ce qu'il confirme.
 */
export function ChoixGare({
  open,
  onOpenChange,
  titre,
  description,
  arrets,
  valeur,
  exclue,
  confirmer,
  onChoisir,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: string
  description?: ReactNode
  arrets: EmbarkedStop[]
  /** Rang (`sequence`) de la gare retenue. */
  valeur: number | undefined
  /** Gares non choisissables (en amont du départ, par exemple). */
  exclue?: (arret: EmbarkedStop) => boolean
  /** Libellé du bouton de confirmation ; sans lui, un toucher suffit. */
  confirmer?: (arret: EmbarkedStop) => string
  onChoisir: (arret: EmbarkedStop) => void
}) {
  // La gare désignée avant confirmation ; à défaut, celle qui est retenue.
  const [designee, setDesignee] = useState<number | undefined>(undefined)
  const liste = useRef<HTMLOListElement>(null)
  const courante = confirmer ? (designee ?? valeur) : valeur
  const fermer = () => {
    setDesignee(undefined)
    onOpenChange(false)
  }
  const retenue = arrets.find((a) => a.sequence === courante)

  // À l'ouverture, la gare retenue vient sous les yeux, pas en bas de liste.
  useEffect(() => {
    if (!open) return
    const cadre = window.requestAnimationFrame(() => {
      liste.current
        ?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.scrollIntoView({ block: "center" })
    })
    return () => window.cancelAnimationFrame(cadre)
  }, [open])

  return (
    <Feuille
      open={open}
      onOpenChange={(ouverte) => (ouverte ? onOpenChange(true) : fermer())}
      titre={titre}
      description={description}
      hauteur="haute"
      pied={
        confirmer && retenue ? (
          <Button
            size="lg"
            block
            className={TERRAIN}
            onClick={() => {
              onChoisir(retenue)
              fermer()
            }}
          >
            {confirmer(retenue)}
          </Button>
        ) : undefined
      }
    >
      <ol ref={liste} className="relative">
        {arrets.length > 1 && (
          <span
            aria-hidden
            className="voie-v top-[23px] bottom-[23px] left-[23px]"
          />
        )}
        {arrets.map((arret) => {
          const choisie = arret.sequence === courante
          const horsJeu = exclue?.(arret) ?? false
          const repere = GARES_REPERES.has(arret.code)
          const passage = heurePassage(arret)
          return (
            <li key={arret.sequence}>
              <button
                type="button"
                disabled={horsJeu}
                aria-pressed={choisie}
                onClick={() => {
                  if (confirmer) {
                    setDesignee(arret.sequence)
                    return
                  }
                  onChoisir(arret)
                  fermer()
                }}
                className={cn(
                  "relative grid min-h-[46px] w-full grid-cols-[60px_minmax(0,1fr)_auto] items-center rounded-md pr-3 text-left text-[15px] transition-colors",
                  choisie ? "bg-accent-soft" : "enabled:active:bg-surface-sunk",
                  horsJeu && "opacity-45"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "z-[1] justify-self-center rounded-pill border-[3px] bg-surface",
                    repere || choisie ? "size-4" : "size-3",
                    choisie
                      ? "border-accent-base"
                      : repere
                        ? "border-ink-muted"
                        : "border-line-strong"
                  )}
                />
                <span
                  className={cn(
                    "truncate",
                    repere || choisie ? "font-bold" : "font-medium"
                  )}
                >
                  {arret.name}
                </span>
                <small className="font-mono text-[12px] text-ink-muted">
                  {passage !== undefined && `${heure(passage)} · `}PK{" "}
                  {arret.kilometerPoint}
                </small>
              </button>
            </li>
          )
        })}
      </ol>
    </Feuille>
  )
}
