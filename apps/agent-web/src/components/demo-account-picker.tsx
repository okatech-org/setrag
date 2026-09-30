"use client"

import {
  Building2,
  Handshake,
  Layers3,
  Search,
  SearchX,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react"
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
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
import { Input } from "@workspace/ui/components/field"

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
          <Button type="button" size="lg" className="rounded-full shadow-xl">
            <UsersRound />
            Comptes démo
          </Button>
        </DialogTrigger>

        <DialogContent
          className="h-dvh max-h-dvh max-w-none grid-rows-[auto_auto_1fr] gap-0 overflow-hidden rounded-none p-0 sm:h-[min(92dvh,56rem)] sm:max-h-[56rem] sm:max-w-5xl sm:rounded-xl"
          showCloseButton={false}
        >
          <DialogHeader className="border-b border-line px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-20">
            <span className="text-mono-label text-accent-ink">
              ACCÈS RAPIDE
            </span>
            <DialogTitle className="text-h2">
              Comptes de démonstration
            </DialogTitle>
            <DialogDescription className="max-w-3xl text-ink-muted">
              Sélectionnez un poste, une fonction ou une partie prenante, puis
              explorez son espace et les modules SETRAG auxquels ce profil a
              accès.
            </DialogDescription>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 sm:top-6 sm:right-6"
                aria-label="Fermer les comptes de démonstration"
              >
                <X />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="grid gap-4 border-b border-line bg-surface-sunk/50 px-5 py-4 sm:px-7">
            <div className="relative">
              <label className="sr-only" htmlFor="demo-account-search">
                Rechercher un compte de démonstration
              </label>
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-ink-muted"
              />
              <Input
                id="demo-account-search"
                type="search"
                autoFocus
                aria-keyshortcuts="ArrowDown"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={focusFirstAccount}
                placeholder="Rechercher un poste, une direction ou un module…"
                className="bg-surface pl-11"
              />
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Filtrer les comptes par type d’acteur"
            >
              {FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  variant={
                    actorFilter === filter.value ? "primary" : "secondary"
                  }
                  aria-pressed={actorFilter === filter.value}
                  aria-label={`${filter.label} (${counts[filter.value]})`}
                  onClick={() => setActorFilter(filter.value)}
                >
                  {filter.label}
                  <Badge
                    variant={
                      actorFilter === filter.value ? "outline" : "secondary"
                    }
                    className="border-current/20 bg-current/10 text-inherit"
                  >
                    {counts[filter.value]}
                  </Badge>
                </Button>
              ))}
            </div>
            <p
              className="text-caption text-ink-muted"
              aria-live="polite"
              aria-atomic="true"
            >
              {visibleAccounts.length} profil
              {visibleAccounts.length === 1 ? "" : "s"} affiché
              {visibleAccounts.length === 1 ? "" : "s"} · Flèches haut et bas
              pour parcourir la liste
            </p>
          </div>

          <div
            ref={accountsRegionRef}
            role="region"
            aria-label="Profils de démonstration"
            className="min-h-0 overflow-y-auto overscroll-contain bg-canvas px-5 py-5 sm:px-7 sm:py-6"
            onKeyDown={navigateAccounts}
          >
            {groupedAccounts.length === 0 ? (
              <div
                role="status"
                className="grid min-h-64 place-items-center rounded-xl border border-dashed border-line-strong bg-surface p-8 text-center"
              >
                <div className="grid max-w-md justify-items-center gap-3">
                  <span className="rounded-full bg-surface-sunk p-3 text-ink-muted">
                    <SearchX className="size-6" />
                  </span>
                  <h3 className="text-h4">Aucun profil trouvé</h3>
                  <p className="text-small text-ink-muted">
                    Modifiez votre recherche ou choisissez un autre type
                    d’acteur.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-7">
                {groupedAccounts.map((group, groupIndex) => (
                  <section
                    key={group.label}
                    aria-labelledby={`${groupHeadingPrefix}-${groupIndex}`}
                  >
                    <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 bg-canvas/95 px-1 py-2 backdrop-blur-sm">
                      <h3
                        id={`${groupHeadingPrefix}-${groupIndex}`}
                        className="text-mono-label text-ink"
                      >
                        {group.label}
                      </h3>
                      <Badge variant="secondary">{group.accounts.length}</Badge>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.accounts.map((account) => {
                        const actorType = accountActorType(account)
                        const isPending = pendingAccountKey === account.key

                        return (
                          <Button
                            key={account.key}
                            type="button"
                            data-demo-account={account.key}
                            variant="secondary"
                            className="group h-auto min-h-32 w-full items-start justify-start rounded-xl p-4 text-left whitespace-normal hover:border-accent-base hover:bg-accent-soft/40"
                            aria-label={`Se connecter avec ${account.label}`}
                            aria-keyshortcuts="ArrowUp ArrowDown Home End"
                            loading={isPending}
                            loadingLabel="Connexion…"
                            disabled={Boolean(pendingAccountKey && !isPending)}
                            onClick={() => void onSelect(account)}
                          >
                            <span className="mt-0.5 rounded-lg bg-surface-sunk p-2 text-accent-ink group-hover:bg-accent-soft">
                              <UserRoundCheck className="size-5" />
                            </span>
                            <span className="grid min-w-0 flex-1 gap-2">
                              <span className="grid gap-0.5">
                                <span className="text-[16px] leading-snug font-semibold text-ink">
                                  {account.label}
                                </span>
                                <span className="text-caption leading-snug font-normal text-ink-muted">
                                  {account.description}
                                </span>
                              </span>

                              <span className="flex flex-wrap gap-1.5">
                                <Badge
                                  variant={
                                    actorType === "interne" ? "info" : "warning"
                                  }
                                >
                                  {actorType === "interne" ? (
                                    <Building2 />
                                  ) : (
                                    <Handshake />
                                  )}
                                  {actorType === "interne"
                                    ? "Personnel SETRAG"
                                    : "Partie prenante"}
                                </Badge>
                                {(account.moduleCodes ?? []).map((code) => (
                                  <Badge key={code} variant="secondary">
                                    <Layers3 />
                                    {moduleLabelForCode(code)}
                                  </Badge>
                                ))}
                              </span>
                            </span>
                          </Button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
