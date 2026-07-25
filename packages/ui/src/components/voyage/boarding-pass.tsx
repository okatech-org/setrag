import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"

export interface BoardingPassProps extends React.ComponentProps<"section"> {
  /** « Départ dans 34 min » — le compte à rebours prime sur l'heure absolue. */
  countdownLabel: string
  routeLabel: string
  coachLabel?: string
  seatLabel?: string
  platformLabel?: string
  /** « KX7 24Q · Camille Roux ». */
  reference: string
  qrCode?: React.ReactNode
  onAddToWallet?: () => void
  onExchange?: () => void
}

/**
 * Carte d'embarquement — l'écran qu'on ouvre debout sur le quai.
 *
 * Hiérarchie propre à ce moment du voyage : le compte à rebours d'abord, la
 * relation ensuite, puis les trois nombres qu'on cherche du regard (voiture,
 * place, quai) en mono 20 px. Le QR occupe toute la largeur de l'encart pour
 * rester scannable sans zoom.
 */
function BoardingPass({
  countdownLabel,
  routeLabel,
  coachLabel,
  seatLabel,
  platformLabel,
  reference,
  qrCode,
  onAddToWallet,
  onExchange,
  className,
  ...props
}: BoardingPassProps) {
  const facts = [
    { label: "Voiture", value: coachLabel },
    { label: "Place", value: seatLabel },
    { label: "Quai", value: platformLabel },
  ].filter((f) => f.value)

  return (
    <section
      data-slot="boarding-pass"
      className={cn(
        "grid w-80 gap-4 rounded-[28px] border border-line bg-surface p-4 shadow-lg",
        className
      )}
      {...props}
    >
      <header className="grid gap-1">
        <span className="text-mono-label text-accent-ink">{countdownLabel}</span>
        <h3 className="text-h3 font-bold">{routeLabel}</h3>
      </header>

      <div className="grid gap-4 rounded-[16px] bg-surface-sunk p-[18px]">
        {facts.length > 0 && (
          <div className="flex justify-between gap-3">
            {facts.map((fact) => (
              <div key={fact.label} className="grid gap-0.5">
                <span className="text-[11px] leading-none font-medium text-ink-muted">
                  {fact.label}
                </span>
                <span className="tabular text-[20px] leading-none font-semibold">
                  {fact.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {qrCode && (
          <div className="grid h-30 place-items-center overflow-hidden rounded-[10px] bg-surface p-2">
            {qrCode}
          </div>
        )}

        <span className="tabular text-center text-[13px] leading-none font-medium text-ink-muted">
          {reference}
        </span>
      </div>

      {(onAddToWallet || onExchange) && (
        <div className="flex gap-2">
          {onAddToWallet && (
            <Button
              size="md"
              onClick={onAddToWallet}
              className="flex-1 bg-accent-soft text-accent-ink hover:bg-accent-line"
            >
              Ajouter au wallet
            </Button>
          )}
          {onExchange && (
            <Button size="md" variant="secondary" onClick={onExchange} className="flex-1">
              Échanger
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

export { BoardingPass }
