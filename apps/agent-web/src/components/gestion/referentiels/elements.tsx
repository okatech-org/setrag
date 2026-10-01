"use client"

import { type LucideIcon } from "lucide-react"
import { useCallback, useId, useRef, useState, type ReactNode } from "react"

import { IndicateurRuban, useIndicateur } from "@workspace/ui/components/indicateur"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

import { Chronologie } from "@/components/charte"

import { messageErreur } from "./format"
import { evenementsHistorique, type EntreeHistorique } from "./libelles-audit"

/* ================================================================ Onglets */

export interface Onglet<K extends string> {
  cle: K
  libelle: ReactNode
  compte?: number
}

/**
 * Onglets du portail : le ruban glisse sous l'onglet courant. Le panneau
 * associé est rendu par l'appelant avec `panneauOnglet(cle)`.
 */
export function Onglets<K extends string>({
  onglets,
  valeur,
  onChange,
  libelle,
  className,
}: {
  onglets: readonly Onglet<K>[]
  valeur: K
  onChange: (cle: K) => void
  libelle: string
  className?: string
}) {
  const { ref, position, anime } = useIndicateur<HTMLDivElement>(valeur)
  const base = useId()
  const boutons = useRef<(HTMLButtonElement | null)[]>([])
  const clavier = (event: React.KeyboardEvent, index: number) => {
    const suivant = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null
    if (suivant === null) return
    event.preventDefault()
    const cible = (suivant + onglets.length) % onglets.length
    onChange(onglets[cible]!.cle)
    boutons.current[cible]?.focus()
  }
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={libelle}
      className={cn("relative flex max-w-full gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] print:hidden", className)}
    >
      {onglets.map((onglet, index) => {
        const actif = onglet.cle === valeur
        return (
          <button
            key={onglet.cle}
            ref={(element) => {
              boutons.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${base}-${onglet.cle}`}
            aria-selected={actif}
            aria-controls={`${base}-${onglet.cle}-panneau`}
            tabIndex={actif ? 0 : -1}
            data-actif={actif}
            onClick={() => onChange(onglet.cle)}
            onKeyDown={(event) => clavier(event, index)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-[14.5px] font-semibold whitespace-nowrap transition-colors",
              actif ? "text-ink" : "text-ink-muted hover:text-ink"
            )}
          >
            {onglet.libelle}
            {onglet.compte !== undefined ? (
              <span className="tabular-nums rounded-pill bg-surface-sunk px-2 py-0.5 text-[12px] text-ink-muted">{onglet.compte}</span>
            ) : null}
          </button>
        )
      })}
      <IndicateurRuban position={position} anime={anime} className="bottom-0" />
    </div>
  )
}

/* ================================================================ Filtres */

/** Liste déroulante compacte d'une barre de filtres (44 px, icône, libellé lu). */
export function SelectFiltre({
  libelle,
  icone: Icone,
  value,
  onChange,
  children,
  className,
}: {
  libelle: string
  icone?: LucideIcon
  value: string
  onChange: (valeur: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-line-strong bg-surface pr-8 pl-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]",
        className
      )}
    >
      {Icone ? <Icone aria-hidden className="size-4 shrink-0 text-ink-muted" /> : null}
      <span className="sr-only">{libelle}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent py-2 outline-none"
      >
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 text-ink-muted">
        ▾
      </span>
    </label>
  )
}

export function DateFiltre({
  libelle,
  icone: Icone,
  value,
  onChange,
  className,
}: {
  libelle: string
  icone?: LucideIcon
  value: string
  onChange: (valeur: string) => void
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]",
        className
      )}
    >
      {Icone ? <Icone aria-hidden className="size-4 shrink-0 text-ink-muted" /> : null}
      <span className="sr-only">{libelle}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tabular min-w-0 flex-1 bg-transparent py-2 text-[14px] outline-none"
      />
    </label>
  )
}

/** Puces de filtre exclusives (famille d'actions, classe) : état écrit par `aria-pressed`. */
export function Puces<K extends string>({
  options,
  valeur,
  onChange,
  libelle,
}: {
  options: readonly { cle: K; libelle: string }[]
  valeur: K
  onChange: (cle: K) => void
  libelle: string
}) {
  return (
    <div role="group" aria-label={libelle} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const actif = option.cle === valeur
        return (
          <button
            key={option.cle}
            type="button"
            aria-pressed={actif}
            onClick={() => onChange(option.cle)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-pill border px-3.5 text-[13.5px] font-semibold transition-colors",
              actif ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-sunk"
            )}
          >
            {actif ? <span aria-hidden className="mr-1.5">✓</span> : null}
            {option.libelle}
          </button>
        )
      })}
    </div>
  )
}

/* ============================================================ Opérations */

/**
 * Exécute une action serveur en gardant son état : clé en cours, message de
 * réussite ou d'erreur. Le message d'erreur est celui du serveur, épuré.
 */
export function useOperation() {
  const [enCours, setEnCours] = useState<string | null>(null)
  const [retour, setRetour] = useState<{ ton: "success" | "danger"; titre: string; detail?: string } | null>(null)

  const executer = useCallback(
    async <R,>(cle: string, action: () => Promise<R>, succes?: string | ((resultat: R) => string)): Promise<R | undefined> => {
      setEnCours(cle)
      setRetour(null)
      try {
        const resultat = await action()
        if (succes) {
          setRetour({ ton: "success", titre: typeof succes === "function" ? succes(resultat) : succes })
        }
        return resultat
      } catch (cause) {
        setRetour({ ton: "danger", titre: "Action refusée", detail: messageErreur(cause) })
        return undefined
      } finally {
        setEnCours(null)
      }
    },
    []
  )

  return { enCours, retour, executer, effacer: () => setRetour(null), signaler: setRetour }
}

export function RetourOperation({ retour }: { retour: ReturnType<typeof useOperation>["retour"] }) {
  if (!retour) return null
  return (
    <InlineMessage tone={retour.ton} title={retour.titre}>
      {retour.detail}
    </InlineMessage>
  )
}

/* ============================================================= Historique */

export function Historique({ historique, vide }: { historique: readonly EntreeHistorique[]; vide?: ReactNode }) {
  return <Chronologie evenements={evenementsHistorique(historique)} vide={vide ?? "Aucune action tracée sur ce dossier."} />
}

/* ============================================================= Remplissage */

/** Une barre de remplissage, toujours avec son chiffre (jamais la voie seule). */
export function Remplissage({ libelle, detail, part, valeur }: { libelle: ReactNode; detail?: ReactNode; part: number; valeur?: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-x-3 gap-y-1.5 text-[13.5px] sm:grid-cols-[170px_minmax(0,1fr)_56px]">
      <span className="min-w-0">
        <span className="font-semibold">{libelle}</span>
        {detail ? <small className="block text-[12px] text-ink-muted">{detail}</small> : null}
      </span>
      <Voie rempli={Math.max(0, Math.min(1, part))} className="order-last col-span-2 sm:order-none sm:col-span-1" />
      <b className="tabular text-right text-[14px]">{valeur ?? `${Math.round(part * 100)} %`}</b>
    </li>
  )
}

/** Petit encart d'explication dans un panneau (maquette `.option`). */
export function Encart({ icone: Icone, titre, children, action, ton = "neutre" }: { icone: LucideIcon; titre: ReactNode; children?: ReactNode; action?: ReactNode; ton?: "neutre" | "vigilance" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-md border px-4 py-3 text-[14px]",
        ton === "vigilance" ? "border-warning/40 bg-warning-soft" : "border-line bg-surface-sunk"
      )}
    >
      <Icone aria-hidden className={cn("mt-0.5 size-[18px] shrink-0", ton === "vigilance" ? "text-warning-ink" : "text-ink-muted")} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-semibold">{titre}</b>
        {children ? <small className="text-[13px] text-ink-muted">{children}</small> : null}
      </span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  )
}
