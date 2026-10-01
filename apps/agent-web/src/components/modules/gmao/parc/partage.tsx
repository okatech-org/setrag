"use client"

import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { EvenementChronologie } from "@/components/charte"
import { heure, jourMois } from "@/components/gestion/referentiels/format"

/** Événement du journal GMAO tel que le renvoient les requêtes de dossier. */
export interface EvenementGmao {
  id: string
  libelle: string
  detail: string | null
  auteur: string | null
  le: number
}

/** Journal d'un dossier → chronologie de la charte (jour, puis heure et auteur en détail). */
export function evenementsGmao(evenements: readonly EvenementGmao[]): EvenementChronologie[] {
  return evenements.map((evenement) => ({
    cle: evenement.id,
    heure: jourMois(evenement.le),
    titre: evenement.libelle,
    detail: [heure(evenement.le), evenement.auteur, evenement.detail].filter(Boolean).join(" · "),
  }))
}

/**
 * Lien dans une cellule de tableau cliquable : il mène à son propre dossier
 * sans déclencher l'ouverture de la ligne.
 */
export function LienCellule({ href, children, mono }: { href: string; children: ReactNode; mono?: boolean }) {
  return (
    <Link
      href={href as Route}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn("inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-2 hover:underline", mono && "tabular")}
    >
      {children}
    </Link>
  )
}
