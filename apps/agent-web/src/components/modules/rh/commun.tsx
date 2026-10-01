"use client"

import type { GenericId } from "convex/values"
import { ArrowLeft, type LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag, type TagProps } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { BandeauLectureSeule, EnTetePage, type EvenementChronologie } from "@/components/charte"
import { heure, jourMois } from "@/components/gestion/referentiels/format"
import { usePortalSession } from "@/components/portal-guard"
import { CoquilleAgent } from "@/coquille/coquille-agent"
import { formatXaf } from "@/lib/format"
import { MenuRubriques } from "@/coquille/rubriques"
import { EcranAttente } from "@/coquille/ecran-attente"

/** Identifiant Convex typé, sans dépendre d'un chemin non exporté du backend. */
export type Id<Table extends string> = GenericId<Table>

/* ═════════════════════════ Cadre d'un module ════════════════════════════ */

export interface RubriqueModule {
  href: string
  libelle: string
  icone: LucideIcon
  /** Rubrique exacte (accueil du module) plutôt que préfixe. */
  exacte?: boolean
}

/** Rubriques du module, en tête du menu latéral du portail. */
export function NavigationModule({
  titre,
  rubriques,
  onNavigate,
}: {
  titre: string
  rubriques: readonly RubriqueModule[]
  onNavigate?: () => void
}) {
  return <MenuRubriques titre={titre} rubriques={rubriques} onNavigate={onNavigate} />
}

/**
 * Cadre d'une page de module : coquille du portail, rubriques du module dans
 * le menu, en-tête (un seul bouton `primary` dans `actions`), mention de
 * lecture seule. Les actions ne sont jamais désactivées en bloc : chaque
 * écran n'affiche que celles que le serveur autorise, et garde les
 * recherches, onglets, exports et impressions utilisables en lecture.
 */
export function CadreModule({
  espace,
  perimetre,
  rubriques,
  titre,
  description,
  actions,
  retour,
  lectureSeule,
  children,
}: {
  espace: string
  perimetre: string
  rubriques: readonly RubriqueModule[]
  titre: ReactNode
  description?: ReactNode
  actions?: ReactNode
  retour?: { href: string; libelle: string }
  lectureSeule?: ReactNode
  children: ReactNode
}) {
  const session = usePortalSession()
  if (!session?.profile.user) {
    return (
      <EcranAttente>Vérification de la session…</EcranAttente>
    )
  }
  return (
    <CoquilleAgent
      perimetre={perimetre}
      titre={typeof titre === "string" ? titre : undefined}
      rubriques={({ onNavigate }) => <NavigationModule titre={espace} rubriques={rubriques} onNavigate={onNavigate} />}
    >
      <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-5">
        <EnTetePage surtitre={espace} titre={titre} description={description} actions={actions} retour={retour} />
        {lectureSeule ? <BandeauLectureSeule>{lectureSeule}</BandeauLectureSeule> : null}
        {children}
      </div>
    </CoquilleAgent>
  )
}

/* ═════════════════════════ États d'un écran ═════════════════════════════ */

export function Chargement({ libelle = "Chargement…" }: { libelle?: string }) {
  return (
    <div role="status" aria-label={libelle} className="grid gap-3">
      <SkeletonLines />
      <SkeletonLines />
    </div>
  )
}

export function Introuvable({ titre, retour }: { titre: string; retour: { href: string; libelle: string } }) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        title={titre}
        description="Le dossier a pu être supprimé, ou le lien est erroné."
        action={
          <Link href={retour.href as Route} className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink hover:underline">
            <ArrowLeft aria-hidden className="size-4" />
            {retour.libelle}
          </Link>
        }
      />
    </div>
  )
}

export function AccesRestreint({ children }: { children: ReactNode }) {
  return (
    <InlineMessage tone="info" title="Accès restreint">
      {children}
    </InlineMessage>
  )
}

/* ════════════════════════════ Pastilles ═════════════════════════════════ */

export type Ton = NonNullable<TagProps["tone"]>

/** Pastille d'état : le mot porte l'information, la teinte la renforce. */
export function Statut<K extends string>({
  valeur,
  libelles,
  tons,
  icone: Icone,
}: {
  valeur: K
  libelles: Readonly<Record<K, string>>
  tons: Readonly<Partial<Record<K, Ton>>>
  icone?: LucideIcon
}) {
  return (
    <Tag tone={tons[valeur] ?? "neutral"}>
      {Icone ? <Icone aria-hidden /> : null}
      {libelles[valeur]}
    </Tag>
  )
}

