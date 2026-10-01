"use client"

import { Ban, CircleCheck, CircleDashed, ShieldAlert, TriangleAlert } from "lucide-react"

import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Pastille } from "@/components/gestion/referentiels/statuts"

import { APTITUDES, GRAVITES_DEFAUT } from "../commun"

export type Aptitude = keyof typeof APTITUDES
export type Gravite = keyof typeof GRAVITES_DEFAUT

export interface Decision {
  autorise: boolean
  motifs: readonly string[]
  aptitude: Aptitude | null
}

/** Décision de départ écrite en toutes lettres : « Départ autorisé » ou « Départ bloqué ». */
export function libelleDecision(decision: Pick<Decision, "autorise">) {
  return decision.autorise ? "Départ autorisé" : "Départ bloqué"
}

export function TagDecision({ decision }: { decision: Pick<Decision, "autorise"> }) {
  return decision.autorise ? (
    <Pastille ton="success" icone={CircleCheck}>
      Départ autorisé
    </Pastille>
  ) : (
    <Pastille ton="danger" icone={Ban}>
      Départ bloqué
    </Pastille>
  )
}

/** Bandeau de tête d'une visite : la décision, puis ce qui la fonde. */
export function BandeauDecision({ decision }: { decision: Decision }) {
  if (decision.autorise) {
    return (
      <InlineMessage tone="success" title="Départ autorisé">
        {decision.aptitude ? `${APTITUDES[decision.aptitude].libelle} : visite signée, aucun engin du convoi indisponible.` : null}
      </InlineMessage>
    )
  }
  return (
    <InlineMessage tone="danger" title="Départ bloqué">
      <span className="grid gap-0.5">
        {decision.motifs.map((motif) => (
          <span key={motif} className="block">
            {motif}
          </span>
        ))}
      </span>
    </InlineMessage>
  )
}

const GRAVITE_TONS = {
  mineur: { ton: "neutral", icone: CircleDashed },
  majeur: { ton: "warning", icone: TriangleAlert },
  bloquant: { ton: "danger", icone: ShieldAlert },
} as const

export function TagGraviteDefaut({ gravite }: { gravite: Gravite }) {
  const def = GRAVITE_TONS[gravite]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {GRAVITES_DEFAUT[gravite]}
    </Pastille>
  )
}

/**
 * Aptitudes que le visiteur peut prononcer au vu des défauts : jamais plus
 * favorable qu'eux (règle du serveur, reprise ici pour ne proposer que
 * l'admissible).
 */
export function aptitudesAdmises(defauts: readonly { gravite: Gravite }[]): Aptitude[] {
  if (defauts.some((defaut) => defaut.gravite === "bloquant")) return ["inapte"]
  if (defauts.some((defaut) => defaut.gravite === "majeur")) return ["apte_sous_reserve", "inapte"]
  return ["apte", "apte_sous_reserve", "inapte"]
}
