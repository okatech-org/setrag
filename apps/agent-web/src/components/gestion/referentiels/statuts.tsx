"use client"

import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Flag,
  History,
  Lock,
  LockOpen,
  PencilLine,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Tag, type TagProps } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

type Ton = NonNullable<TagProps["tone"]>

/** Pastille d'état : le mot porte l'information, l'icône et la teinte la renforcent. */
export function Pastille({ ton, icone: Icone, children, className }: { ton: Ton; icone?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <Tag tone={ton} className={className}>
      {Icone ? <Icone aria-hidden /> : null}
      {children}
    </Tag>
  )
}

export type StatutApprobation = "brouillon" | "a_valider" | "actif" | "rejete" | "expire"

const APPROBATION: Record<StatutApprobation, { ton: Ton; icone: LucideIcon; masculin: string; feminin: string }> = {
  brouillon: { ton: "neutral", icone: PencilLine, masculin: "Brouillon", feminin: "Brouillon" },
  a_valider: { ton: "warning", icone: Clock, masculin: "À valider", feminin: "Soumise" },
  actif: { ton: "success", icone: CircleCheck, masculin: "Actif", feminin: "Active" },
  rejete: { ton: "danger", icone: CircleX, masculin: "Rejeté", feminin: "Refusée" },
  expire: { ton: "neutral", icone: History, masculin: "Expiré", feminin: "Expirée" },
}

export function libelleApprobation(status: StatutApprobation, genre: "masculin" | "feminin" = "masculin") {
  return APPROBATION[status][genre]
}

export function TagApprobation({ status, genre = "masculin" }: { status: StatutApprobation; genre?: "masculin" | "feminin" }) {
  const def = APPROBATION[status]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def[genre]}
    </Pastille>
  )
}

/**
 * Cycle de vie d'un objet validé (livret, grille). Les étapes franchies sont
 * reliées par le ruban ; l'étape courante est dite en toutes lettres.
 */
export function CycleVie({ etapes, courante, className }: { etapes: readonly string[]; courante: number; className?: string }) {
  return (
    <ol aria-label="Cycle de vie" className={cn("flex flex-wrap items-center gap-y-2 text-[12.5px] font-semibold text-ink-muted", className)}>
      {etapes.map((etape, index) => {
        const faite = index < courante
        const ici = index === courante
        return (
          <li key={etape} className="flex items-center" aria-current={ici ? "step" : undefined}>
            {index > 0 ? (
              <span aria-hidden className={cn("mx-1.5 h-0.5 w-5 rounded-[2px] sm:w-7", index <= courante ? "bg-ruban h-[3px]" : "bg-line-strong")} />
            ) : null}
            <span className={cn("inline-flex items-center gap-1.5", ici && "text-ink")}>
              <span
                aria-hidden
                className={cn(
                  "size-2.5 rounded-full border-[2.5px]",
                  faite ? "border-accent-base bg-accent-base" : ici ? "border-accent-base bg-surface" : "border-line-strong bg-surface"
                )}
              />
              {etape}
              {faite ? <span className="sr-only"> (franchie)</span> : ici ? <span className="sr-only"> (étape actuelle)</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function TagActif({ actif, oui = "Actif", non = "Suspendu" }: { actif: boolean; oui?: string; non?: string }) {
  return actif ? (
    <Pastille ton="success" icone={CircleCheck}>
      {oui}
    </Pastille>
  ) : (
    <Pastille ton="danger" icone={Ban}>
      {non}
    </Pastille>
  )
}

export const ETATS_REGLE = {
  active: { ton: "success", icone: CircleCheck, libelle: "Active" },
  suspendue: { ton: "neutral", icone: Ban, libelle: "Suspendue" },
  programmee: { ton: "warning", icone: Clock, libelle: "Programmée" },
  echue: { ton: "neutral", icone: History, libelle: "Échue" },
} as const satisfies Record<string, { ton: Ton; icone: LucideIcon; libelle: string }>

export function TagRegle({ etat }: { etat: keyof typeof ETATS_REGLE }) {
  const def = ETATS_REGLE[etat]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def.libelle}
    </Pastille>
  )
}

export const ETATS_INCIDENT = {
  ouvert: { ton: "danger", icone: TriangleAlert, libelle: "Ouvert" },
  en_cours: { ton: "warning", icone: Clock, libelle: "En cours" },
  resolu: { ton: "success", icone: CircleCheck, libelle: "Clos" },
} as const satisfies Record<string, { ton: Ton; icone: LucideIcon; libelle: string }>

export function TagIncident({ status }: { status: keyof typeof ETATS_INCIDENT }) {
  const def = ETATS_INCIDENT[status]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def.libelle}
    </Pastille>
  )
}

export const GRAVITES = {
  information: { ton: "info", icone: Flag, libelle: "Information" },
  important: { ton: "warning", icone: TriangleAlert, libelle: "Importante" },
  critique: { ton: "danger", icone: TriangleAlert, libelle: "Critique" },
} as const satisfies Record<string, { ton: Ton; icone: LucideIcon; libelle: string }>

export function TagGravite({ severity }: { severity: keyof typeof GRAVITES }) {
  const def = GRAVITES[severity]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def.libelle}
    </Pastille>
  )
}

export const ETATS_PV = {
  emis: { ton: "warning", icone: Clock, libelle: "À encaisser" },
  conteste: { ton: "info", icone: Flag, libelle: "Contesté" },
  paye: { ton: "success", icone: CircleCheck, libelle: "Soldé" },
  annule: { ton: "neutral", icone: Ban, libelle: "Annulé" },
} as const satisfies Record<string, { ton: Ton; icone: LucideIcon; libelle: string }>

export function TagPv({ status }: { status: keyof typeof ETATS_PV }) {
  const def = ETATS_PV[status]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def.libelle}
    </Pastille>
  )
}

export const ETATS_COMPTE = {
  actif: { ton: "success", icone: CircleCheck, libelle: "Actif" },
  invite: { ton: "warning", icone: CircleDashed, libelle: "Invité" },
  suspendu: { ton: "danger", icone: Ban, libelle: "Suspendu" },
} as const satisfies Record<string, { ton: Ton; icone: LucideIcon; libelle: string }>

export function TagCompte({ etat }: { etat: keyof typeof ETATS_COMPTE }) {
  const def = ETATS_COMPTE[etat]
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def.libelle}
    </Pastille>
  )
}

export function TagBlocage({ actif }: { actif: boolean }) {
  return actif ? (
    <Pastille ton="warning" icone={Lock}>
      Bloquée
    </Pastille>
  ) : (
    <Pastille ton="neutral" icone={LockOpen}>
      Libérée
    </Pastille>
  )
}

export const ETATS_DESSERTE = {
  planifie: { ton: "neutral", libelle: "Planifiée" },
  a_lheure: { ton: "success", libelle: "À l'heure" },
  retarde: { ton: "warning", libelle: "Retardée" },
  annule: { ton: "danger", libelle: "Supprimée" },
  termine: { ton: "neutral", libelle: "Terminée" },
} as const satisfies Record<string, { ton: Ton; libelle: string }>

export function TagDesserte({ status, retard }: { status: keyof typeof ETATS_DESSERTE; retard?: number }) {
  const def = ETATS_DESSERTE[status]
  return (
    <Pastille ton={def.ton}>
      {status === "retarde" && retard ? `+${retard} min` : def.libelle}
    </Pastille>
  )
}
