"use client"

import * as React from "react"
import { Check, X } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

export type SeatState = "free" | "occupied" | "blocked"

export interface SeatGridSeat {
  id: string
  /** Repère imprimé sur le billet — « 12A ». */
  label: string
  row: number
  column: number
  state: SeatState
}

/**
 * Plan de voiture — sélection des places.
 *
 * Deux points méritent d'être notés.
 *
 * D'abord la cible tactile : la maquette dessine dix colonnes sur la largeur
 * de l'écran, ce qui donnerait des cases d'environ 33 px. La règle SETRAG des
 * 44 px n'est pas négociable, donc la grille garde ses cases pleines et
 * défile horizontalement quand la voiture est trop large.
 *
 * Ensuite l'état : la couleur ne porte jamais seule l'information. Chaque case
 * affiche un signe — le repère de la place si elle est libre, une coche si
 * elle est retenue, une croix si elle est vendue, un point si elle est
 * neutralisée — et le libellé accessible du bouton énonce la même chose.
 */
function SeatGrid({
  className,
  seats,
  columnCount,
  selectedIds,
  onToggleSeat,
  maxSelection,
  label,
  ...props
}: Omit<React.ComponentProps<"div">, "onSelect"> & {
  seats: SeatGridSeat[]
  columnCount: number
  selectedIds: readonly string[]
  onToggleSeat: (seatId: string) => void
  /** Au-delà, les places encore libres cessent d'être sélectionnables. */
  maxSelection: number
  /** Étiquette du groupe — « Places de la voiture B ». */
  label: string
}) {
  const selected = new Set(selectedIds)
  const selectionFull = selected.size >= maxSelection

  return (
    <div
      data-slot="seat-grid"
      className={cn("grid gap-s-3", className)}
      {...props}
    >
      <div className="no-scrollbar -mx-s-1 overflow-x-auto px-s-1 py-s-1">
        <div
          role="group"
          aria-label={label}
          className="grid w-max gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(var(--target-min), 1fr))`,
          }}
        >
          {seats.map((seat) => {
            const isSelected = selected.has(seat.id)
            const unavailable = seat.state !== "free"
            // Une place déjà retenue reste cliquable pour être relâchée, même
            // quand le quota est atteint.
            const disabled = unavailable || (selectionFull && !isSelected)

            return (
              <button
                key={seat.id}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`Place ${seat.label} — ${seatStateLabel(seat.state, isSelected)}`}
                onClick={() => onToggleSeat(seat.id)}
                className={cn(
                  "tabular flex size-target items-center justify-center rounded-sm border text-[11px] font-medium transition-colors duration-200 ease-setrag",
                  isSelected &&
                    "border-transparent bg-accent-base font-semibold text-ink-inverse",
                  !isSelected &&
                    seat.state === "free" &&
                    "border-line-strong bg-surface text-ink hover:bg-surface-sunk disabled:text-ink-faint",
                  !isSelected &&
                    seat.state === "occupied" &&
                    "border-transparent bg-second-soft text-second-ink",
                  !isSelected &&
                    seat.state === "blocked" &&
                    "border-line bg-surface-sunk text-ink-faint",
                  disabled && "pointer-events-none"
                )}
              >
                {isSelected ? (
                  <Check aria-hidden className="size-4" />
                ) : seat.state === "occupied" ? (
                  <X aria-hidden className="size-4" />
                ) : seat.state === "blocked" ? (
                  <span aria-hidden>·</span>
                ) : (
                  <span aria-hidden>{seat.label}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <ul className="text-caption flex flex-wrap gap-s-3 text-ink-muted">
        <SeatLegend swatch="border border-line-strong bg-surface">
          libre
        </SeatLegend>
        <SeatLegend swatch="bg-accent-base">choisie</SeatLegend>
        <SeatLegend swatch="bg-second-soft">occupée</SeatLegend>
        <SeatLegend swatch="border border-line bg-surface-sunk">
          indisponible
        </SeatLegend>
      </ul>
    </div>
  )
}

function SeatLegend({
  swatch,
  children,
}: {
  swatch: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-s-2">
      <span aria-hidden className={cn("size-3 rounded-xs", swatch)} />
      {children}
    </li>
  )
}

function seatStateLabel(state: SeatState, isSelected: boolean) {
  if (isSelected) return "retenue par vous"
  if (state === "occupied") return "déjà vendue"
  if (state === "blocked") return "indisponible"
  return "libre"
}

export { SeatGrid }
