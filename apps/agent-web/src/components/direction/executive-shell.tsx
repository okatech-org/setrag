"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"

import { EnterpriseShell } from "@/components/enterprise-layout"
import { EXECUTIVE_PATH } from "@/lib/portal-access"

import {
  EXECUTIVE_VOLETS,
  adjacentVolets,
  executiveVoletEntry,
  isExecutiveVoletActive,
  type ExecutiveVolet,
} from "./executive-navigation"
import { periodHref, type PeriodPreset } from "./executive-period"
import { MenuRubriques } from "@/coquille/rubriques"

export const EXECUTIVE_SPACE_LABEL = "Direction générale"
export const EXECUTIVE_SCOPE_LABEL = "Réseau entier · Owendo–Franceville"

/**
 * Rubriques de l'espace, dans la barre latérale avant « Mes modules ».
 * Un `<nav>` avec un libellé en paragraphe : la barre latérale porte déjà ses
 * propres titres avant le `h1` de la page.
 */
export function ExecutiveSidebarNavigation({
  preset,
  onNavigate,
}: {
  preset: PeriodPreset
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <MenuRubriques
      titre={EXECUTIVE_SPACE_LABEL}
      rubriques={EXECUTIVE_VOLETS.map((entry) => ({
        href: periodHref(entry.href, preset),
        libelle: entry.label,
        icone: entry.icon,
        actif: isExecutiveVoletActive(entry, pathname),
      }))}
      onNavigate={onNavigate}
    />
  )
}

/**
 * Chrome commun des cinq volets : en-tête unique, barre latérale détachée,
 * lien de retour sur les sous-volets et navigation entre volets voisins.
 */
export function ExecutiveShell({
  volet,
  preset,
  children,
}: {
  volet: ExecutiveVolet
  preset: PeriodPreset
  children: ReactNode
}) {
  const entry = executiveVoletEntry(volet)
  const { previous, next } = adjacentVolets(volet)
  const isOverview = volet === "overview"

  return (
    <EnterpriseShell
      title={entry.label}
      subtitle={entry.question}
      space={EXECUTIVE_SPACE_LABEL}
      scope={EXECUTIVE_SCOPE_LABEL}
      navigation={({ onNavigate }) => (
        <ExecutiveSidebarNavigation preset={preset} onNavigate={onNavigate} />
      )}
      eyebrow={
        isOverview ? undefined : (
          <Button asChild variant="ghost" className="-ml-3">
            <Link href={periodHref(EXECUTIVE_PATH, preset) as Route}>
              <ArrowLeft />
              Vue d’ensemble
            </Link>
          </Button>
        )
      }
    >
      <span className="sr-only">Écran {entry.code}</span>
      {children}
      {isOverview ? null : (
        <nav
          aria-label="Volets voisins"
          className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between"
        >
          {previous ? (
            <Button asChild variant="secondary">
              <Link href={periodHref(previous.href, preset) as Route}>
                <ArrowLeft />
                {previous.label}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button asChild variant="secondary">
              <Link href={periodHref(next.href, preset) as Route}>
                {next.label}
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </nav>
      )}
    </EnterpriseShell>
  )
}
