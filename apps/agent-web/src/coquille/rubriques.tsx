"use client"

import type { LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavRubanVertical } from "@workspace/ui/components/indicateur"
import { cn } from "@workspace/ui/lib/utils"

import { chemineVers } from "./navigation"

export interface Rubrique {
  href: string
  libelle: string
  icone: LucideIcon
  /** Rubrique exacte (accueil d'un espace) plutôt que préfixe. */
  exacte?: boolean
  /** État courant imposé, quand la règle de chemin ne suffit pas. */
  actif?: boolean
  /** Compteur d'éléments en attente, écrit en chiffres. */
  compte?: number
}

/**
 * Rubriques d'un module ou d'un espace transverse, en tête du menu latéral :
 * même apparence et même ruban qui glisse que le menu du portail. Tous les
 * modules passent par ici, pour qu'aucun ne garde un menu à part.
 */
export function MenuRubriques({
  titre,
  rubriques,
  onNavigate,
}: {
  titre: string
  rubriques: readonly Rubrique[]
  onNavigate?: () => void
}) {
  const chemin = usePathname()
  // La rubrique la plus spécifique l'emporte : « /rh/paie » plutôt que « /rh ».
  const courante =
    rubriques.find((rubrique) => rubrique.actif) ??
    [...rubriques]
      .filter((rubrique) => rubrique.actif === undefined)
      .filter((rubrique) => (rubrique.exacte ? chemin === rubrique.href : chemineVers(rubrique.href, chemin)))
      .sort((a, b) => b.href.length - a.href.length)[0]

  return (
    <NavRubanVertical actif={courante?.href ?? null} aria-label={titre} className="grid gap-0.5">
      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.07em] text-ink-faint uppercase">{titre}</p>
      {rubriques.map((rubrique) => {
        const actif = rubrique === courante
        const Icone = rubrique.icone
        return (
          <Link
            key={rubrique.href}
            href={rubrique.href as Route}
            data-actif={actif}
            aria-current={actif ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-sm pr-2.5 pl-3.5 text-[14px] transition-colors duration-[var(--dur-fast)]",
              actif ? "bg-accent-soft font-bold text-ink" : "font-medium text-ink-muted hover:bg-surface-sunk hover:text-ink"
            )}
          >
            <Icone aria-hidden className={cn("size-[18px] shrink-0", actif && "text-accent-ink")} />
            <span className="min-w-0 flex-1 truncate">{rubrique.libelle}</span>
            {rubrique.compte ? (
              <span className="tabular grid h-5 min-w-[22px] place-items-center rounded-pill bg-warning-soft px-1.5 text-[11.5px] font-semibold text-warning-ink">
                {rubrique.compte}
              </span>
            ) : null}
          </Link>
        )
      })}
    </NavRubanVertical>
  )
}
