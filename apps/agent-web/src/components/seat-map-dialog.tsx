"use client"

import { Armchair, Ban, Check, Users } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import type { SeatMapItem } from "@/lib/agent-data"

interface SeatMapDialogProps {
  open: boolean
  seats: SeatMapItem[]
  requiredCount: number
  initialSelection: string[]
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (seatIds: string[]) => void
}

export function SeatMapDialog({
  open,
  seats,
  requiredCount,
  initialSelection,
  loading,
  onOpenChange,
  onConfirm,
}: SeatMapDialogProps) {
  const [selection, setSelection] = useState(initialSelection)
  const coaches = useMemo(
    () =>
      Array.from(
        seats.reduce((byCoach, seat) => {
          const current = byCoach.get(seat.coachId) ?? []
          current.push(seat)
          byCoach.set(seat.coachId, current)
          return byCoach
        }, new Map<string, SeatMapItem[]>())
      ),
    [seats]
  )
  const [activeCoachId, setActiveCoachId] = useState(coaches[0]?.[0] ?? "")
  const resolvedActiveCoachId = activeCoachId || coaches[0]?.[0] || ""
  const activeSeats =
    coaches.find(([coachId]) => coachId === resolvedActiveCoachId)?.[1] ?? []
  const activeCoach = activeSeats[0]

  function toggleSeat(seat: SeatMapItem) {
    if (!seat.isFree) return
    setSelection((current) => {
      if (current.includes(seat.seatId)) {
        return current.filter((seatId) => seatId !== seat.seatId)
      }
      if (current.length >= requiredCount) return current
      return [...current, seat.seatId]
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(92dvh,900px)] max-w-[min(1100px,calc(100%-2rem))] grid-rows-[auto_1fr_auto] overflow-hidden"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-h3">
            AW-V-03 · Plan de voiture
          </DialogTitle>
          <DialogDescription>
            Sélectionnez exactement {requiredCount} place(s). La disponibilité
            tient compte de l’intégralité du trajet demandé.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          {loading ? (
            <p role="status" className="py-16 text-center text-ink-muted">
              Chargement de l’occupation…
            </p>
          ) : coaches.length === 0 ? (
            <InlineMessage tone="warning" title="Aucun plan disponible.">
              L’attribution automatique sera utilisée à la validation.
            </InlineMessage>
          ) : (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-mono-label mr-2 text-ink-muted">
                  Voiture
                </span>
                {coaches.map(([coachId, coachSeats]) => (
                  <Button
                    key={coachId}
                    type="button"
                    size="sm"
                    variant={
                      coachId === resolvedActiveCoachId
                        ? "primary"
                        : "secondary"
                    }
                    onClick={() => setActiveCoachId(coachId)}
                  >
                    {coachSeats[0]?.coachLabel}
                    <Badge variant="secondary">
                      {coachSeats.filter((seat) => seat.isFree).length} libres
                    </Badge>
                  </Button>
                ))}
              </div>

              <div className="rounded-lg border border-line bg-surface-sunk p-5">
                <div
                  className="mx-auto grid max-w-2xl gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${activeCoach?.coachColumnCount ?? 4}, minmax(52px, 1fr))`,
                  }}
                >
                  {activeSeats.map((seat) => {
                    const selected = selection.includes(seat.seatId)
                    const status = selected
                      ? "sélectionnée"
                      : seat.isBlocked
                        ? "bloquée"
                        : seat.isOccupied
                          ? "occupée"
                          : "libre"
                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        aria-label={`Place ${seat.label} · ${status}`}
                        aria-pressed={selected}
                        disabled={!seat.isFree}
                        onClick={() => toggleSeat(seat)}
                        className={cn(
                          "text-small flex min-h-13 items-center justify-center gap-1 rounded-sm border-2 font-mono font-semibold",
                          selected &&
                            "border-accent-base bg-accent-base text-ink-inverse",
                          !selected &&
                            seat.isFree &&
                            "border-line-strong bg-surface hover:border-accent-base hover:bg-accent-soft",
                          seat.isOccupied &&
                            "border-line bg-line/50 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,.08)_4px,rgba(0,0,0,.08)_8px)] text-ink-muted",
                          seat.isBlocked &&
                            "border-warning bg-warning-soft text-warning-ink"
                        )}
                      >
                        {selected ? (
                          <Check className="size-4" />
                        ) : seat.isBlocked ? (
                          <Ban className="size-4" />
                        ) : seat.isOccupied ? (
                          <Users className="size-4" />
                        ) : (
                          <Armchair className="size-4" />
                        )}
                        {seat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="text-caption flex flex-wrap gap-4 text-ink-muted">
                <span className="flex items-center gap-1">
                  <Armchair className="size-4" /> libre
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-4" /> occupée
                </span>
                <span className="flex items-center gap-1">
                  <Check className="size-4" /> sélectionnée
                </span>
                <span className="flex items-center gap-1">
                  <Ban className="size-4" /> bloquée
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Attribution automatique
          </Button>
          <Button
            type="button"
            disabled={selection.length !== requiredCount}
            onClick={() => {
              onConfirm(selection)
              onOpenChange(false)
            }}
          >
            Confirmer {selection.length}/{requiredCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
