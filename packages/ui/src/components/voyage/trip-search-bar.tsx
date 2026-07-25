"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"

export type TripKind = "aller_retour" | "aller_simple" | "multi_etapes"

const TRIP_KINDS: Array<{ id: TripKind; label: string }> = [
  { id: "aller_retour", label: "Aller-retour" },
  { id: "aller_simple", label: "Aller simple" },
  { id: "multi_etapes", label: "Multi-étapes" },
]

export interface TripSearchBarProps
  extends Omit<React.ComponentProps<"form">, "onSubmit"> {
  kind?: TripKind
  onKindChange?: (kind: TripKind) => void
  origin?: React.ReactNode
  destination?: React.ReactNode
  dates?: React.ReactNode
  passengers?: React.ReactNode
  onSwap?: () => void
  onSubmit?: () => void
  submitting?: boolean
  /** Raccourcis sous la barre : cartes de réduction, options. */
  shortcuts?: React.ReactNode
}

/**
 * Barre de recherche voyage — une ligne sur desktop, empilée sur mobile.
 * Les champs sont fournis par l'application (autocomplétion, sélecteur de
 * dates…) ; la barre n'impose que le gabarit et la hiérarchie.
 */
function TripSearchBar({
  kind = "aller_retour",
  onKindChange,
  origin,
  destination,
  dates,
  passengers,
  onSwap,
  onSubmit,
  submitting = false,
  shortcuts,
  className,
  ...props
}: TripSearchBarProps) {
  return (
    <form
      data-slot="trip-search-bar"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.()
      }}
      className={cn(
        "grid gap-5 rounded-lg border border-line bg-surface p-6 shadow-md",
        className
      )}
      {...props}
    >
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Type de trajet">
        {TRIP_KINDS.map((item) => {
          const active = item.id === kind

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onKindChange?.(item.id)}
              className={cn(
                "rounded-pill px-3.5 py-2.5 text-[13px] leading-none transition-colors duration-200 ease-setrag",
                active
                  ? "bg-ink font-semibold text-ink-inverse"
                  : "font-medium text-ink-muted hover:bg-surface-sunk"
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <SearchSlot label="Départ" className="flex-[1_1_180px]">
          {origin}
        </SearchSlot>

        <button
          type="button"
          onClick={onSwap}
          disabled={!onSwap}
          aria-label="Inverser le départ et l'arrivée"
          className="grid h-14 w-10 shrink-0 place-items-center rounded-pill border border-line text-ink-muted transition-colors hover:bg-surface-sunk disabled:opacity-50 disabled:hover:bg-transparent"
        >
          ⇄
        </button>

        <SearchSlot label="Arrivée" className="flex-[1_1_180px]">
          {destination}
        </SearchSlot>

        <SearchSlot label="Dates" className="flex-[1_1_220px]">
          {dates}
        </SearchSlot>

        <SearchSlot label="Voyageurs" className="flex-[1_1_170px]">
          {passengers}
        </SearchSlot>

        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingLabel="Recherche…"
          className="h-14 flex-[1_1_160px] rounded-md px-8"
        >
          Rechercher
        </Button>
      </div>

      {shortcuts && (
        <div className="flex flex-wrap items-center gap-2">{shortcuts}</div>
      )}
    </form>
  )
}

function SearchSlot({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <label className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-[12px] leading-none font-medium text-ink-muted">
        {label}
      </span>
      {children ?? <SearchSlotPlaceholder />}
    </label>
  )
}

/** Gabarit visuel par défaut, quand l'application ne fournit pas de champ. */
function SearchSlotPlaceholder() {
  return (
    <span className="flex h-14 items-center overflow-hidden rounded-md border border-line-strong px-4 text-[16px] leading-tight font-medium text-ink-muted">
      —
    </span>
  )
}

export { TripSearchBar, SearchSlot }
