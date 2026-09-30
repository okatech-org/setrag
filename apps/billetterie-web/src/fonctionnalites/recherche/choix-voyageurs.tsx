"use client"

import { InfoIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Compteur } from "@workspace/ui/components/compteur"
import { Feuille } from "@workspace/ui/components/feuille"

import { VOYAGEURS_MAX } from "@/lib/voyage"

import { libelleEnfant, type Reduction } from "../reference/use-reference"

/**
 * Le nombre de voyageurs. Un enfant voyage avec au moins un adulte ; au-delà
 * de neuf personnes, c'est un groupe, qui se réserve au guichet.
 */
export function ChoixVoyageurs({
  open,
  onOpenChange,
  adultes,
  enfants,
  reductionEnfant,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  adultes: number
  enfants: number
  reductionEnfant: Reduction | null
  onChange: (valeur: { adultes: number; enfants: number }) => void
}) {
  const total = adultes + enfants
  return (
    <Feuille
      open={open}
      onOpenChange={onOpenChange}
      titre="Voyageurs"
      pied={
        <Button block size="lg" onClick={() => onOpenChange(false)}>
          Valider
        </Button>
      }
    >
      <div className="grid divide-y divide-line">
        <div className="flex min-h-[64px] items-center justify-between gap-4">
          <div>
            <b className="block text-[16px]">Adultes</b>
            <span className="text-small text-ink-muted">12 ans et plus</span>
          </div>
          <Compteur label="Adultes" valeur={adultes} min={1} max={VOYAGEURS_MAX - enfants} onChange={(n) => onChange({ adultes: n, enfants })} />
        </div>
        <div className="flex min-h-[64px] items-center justify-between gap-4">
          <div>
            <b className="block text-[16px]">{libelleEnfant(reductionEnfant)}</b>
            {reductionEnfant && <span className="text-small text-ink-muted">−{reductionEnfant.ratePct} % sur le billet</span>}
          </div>
          <Compteur label="Enfants" valeur={enfants} min={0} max={VOYAGEURS_MAX - adultes} onChange={(n) => onChange({ adultes, enfants: n })} />
        </div>
      </div>
      <p className="mt-3 flex gap-2 text-small text-ink-muted">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {total >= VOYAGEURS_MAX
          ? "Neuf voyageurs au plus par réservation en ligne. Au-delà, les tarifs de groupe s'obtiennent au guichet."
          : "Un enfant voyage avec au moins un adulte. Réductions sur justificatif (militaire…) : à l'étape des voyageurs."}
      </p>
    </Feuille>
  )
}
