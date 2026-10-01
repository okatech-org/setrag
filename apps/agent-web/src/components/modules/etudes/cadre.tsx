"use client"

import { Library, ListChecks } from "lucide-react"
import type { ReactNode } from "react"

import { EnterpriseShell } from "@/components/enterprise-layout"
import { NavigationEspace, type RubriqueEspace } from "@/components/modules/ged/cadre"

export const ESPACE_ETUDES = "Audit et documents"

export const RUBRIQUES_ETUDES: readonly RubriqueEspace[] = [
  { href: "/etudes", libelle: "Bibliothèque", icone: Library, exact: true },
  { href: "/etudes/plan-actions", libelle: "Plan d'actions d'audit", icone: ListChecks },
]

/** Cadre de l'espace transverse « Audit et documents ». */
export function CadreEtudes({
  titre,
  description,
  actions,
  eyebrow,
  children,
}: {
  titre: string
  description?: string
  actions?: ReactNode
  eyebrow?: ReactNode
  children: ReactNode
}) {
  return (
    <EnterpriseShell
      title={titre}
      subtitle={description}
      space={ESPACE_ETUDES}
      scope="Études, recette et audit · SETRAG"
      actions={actions}
      eyebrow={eyebrow}
      navigation={({ onNavigate }) => (
        <NavigationEspace libelle={ESPACE_ETUDES} rubriques={RUBRIQUES_ETUDES} onNavigate={onNavigate} />
      )}
    >
      {children}
    </EnterpriseShell>
  )
}
