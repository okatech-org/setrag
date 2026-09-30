import { ArrowRightIcon, ChevronDownIcon, CircleDashedIcon } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { Sommaire, type EntreeSommaire } from "./sommaire"

/**
 * Briques des pages d'information (tarifs, bagages, aide, conditions).
 *
 * Des pages de lecture : une colonne de texte de 72 caractères au plus, des
 * sections numérotées que le sommaire suit, et partout la même règle — un
 * fait, puis ce qu'il change pour le voyageur.
 */

/** Conteneur d'une page d'information, avec ou sans sommaire. */
export function PageInfo({
  entete,
  sommaire,
  children,
}: {
  entete: ReactNode
  sommaire?: EntreeSommaire[]
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 md:px-8">
      {entete}
      {sommaire ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <Sommaire entrees={sommaire} />
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}
    </div>
  )
}

export function EnTeteInfo({
  surtitre,
  titre,
  intro,
  actions,
}: {
  surtitre: string
  titre: ReactNode
  intro?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="grid gap-4 pt-4 pb-8 md:pt-14 md:pb-12">
      <p className="text-mono-label text-ink-muted">{surtitre}</p>
      <h1 className="text-h2 md:text-display max-w-[24ch]">{titre}</h1>
      {intro && (
        <div className="text-body-lg max-md:text-body grid max-w-[64ch] gap-3 text-ink-muted">
          {intro}
        </div>
      )}
      {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
    </header>
  )
}

/** Section numérotée, ancrée pour le sommaire. */
export function SectionInfo({
  id,
  numero,
  titre,
  intro,
  children,
}: {
  id: string
  numero?: string
  titre: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className="scroll-mt-32 border-t border-line pt-9 pb-3 md:pt-12 lg:scroll-mt-24"
    >
      <h2
        id={`${id}-titre`}
        className="text-h3 md:text-h2 flex items-baseline gap-3"
      >
        {numero && (
          <span className="font-mono text-[14px] font-semibold text-ink-faint">
            {numero}
          </span>
        )}
        {titre}
      </h2>
      {intro && (
        <p className="text-body-lg max-md:text-body mt-3 max-w-[68ch] text-ink-muted">
          {intro}
        </p>
      )}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6">
        {children}
      </div>
    </section>
  )
}

/** Liste de faits : le terme à gauche (au-dessus sur mobile), ce qu'il change à droite. */
export function Faits({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] rounded-md border border-line bg-surface",
        className
      )}
    >
      {children}
    </dl>
  )
}

export function Fait({
  terme,
  children,
}: {
  terme: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5 border-t border-line px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,210px)_minmax(0,1fr)] md:gap-6 md:px-5">
      <dt className="text-[15px] leading-snug font-bold">{terme}</dt>
      <dd className="grid max-w-[72ch] gap-2 text-[15px] leading-relaxed text-ink-muted">
        {children}
      </dd>
    </div>
  )
}

/** Paragraphe de lecture, borné à 72 caractères. */
export function Texte({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        "text-body max-w-[72ch] leading-relaxed text-ink-muted",
        className
      )}
    >
      {children}
    </p>
  )
}

/**
 * Point qui attend une décision de SETRAG. L'icône et le libellé le disent :
 * la teinte ne porte jamais seule l'information.
 */
export function EnAttente({
  children,
  libelle = "Non arrêté par SETRAG",
}: {
  children: ReactNode
  libelle?: string
}) {
  return (
    <div className="grid max-w-[72ch] gap-1.5 rounded-md border border-dashed border-line-strong bg-surface-sunk px-4 py-3.5">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-warning-ink">
        <CircleDashedIcon className="size-3.5" aria-hidden />
        {libelle}
      </span>
      <p className="text-[14.5px] leading-relaxed text-ink">{children}</p>
    </div>
  )
}

/** D'où vient l'information : le document du client, ou le système. */
export function Source({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption max-w-[72ch] text-ink-faint">
      Source : {children}
    </p>
  )
}

/** Lien de suite, cible de 44 px. */
export function LienSuite({
  href,
  children,
}: {
  href: Route
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[15px] font-semibold text-accent-ink hover:underline"
    >
      {children}
      <ArrowRightIcon className="size-4" aria-hidden />
    </Link>
  )
}

/** Accordéon de questions : `<details>` natif, clavier et lecteurs d'écran compris. */
export function Questions({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface">{children}</div>
  )
}

export function Question({
  id,
  question,
  children,
}: {
  id: string
  question: string
  children: ReactNode
}) {
  return (
    <details
      id={id}
      className="group scroll-mt-32 border-t border-line first:border-t-0 lg:scroll-mt-24"
    >
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-md px-4 py-3 text-[15.5px] leading-snug font-semibold md:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{question}</span>
        <ChevronDownIcon
          className="size-5 shrink-0 text-ink-muted transition-transform duration-[var(--dur-base)] ease-setrag group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="grid max-w-[72ch] gap-3 px-4 pb-5 text-[15px] leading-relaxed text-ink-muted md:px-5">
        {children}
      </div>
    </details>
  )
}
