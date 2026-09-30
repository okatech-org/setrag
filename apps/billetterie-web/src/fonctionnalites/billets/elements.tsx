"use client"

import {
  BanIcon,
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  FlagIcon,
  HourglassIcon,
  RotateCcwIcon,
  TimerOffIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Chargeur } from "@workspace/ui/components/voie"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { useAttenteLongue } from "@/fonctionnalites/tunnel/outils"

import type { StatutVente } from "./dossier"

const ICONES: Record<StatutVente["icone"], typeof BanIcon> = {
  valide: CircleCheckIcon,
  attente: HourglassIcon,
  annule: BanIcon,
  rembourse: RotateCcwIcon,
  fini: FlagIcon,
  expire: TimerOffIcon,
}

/** L'état d'une réservation, en mots : la teinte ne fait que le souligner. */
export function PastilleVente({ statut }: { statut: StatutVente }) {
  const Icone = ICONES[statut.icone]
  return (
    <Tag tone={statut.ton}>
      <Icone aria-hidden />
      {statut.libelle}
    </Tag>
  )
}

/** Conteneur des écrans de la billetterie. */
export function Conteneur({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-[1240px] content-start gap-5 px-4 pt-2 pb-10 md:gap-6 md:px-8 md:pt-10",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Attente d'une réponse : trois lignes grisées d'abord, la voie et sa rame
 * avec une phrase si l'attente dépasse la seconde.
 */
export function Attente({
  phrase,
  lignes = 2,
}: {
  phrase: string
  lignes?: number
}) {
  const longue = useAttenteLongue(true)
  if (longue) return <Chargeur className="py-10">{phrase}</Chargeur>
  return (
    <div className="grid gap-3" aria-busy>
      <span className="sr-only">{phrase}</span>
      {Array.from({ length: lignes }, (_, i) => (
        <SkeletonLines key={i} />
      ))}
    </div>
  )
}

/** Référence de réservation, en mono, avec sa copie en un geste. */
export function Reference({
  reference,
  className,
}: {
  reference: string
  className?: string
}) {
  const [copiee, setCopiee] = useState(false)
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(reference)
      setCopiee(true)
      toast("Référence copiée.")
      window.setTimeout(() => setCopiee(false), 2_000)
    } catch {
      toast("La copie n'est pas permise ici : notez la référence.")
    }
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className="font-mono font-semibold tracking-[0.02em] break-all tabular-nums">
        {reference}
      </span>
      <button
        type="button"
        onClick={copier}
        aria-label="Copier la référence"
        className="grid size-11 shrink-0 place-items-center rounded-pill text-accent-ink hover:bg-accent-soft"
      >
        {copiee ? (
          <CheckIcon className="size-[18px]" aria-hidden />
        ) : (
          <CopyIcon className="size-[18px]" aria-hidden />
        )}
      </button>
    </span>
  )
}
