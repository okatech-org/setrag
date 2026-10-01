"use client"

import { ChevronRight, Handshake, LayoutGrid, Search, UsersRound, X } from "lucide-react"
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react"

import type { ModuleCode } from "@workspace/backend/modules"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { ICONES_MODULES } from "@/coquille/navigation"

export type DemoActorType = "interne" | "externe"
export type DemoActorFilter = "all" | DemoActorType

export interface DemoAccount {
  key: string
  label: string
  description: string
  email: string
  password: string
  /** Les champs suivants restent optionnels pour les trois comptes historiques. */
  actorType?: DemoActorType
  group?: string
  groupLabel?: string
  role?: string
  landingPath?: string
  moduleCodes?: readonly string[]
}

const MODULE_LABELS: Readonly<Record<string, string>> = {
  voyageurs: "Billetterie & voyageurs",
  fret: "Fret & logistique",
  cotraf: "Régulation & trafic (COTRAF)",
  gmao: "Matériel & GMAO",
  infrastructure: "Infrastructures & travaux",
  finance: "Finances & comptabilité",
  rh: "Ressources humaines",
  ged: "Bureautique & GED",
  securite: "Sécurité & sûreté",
  copilot: "SETRAG Copilot",
}

const FILTERS: readonly {
  value: DemoActorFilter
  label: string
}[] = [
  { value: "all", label: "Tous" },
  { value: "interne", label: "Personnel SETRAG" },
  { value: "externe", label: "Parties prenantes" },
]

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim()
}

/** Deux initiales du libellé du poste : « Chef de gare » → « CG ». */
function initialesProfil(libelle: string) {
  const mots = libelle
    .replace(/[—–(),&·/]/g, " ")
    .split(/\s+/)
    .filter((mot) => mot.length > 2 || /^[A-Z]/.test(mot))
  return (mots.slice(0, 2).map((mot) => mot[0]).join("") || "SE").toUpperCase()
}

function accountActorType(account: DemoAccount): DemoActorType {
  return account.actorType === "externe" ? "externe" : "interne"
}

export function moduleLabelForCode(code: string) {
  const knownLabel = MODULE_LABELS[code]
  if (knownLabel) return knownLabel

  const words = code.replaceAll(/[-_]/g, " ").trim()
  return words ? words.charAt(0).toLocaleUpperCase("fr") + words.slice(1) : code
}

