"use client"

import { ArrowDownRight, ArrowLeft, ArrowUpRight, TriangleAlert, type LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

/* ============================================================ En-tête de page */

export interface EnTetePageProps {
  surtitre?: ReactNode
  titre: ReactNode
  description?: ReactNode
  /** Actions à droite. Un seul bouton `primary` par écran. */
  actions?: ReactNode
  /** Lien de retour vers la liste, au-dessus du titre. */
  retour?: { href: string; libelle: string }
  className?: string
}

export function EnTetePage({ surtitre, titre, description, actions, retour, className }: EnTetePageProps) {
  return (
    <header className={cn("grid gap-3", className)}>
      {retour ? (
        <Link
          href={retour.href as Route}
          className="inline-flex min-h-11 w-fit items-center gap-2 text-[14px] font-semibold text-accent-ink hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {retour.libelle}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-[min(100%,20rem)] flex-1 gap-1">
          {surtitre ? (
            <span className="text-[12px] font-medium tracking-[0.08em] text-accent-ink uppercase">{surtitre}</span>
          ) : null}
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em] text-balance">{titre}</h1>
          {description ? <p className="text-small max-w-[72ch] text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/* ============================================================== Indicateurs */

export interface IndicateurProps {
  libelle: ReactNode
  icone?: LucideIcon
  valeur: ReactNode
  unite?: ReactNode
  /** Évolution : sens (flèche + teinte) et texte, toujours écrit. */
  evolution?: { sens: "hausse" | "baisse" | "vigilance" | "neutre"; texte: ReactNode }
  /** Remplissage 0 → 1, dessiné comme une voie, jamais sans le chiffre. */
  remplissage?: number
  /** Fond encre, chiffres en jaune : ce qui engage la caisse. */
  fort?: boolean
  className?: string
}

export function Indicateur({ libelle, icone: Icone, valeur, unite, evolution, remplissage, fort, className }: IndicateurProps) {
  return (
    <div
      className={cn(
        "grid min-w-0 content-start gap-1.5 rounded-md border p-4",
        fort ? "border-transparent bg-brand-encre text-[oklch(0.97_0.006_257)]" : "border-line bg-surface",
        className
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-[12.5px] font-semibold", fort ? "text-[oklch(0.78_0.016_257)]" : "text-ink-muted")}>
        {Icone ? <Icone aria-hidden className="size-4" /> : null}
        {libelle}
      </span>
      <b className={cn("text-[26px] leading-tight font-bold tabular-nums tracking-[-0.01em]", fort && "text-brand-jaune")}>
        {valeur}
        {unite ? <small className={cn("ml-1 text-[14px] font-medium", fort ? "text-[oklch(0.78_0.016_257)]" : "text-ink-muted")}>{unite}</small> : null}
      </b>
      {remplissage !== undefined ? <Voie rempli={Math.max(0, Math.min(1, remplissage))} fond={fort ? "encre" : "clair"} /> : null}
      {evolution ? (
        <em
          className={cn(
            "flex items-center gap-1 text-[12.5px] font-medium not-italic",
            fort
              ? "text-[oklch(0.78_0.016_257)]"
              : evolution.sens === "hausse"
                ? "text-success-ink"
                : evolution.sens === "baisse"
                  ? "text-danger-ink"
                  : evolution.sens === "vigilance"
                    ? "text-warning-ink"
                    : "text-ink-muted"
          )}
        >
          {evolution.sens === "hausse" ? <ArrowUpRight aria-hidden className="size-3.5" /> : null}
          {evolution.sens === "baisse" ? <ArrowDownRight aria-hidden className="size-3.5" /> : null}
          {evolution.sens === "vigilance" ? <TriangleAlert aria-hidden className="size-3.5" /> : null}
          {evolution.texte}
        </em>
      ) : null}
    </div>
  )
}

export function Indicateurs({ children, colonnes = 4, className }: { children: ReactNode; colonnes?: 2 | 3 | 4 | 5; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        colonnes === 3 && "lg:grid-cols-3",
        colonnes === 4 && "lg:grid-cols-4",
        colonnes === 5 && "lg:grid-cols-3 xl:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  )
}

/* ================================================================ Panneau */

export interface PanneauProps {
  titre?: ReactNode
  icone?: LucideIcon
  sousTitre?: ReactNode
  /** Liens ou boutons à droite de l'en-tête. */
  actions?: ReactNode
  /** Contenu sans marge intérieure (tableaux). */
  plein?: boolean
  pied?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}

export function Panneau({ titre, icone: Icone, sousTitre, actions, plein, pied, children, className, id }: PanneauProps) {
  return (
    <section id={id} className={cn("min-w-0 rounded-md border border-line bg-surface", className)}>
      {titre ? (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3.5">
          <h2 className="flex items-center gap-2 text-[16px] font-bold">
            {Icone ? <Icone aria-hidden className="size-[18px] text-ink-muted" /> : null}
            {titre}
          </h2>
          {sousTitre ? <span className="text-[13px] text-ink-muted">{sousTitre}</span> : null}
          {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {plein ? children : <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">{children}</div>}
      {pied ? (
        <footer className="text-small flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-ink-muted">{pied}</footer>
      ) : null}
    </section>
  )
}

/* =================================================================== Fiche */

/** Paires libellé / valeur d'un dossier. */
export function Fiche({ elements, className }: { elements: readonly (readonly [ReactNode, ReactNode] | false | null | undefined)[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]", className)}>
      {elements.filter(Boolean).map((element, index) => {
        const [libelle, valeur] = element as readonly [ReactNode, ReactNode]
        return (
          <div key={index} className="contents">
            <dt className="text-ink-muted">{libelle}</dt>
            <dd className="min-w-0 text-right font-semibold break-words">{valeur ?? "—"}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/* ============================================================= Chronologie */

export interface EvenementChronologie {
  cle: string
  heure: ReactNode
  titre: ReactNode
  detail?: ReactNode
}

/** Historique d'un dossier : heure, puis ce qui s'est passé, sur une voie verticale. */
export function Chronologie({ evenements, vide = "Aucun événement enregistré." }: { evenements: readonly EvenementChronologie[]; vide?: ReactNode }) {
  if (evenements.length === 0) return <p className="text-small text-ink-muted">{vide}</p>
  return (
    <ol className="grid">
      {evenements.map((evenement, index) => (
        <li key={evenement.cle} className="relative grid grid-cols-[64px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
          <time className="tabular pt-px text-[13px] font-semibold text-ink-muted">{evenement.heure}</time>
          <span
            aria-hidden
            className="absolute top-1.5 left-[74px] size-2.5 rounded-full border-[2.5px] border-accent-base bg-surface"
          />
          {index < evenements.length - 1 ? (
            <span aria-hidden className="absolute top-5 bottom-0.5 left-[78px] w-[1.5px] bg-line-strong" />
          ) : null}
          <div className="grid gap-0.5 pl-7 text-[14px]">
            <b className="font-semibold">{evenement.titre}</b>
            {evenement.detail ? <small className="text-[12.5px] text-ink-muted">{evenement.detail}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ========================================================= Lecture seule */

export function BandeauLectureSeule({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="text-small rounded-md border border-line bg-surface-sunk px-4 py-3 text-ink-muted">
      {children}
    </div>
  )
}

/** Bouton-lien secondaire, pour les actions de navigation dans les en-têtes. */
export function LienBouton({
  href,
  children,
  variante = "secondary",
  taille = "md",
}: {
  href: string
  children: ReactNode
  variante?: "primary" | "secondary" | "ghost"
  taille?: "sm" | "md"
}) {
  return (
    <Button asChild variant={variante} size={taille}>
      <Link href={href as Route}>{children}</Link>
    </Button>
  )
}
