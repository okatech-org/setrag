"use client"

import { ChevronLeftIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Logo } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { HAUTEUR_ONGLETS } from "./onglets"

/**
 * Les pièces d'un écran du terminal, comme dans l'app voyageur : une barre
 * d'app, un corps, et les actions en bas — au pouce, le bouton principal
 * juste au-dessus des onglets ou de la barre d'accueil. Le haut se lit, le
 * bas s'actionne.
 */

/**
 * Barre d'app : un retour et un titre sur deux lignes (sous-écrans), ou le
 * logo (écrans racines, tournée), ou un grand titre (historique, incident).
 */
export function BarreApp({
  titre,
  sousTitre,
  retour,
  onRetour,
  logo,
  grandTitre,
  actions,
  className,
}: {
  titre?: ReactNode
  sousTitre?: ReactNode
  /** Page de retour. */
  retour?: Route
  /** Retour interne à l'écran (étape précédente, liste). */
  onRetour?: () => void
  /** Écran racine : le logo compact, qui identifie l'application officielle. */
  logo?: boolean
  /** Écran racine sans logo : « Historique », « Incident ». */
  grandTitre?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  const bouton =
    "grid size-11 shrink-0 place-items-center rounded-pill text-accent-ink active:bg-surface-sunk"
  return (
    <header
      className={cn(
        "flex min-h-[52px] items-center gap-1 pr-2",
        logo || grandTitre ? "pl-4" : retour || onRetour ? "pl-1" : "pl-4",
        className
      )}
    >
      {logo && (
        <Logo
          variante="compact"
          title="SETRAG — Contrôle à bord"
          className="h-[30px]"
        />
      )}
      {grandTitre && (
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.01em]">
          {grandTitre}
        </h1>
      )}
      {retour && (
        <Link href={retour} aria-label="Retour" className={bouton}>
          <ChevronLeftIcon className="size-6" aria-hidden />
        </Link>
      )}
      {!retour && onRetour && (
        <button
          type="button"
          onClick={onRetour}
          aria-label="Retour"
          className={bouton}
        >
          <ChevronLeftIcon className="size-6" aria-hidden />
        </button>
      )}
      {titre && (
        <div className="min-w-0 flex-1 py-1">
          <h1 className="truncate text-[16px] leading-tight font-bold">
            {titre}
          </h1>
          {sousTitre && (
            <p className="truncate text-[12.5px] font-medium text-ink-muted">
              {sousTitre}
            </p>
          )}
        </div>
      )}
      {actions && (
        <div className="ml-auto flex items-center gap-0.5">{actions}</div>
      )}
    </header>
  )
}

/** Le corps de l'écran : il pousse les actions en bas quand il est court. */
export function Corps({
  children,
  className,
  serre,
}: {
  children: ReactNode
  className?: string
  /** Formulaires denses (incident, encaissement) : 10 px entre les blocs. */
  serre?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col px-4 pt-1 pb-4",
        serre ? "gap-2.5" : "gap-3",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Les actions, en bas, au pouce. Collées au-dessus des onglets sur un écran
 * racine, au-dessus de la barre d'accueil ailleurs.
 */
export function Bas({
  children,
  avecOnglets,
  className,
}: {
  children: ReactNode
  avecOnglets?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "sticky z-20 grid gap-2 px-4 pt-3",
        avecOnglets
          ? "bg-canvas pb-3"
          : "bottom-0 border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom,0px),16px)]",
        className
      )}
      style={
        avecOnglets
          ? {
              bottom: `calc(${HAUTEUR_ONGLETS}px + env(safe-area-inset-bottom, 0px))`,
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

/** Titre de section en capitales : « Dessertes disponibles », « Voitures ». */
export function TitreSection({
  children,
  fin,
  className,
}: {
  children: ReactNode
  fin?: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        "flex items-baseline justify-between gap-3 text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase",
        className
      )}
    >
      {children}
      {fin && (
        <span className="text-[12px] font-medium tracking-normal normal-case">
          {fin}
        </span>
      )}
    </h2>
  )
}

/** Note de bas de bloc, en gris : d'où vient une donnée, ce qu'elle vaut. */
export function Note({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        "text-[12.5px] leading-[1.45] font-medium text-ink-muted",
        className
      )}
    >
      {children}
    </p>
  )
}