export function filterDemoAccounts(
  accounts: readonly DemoAccount[],
  query: string,
  actorFilter: DemoActorFilter
) {
  const needle = normalized(query)

  return accounts.filter((account) => {
    if (actorFilter !== "all" && accountActorType(account) !== actorFilter) {
      return false
    }

    if (!needle) return true

    const searchable = [
      account.label,
      account.description,
      account.group,
      account.groupLabel,
      account.role,
      ...(account.moduleCodes ?? []).flatMap((code) => [
        code,
        moduleLabelForCode(code),
      ]),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")

    return normalized(searchable).includes(needle)
  })
}

export function groupDemoAccounts(accounts: readonly DemoAccount[]) {
  const groups = new Map<string, DemoAccount[]>()

  for (const account of accounts) {
    const groupLabel =
      account.groupLabel?.trim() || account.group?.trim() || "Accès SETRAG"
    const current = groups.get(groupLabel) ?? []
    current.push(account)
    groups.set(groupLabel, current)
  }

  return Array.from(groups, ([label, groupedAccounts]) => ({
    label,
    accounts: groupedAccounts,
  }))
}

interface DemoAccountPickerProps {
  accounts: readonly DemoAccount[]
  pendingAccountKey?: string
  onSelect: (account: DemoAccount) => void | Promise<void>
}

export function DemoAccountPicker({
  accounts,
  pendingAccountKey = "",
  onSelect,
}: DemoAccountPickerProps) {
  const groupHeadingPrefix = useId()
  const accountsRegionRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [actorFilter, setActorFilter] = useState<DemoActorFilter>("all")

  const counts = useMemo(
    () => ({
      all: accounts.length,
      interne: accounts.filter(
        (account) => accountActorType(account) === "interne"
      ).length,
      externe: accounts.filter(
        (account) => accountActorType(account) === "externe"
      ).length,
    }),
    [accounts]
  )
  const visibleAccounts = useMemo(
    () => filterDemoAccounts(accounts, query, actorFilter),
    [accounts, query, actorFilter]
  )
  const groupedAccounts = useMemo(
    () => groupDemoAccounts(visibleAccounts),
    [visibleAccounts]
  )

  if (accounts.length === 0) return null

  function focusFirstAccount(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowDown") return

    const firstAccount = Array.from(
      accountsRegionRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-demo-account]"
      ) ?? []
    ).find((button) => !button.disabled)
    if (!firstAccount) return

    event.preventDefault()
    firstAccount.focus()
  }

  function navigateAccounts(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    if (!(event.target instanceof HTMLElement)) return

    const current = event.target.closest<HTMLButtonElement>(
      "[data-demo-account]"
    )
    if (!current) return

    const availableAccounts = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-demo-account]"
      )
    ).filter((button) => !button.disabled)
    const currentIndex = availableAccounts.indexOf(current)
    if (currentIndex < 0 || availableAccounts.length === 0) return

    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? availableAccounts.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % availableAccounts.length
            : (currentIndex - 1 + availableAccounts.length) %
              availableAccounts.length

    event.preventDefault()
    availableAccounts[nextIndex]?.focus()
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="lg" variant="secondary" className="shadow-[var(--sh-lg)]">
            <UsersRound />
            Comptes démo
          </Button>
        </DialogTrigger>

        <DialogContent
          className="h-dvh max-h-dvh max-w-none grid-rows-[auto_auto_1fr] gap-0 overflow-hidden rounded-none p-0 sm:h-[min(92dvh,56rem)] sm:max-h-[56rem] sm:max-w-4xl sm:rounded-lg"
          showCloseButton={false}
        >
          <DialogHeader className="gap-1 border-b border-line px-5 py-5 pr-16 sm:px-7 sm:pr-20">
            <span className="text-[12px] font-medium tracking-[0.08em] text-accent-ink uppercase">
              Accès rapide
            </span>
            <DialogTitle className="text-[26px] leading-tight font-bold tracking-[-0.01em]">
              Comptes de démonstration
            </DialogTitle>
            <DialogDescription className="text-small max-w-2xl text-ink-muted">
              Choisissez un poste, une fonction ou une partie prenante : vous
              entrez dans son espace, avec les modules auxquels il a accès.
            </DialogDescription>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 sm:top-4 sm:right-4"
                aria-label="Fermer les comptes de démonstration"
              >
                <X />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="grid gap-3 border-b border-line bg-surface px-5 py-4 sm:px-7">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[15px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
              <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="sr-only">Rechercher un compte de démonstration</span>
              <input
                id="demo-account-search"
                type="search"
                autoFocus
                aria-keyshortcuts="ArrowDown"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={focusFirstAccount}
                placeholder="Rechercher un poste, une direction ou un module…"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint focus-visible:shadow-none"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <div
                className="inline-flex gap-1 rounded-pill bg-surface-sunk p-1"
                role="group"
                aria-label="Filtrer les comptes par type d’acteur"
              >
                {FILTERS.map((filter) => {
                  const actif = actorFilter === filter.value
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={actif}
                      aria-label={`${filter.label} (${counts[filter.value]})`}
                      onClick={() => setActorFilter(filter.value)}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13.5px] font-semibold transition-colors",
                        actif ? "bg-surface text-ink shadow-[var(--sh-sm)]" : "text-ink-muted hover:text-ink"
                      )}
                    >
                      {filter.label}
                      <span className="tabular text-[12px] text-ink-faint">{counts[filter.value]}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[12.5px] text-ink-muted" aria-live="polite" aria-atomic="true">
                {visibleAccounts.length} profil
                {visibleAccounts.length === 1 ? "" : "s"} affiché
                {visibleAccounts.length === 1 ? "" : "s"} · flèches haut et bas pour parcourir
              </p>
            </div>
          </div>

          {/* Pas de marge en haut de la zone qui défile : l'en-tête de groupe
              collant reste plaqué contre le bord, rien ne passe au-dessus. */}
          <div
            ref={accountsRegionRef}
            role="region"
            aria-label="Profils de démonstration"
            className="min-h-0 overflow-y-auto overscroll-contain bg-canvas px-5 pb-6 sm:px-7"
            onKeyDown={navigateAccounts}
          >
            {groupedAccounts.length === 0 ? (
              <div role="status" className="mt-6 rounded-md border border-line bg-surface">
                <EmptyState
                  title="Aucun profil trouvé"
                  description="Modifiez votre recherche ou choisissez un autre type d’acteur."
                />
              </div>
            ) : (
              groupedAccounts.map((group, groupIndex) => (
                <section key={group.label} aria-labelledby={`${groupHeadingPrefix}-${groupIndex}`}>
                  <div className="sticky top-0 z-10 -mx-5 flex items-center gap-2 border-b border-line bg-canvas px-5 pt-5 pb-2 sm:-mx-7 sm:px-7">
                    <h3
                      id={`${groupHeadingPrefix}-${groupIndex}`}
                      className="text-[12px] font-semibold tracking-[0.07em] text-ink-muted uppercase"
                    >
                      {group.label}
                    </h3>
                    <span className="tabular text-[12px] text-ink-faint">{group.accounts.length}</span>
                  </div>

                  <div className="grid gap-2 pt-3 lg:grid-cols-2">
                    {group.accounts.map((account) => {
                      const actorType = accountActorType(account)
                      const isPending = pendingAccountKey === account.key
                      const modules = account.moduleCodes ?? []
                      return (
                        <button
                          key={account.key}
                          type="button"
                          data-demo-account={account.key}
                          aria-label={`Se connecter avec ${account.label}`}
                          aria-keyshortcuts="ArrowUp ArrowDown Home End"
                          disabled={Boolean(pendingAccountKey && !isPending)}
                          aria-busy={isPending || undefined}
                          onClick={() => void onSelect(account)}
                          className={cn(
                            "group relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-md border border-line bg-surface p-3.5 text-left transition-colors",
                            "hover:border-accent-line hover:bg-accent-soft/40 disabled:opacity-45",
                            isPending && "st-en-cours border-accent-line"
                          )}
                        >
                          <span
                            aria-hidden
                            className="grid size-10 place-items-center rounded-full bg-second-soft text-[13px] font-bold text-second-ink"
                          >
                            {initialesProfil(account.label)}
                          </span>
                          <span className="grid min-w-0 gap-1">
                            <span className="text-[15px] leading-snug font-semibold text-ink">{account.label}</span>
                            <span className="text-[13px] leading-snug text-ink-muted">{account.description}</span>
                            {modules.length > 0 ? (
                              <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                                {modules.map((code) => {
                                  const Icone = ICONES_MODULES[code as ModuleCode] ?? LayoutGrid
                                  return (
                                    <span key={code} className="inline-flex items-center gap-1">
                                      <Icone aria-hidden className="size-3.5 text-ink-faint" />
                                      {moduleLabelForCode(code)}
                                    </span>
                                  )
                                })}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-1 self-center text-ink-faint">
                            {actorType === "externe" ? (
                              <Tag tone="warning">
                                <Handshake />
                                Partie prenante
                              </Tag>
                            ) : null}
                            <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                          </span>
                          {isPending ? <span className="sr-only">Connexion…</span> : null}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
