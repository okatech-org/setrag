"use client"

import { CircleCheck, CircleDashed, CircleX, Clock, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react"

import { Tag, type TagProps } from "@workspace/ui/components/tag"

type Ton = NonNullable<TagProps["tone"]>

export const STATUTS_CONSTAT = {
  a_lancer: { libelle: "À lancer", ton: "neutral", icone: CircleDashed },
  en_cours: { libelle: "En cours", ton: "info", icone: Clock },
  realisee: { libelle: "Réalisée", ton: "warning", icone: CircleCheck },
  verifiee: { libelle: "Vérifiée", ton: "success", icone: ShieldCheck },
  abandonnee: { libelle: "Abandonnée", ton: "neutral", icone: CircleX },
} as const satisfies Record<string, { libelle: string; ton: Ton; icone: LucideIcon }>
export type StatutConstat = keyof typeof STATUTS_CONSTAT

export const GRAVITES = {
  majeure: { libelle: "Majeure", ton: "danger" },
  moderee: { libelle: "Modérée", ton: "warning" },
  mineure: { libelle: "Mineure", ton: "neutral" },
} as const satisfies Record<string, { libelle: string; ton: Ton }>
export type Gravite = keyof typeof GRAVITES

export const NATURES_ANNOTATION = {
  commentaire: "Commentaire",
  question: "Question",
  reserve: "Réserve",
} as const
export type NatureAnnotation = keyof typeof NATURES_ANNOTATION

export function TagStatutConstat({ statut }: { statut: StatutConstat }) {
  const definition = STATUTS_CONSTAT[statut]
  const Icone = definition.icone
  return (
    <Tag tone={definition.ton}>
      <Icone aria-hidden />
      {definition.libelle}
    </Tag>
  )
}

export function TagGravite({ gravite }: { gravite: Gravite }) {
  const definition = GRAVITES[gravite]
  return (
    <Tag tone={definition.ton}>
      {gravite === "majeure" ? <TriangleAlert aria-hidden /> : null}
      Gravité {definition.libelle.toLowerCase()}
    </Tag>
  )
}
