import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { formatTime, spellTime } from "@workspace/ui/lib/format"

export type TicketState = "valide" | "utilise" | "echange" | "rembourse" | "hors_ligne"

const STATE_LABELS: Record<TicketState, string> = {
  valide: "Valide",
  utilise: "Utilisé",
  echange: "Échangé",
  rembourse: "Remboursé",
  hors_ligne: "Hors ligne",
}

const STATE_TONES: Record<TicketState, string> = {
  valide: "bg-success text-ink",
  utilise: "bg-line-strong text-ink",
  echange: "bg-info text-ink",
  rembourse: "bg-second text-ink",
  hors_ligne: "bg-warning text-ink",
}

export interface TicketProps extends React.ComponentProps<"article"> {
  /** « Aller · vendredi 7 août ». */
  legLabel: string
  routeLabel: string
  departureAt: number | Date
  arrivalAt: number | Date
  departurePlace?: string
  arrivalPlace?: string
  /** « 12 · 44 » — voiture et place. */
  seatLabel?: string
  seatNote?: string
  passengerLabel: string
  /** Référence du dossier, affichée en mono. */
  reference: string
  conditionsNote?: string
  state?: TicketState
  /** QR code : nœud fourni par l'application (react-qr-code, image…). */
  qrCode?: React.ReactNode
}

/**
 * Billet SETRAG — fond encre, chiffres en mono, séparation pointillée avant
 * le QR code. Pensé pour être lu debout, en gare, à contre-jour.
 */
function Ticket({
  legLabel,
  routeLabel,
  departureAt,
  arrivalAt,
  departurePlace,
  arrivalPlace,
  seatLabel,
  seatNote,
  passengerLabel,
  reference,
  conditionsNote,
  state = "valide",
  qrCode,
  className,
  ...props
}: TicketProps) {
  return (
    <article
      data-slot="ticket"
      data-state={state}
      className={cn(
        "grid gap-6 rounded-lg bg-ink p-7 text-ink-inverse shadow-lg",
        className
      )}
      {...props}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <span className="text-mono-label text-accent-base">{legLabel}</span>
          <h3 className="text-h3 font-bold">{routeLabel}</h3>
        </div>
        <span
          className={cn(
            "rounded-pill px-3 py-2 text-[12px] leading-none font-semibold",
            STATE_TONES[state]
          )}
        >
          {STATE_LABELS[state]}
        </span>
      </header>

      <div className="grid gap-5 sm:grid-cols-3">
        <TicketFact label="Départ" place={departurePlace}>
          <span className="sr-only">{spellTime(departureAt)}</span>
          <span aria-hidden>{formatTime(departureAt)}</span>
        </TicketFact>
        <TicketFact label="Arrivée" place={arrivalPlace}>
          <span className="sr-only">{spellTime(arrivalAt)}</span>
          <span aria-hidden>{formatTime(arrivalAt)}</span>
        </TicketFact>
        {seatLabel && (
          <TicketFact label="Voiture / place" place={seatNote}>
            {seatLabel}
          </TicketFact>
        )}
      </div>

      <div className="flex items-center gap-5 border-t border-dashed border-ink-muted/50 pt-6">
        {qrCode && (
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md bg-surface p-1.5">
            {qrCode}
          </div>
        )}
        <div className="grid gap-1.5">
          <span className="text-[12px] leading-none font-medium text-ink-inverse/75">
            {passengerLabel}
          </span>
          <span className="tabular text-[14px] leading-none font-medium">
            DOSSIER · {reference}
          </span>
          {conditionsNote && (
            <span className="text-[12px] leading-normal text-ink-inverse/75">
              {conditionsNote}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

function TicketFact({
  label,
  place,
  children,
}: {
  label: string
  place?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] leading-none font-medium text-ink-inverse/75">
        {label}
      </span>
      <span className="tabular text-[20px] leading-none font-semibold">
        {children}
      </span>
      {place && (
        <span className="text-[12px] leading-snug text-ink-inverse/75">{place}</span>
      )}
    </div>
  )
}

export { Ticket, STATE_LABELS as TICKET_STATE_LABELS }