/* ════════════════════════════ Formats ═══════════════════════════════════ */

/** « 2026-10-01 » → « 01/10/2026 ». */
export function dateIso(valeur: string | null | undefined) {
  if (!valeur) return "—"
  const [annee, mois, jour] = valeur.split("-")
  return `${jour}/${mois}/${annee}`
}

/** Montant en XAF, ou tiret. */
export function xaf(valeur: number | null | undefined) {
  return valeur === null || valeur === undefined ? "—" : formatXaf(valeur)
}

export function Montant({ valeur, className }: { valeur: number | null | undefined; className?: string }) {
  return <span className={cn("tabular whitespace-nowrap", className)}>{xaf(valeur)}</span>
}

/** Aujourd'hui à Libreville, « AAAA-MM-JJ ». */
export function aujourdhui(decalageJours = 0) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(Date.now() + decalageJours * 86_400_000)
}

export function ajouterJoursIso(date: string, jours: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10)
}

/** Champ date + heure de Libreville → horodatage. */
export function instantLibreville(date: string, heureMinute: string) {
  return Date.parse(`${date}T${heureMinute}:00+01:00`)
}

/** Horodatage → « HH:MM » à Libreville. */
export function champHeure(instant: number) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Libreville" }).format(instant)
}

/** Horodatage → « AAAA-MM-JJ » à Libreville. */
export function champDateIso(instant: number) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(instant)
}

export interface EntreeJournal {
  _id: string
  libelle: string
  detail?: string
  acteurNom: string
  at: number
}

/** Journal d'un dossier → chronologie de la charte. */
export function chronologie(entrees: readonly EntreeJournal[]): EvenementChronologie[] {
  return entrees.map((entree) => ({
    cle: entree._id,
    heure: jourMois(entree.at),
    titre: entree.libelle,
    detail: `${heure(entree.at)} · ${entree.acteurNom}${entree.detail ? ` — ${entree.detail}` : ""}`,
  }))
}

/** Lien textuel vers un dossier (cellule de tableau, fiche). */
export function LienDossier({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route} className="font-semibold text-accent-ink hover:underline">
      {children}
    </Link>
  )
}

/** Petit tableau de lecture (bulletin, état des charges) : en-têtes et lignes. */
export function TableSimple({
  libelle,
  colonnes,
  lignes,
  pied,
  className,
}: {
  libelle: string
  colonnes: readonly { libelle: string; numerique?: boolean }[]
  lignes: readonly (readonly ReactNode[])[]
  pied?: readonly ReactNode[]
  className?: string
}) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-line bg-surface", className)}>
      <table className="w-full border-collapse text-[14px]" aria-label={libelle}>
        <thead>
          <tr>
            {colonnes.map((colonne) => (
              <th
                key={colonne.libelle}
                scope="col"
                className={cn(
                  "bg-surface-sunk px-3 py-2 text-left text-[11.5px] font-semibold tracking-[0.05em] whitespace-nowrap text-ink-muted uppercase",
                  colonne.numerique && "text-right"
                )}
              >
                {colonne.libelle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, index) => (
            <tr key={index} className="border-t border-line">
              {ligne.map((cellule, i) => (
                <td key={i} className={cn("px-3 py-2 align-top", colonnes[i]?.numerique && "text-right whitespace-nowrap tabular-nums")}>
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pied ? (
          <tfoot className="border-t-2 border-line-strong bg-surface-sunk font-bold">
            <tr>
              {pied.map((cellule, i) => (
                <td key={i} className={cn("px-3 py-2", colonnes[i]?.numerique && "text-right whitespace-nowrap tabular-nums")}>
                  {cellule}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

/** Liste prioritaire de l'accueil : une ligne cliquable par dossier. */
export function ListePrioritaire({
  elements,
  vide,
}: {
  elements: readonly { cle: string; href: string; titre: ReactNode; detail?: ReactNode; etat?: ReactNode }[]
  vide: string
}) {
  if (elements.length === 0) return <p className="text-small text-ink-muted">{vide}</p>
  return (
    <ul className="grid divide-y divide-line">
      {elements.map((element) => (
        <li key={element.cle}>
          <Link
            href={element.href as Route}
            className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-surface-sunk focus-visible:bg-surface-sunk"
          >
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-[14px] font-semibold">{element.titre}</span>
              {element.detail ? <small className="text-[12.5px] text-ink-muted">{element.detail}</small> : null}
            </span>
            {element.etat}
          </Link>
        </li>
      ))}
    </ul>
  )
}
