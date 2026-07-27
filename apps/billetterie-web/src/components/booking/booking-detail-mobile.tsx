"use client"

import * as React from "react"
import { CalendarPlus, Download, Share2, TrainFront } from "lucide-react"
import Link from "next/link"
import QRCode from "react-qr-code"

import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "long",
  day: "numeric",
  month: "long",
})

export interface BookingDetailTicket {
  _id: string
  number: string
  status: string
  barcodePayload?: string
  seatLabel?: string
  coachLabel?: string
  passenger: { firstName: string; lastName: string }
}

/**
 * Billet plein écran, en mobile.
 *
 * C'est l'écran qu'on tend au contrôleur : le code occupe la moitié de la
 * hauteur, sur fond sombre pour que la luminosité poussée au maximum reste
 * lisible, et rien ne vient s'intercaler entre lui et l'identité du voyageur.
 *
 * Un billet par écran, faits défiler horizontalement quand le dossier en
 * compte plusieurs — le contrôle se fait voyageur par voyageur.
 */
export function BookingDetailMobile({
  reference,
  origin,
  destination,
  trainNumber,
  departureAt,
  arrivalAt,
  serviceDate,
  isPaid,
  tickets,
  busy,
  onDownloadTicket,
  onAddToCalendar,
}: {
  reference: string
  origin: string
  destination: string
  trainNumber: string
  departureAt: number
  arrivalAt: number
  serviceDate: string
  isPaid: boolean
  tickets: BookingDetailTicket[]
  busy: string | undefined
  onDownloadTicket: (ticketId: string, number: string) => void
  onAddToCalendar: () => void
}) {
  const [shareState, setShareState] = React.useState<"idle" | "copied">("idle")

  async function share() {
    const url = window.location.href
    // `navigator.share` n'existe pas partout : le repli copie le lien, ce qui
    // rend le même service sans laisser le bouton sans effet.
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Billet SETRAG ${reference}`,
          text: `${origin} → ${destination} · ${trainNumber}`,
          url,
        })
        return
      } catch {
        // Partage refusé ou annulé : on retombe sur la copie.
      }
    }
    await navigator.clipboard.writeText(url)
    setShareState("copied")
  }

  return (
    <div className="grid gap-s-4 *:min-w-0 md:hidden">
      {tickets.map((ticket) => (
        <article
          key={ticket._id}
          className="grid gap-s-4 rounded-lg bg-ink p-s-4 text-ink-inverse"
        >
          <div className="flex items-center gap-s-2">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-body truncate font-semibold">
                {ticket.passenger.lastName.toUpperCase()}{" "}
                {ticket.passenger.firstName}
              </span>
              <span className="tabular text-caption text-ink-faint">
                Billet {ticket.number}
              </span>
            </span>
            <Tag tone={isPaid ? "success" : "warning"}>
              {isPaid ? "valable" : "à régler"}
            </Tag>
          </div>

          <div className="flex gap-s-3">
            <span className="grid flex-1 gap-0.5">
              <span className="text-caption text-ink-faint">Départ</span>
              <span className="tabular text-time">
                {hourFormatter.format(departureAt)}
              </span>
              <span className="text-caption truncate text-ink-faint">
                {origin}
              </span>
            </span>
            <span className="grid flex-1 gap-0.5">
              <span className="text-caption text-ink-faint">Arrivée</span>
              <span className="tabular text-time">
                {hourFormatter.format(arrivalAt)}
              </span>
              <span className="text-caption truncate text-ink-faint">
                {destination}
              </span>
            </span>
          </div>

          <div className="grid gap-s-3 border-t border-dashed border-white/25 pt-s-4">
            {ticket.barcodePayload ? (
              <span className="justify-self-center rounded-sm bg-white p-s-2">
                <QRCode value={ticket.barcodePayload} size={168} />
              </span>
            ) : (
              <p className="text-small rounded-sm bg-white/10 p-s-3 text-ink-faint">
                Aucun code n’est émis tant que le dossier n’est pas réglé.
              </p>
            )}
            <div className="grid gap-0.5 text-center">
              <span className="tabular text-body font-semibold">
                {reference}
              </span>
              <span className="text-caption text-ink-faint">
                {dayFormatter.format(departureAt)} · {trainNumber}
                {ticket.seatLabel
                  ? ` · ${ticket.coachLabel ?? "voiture"} ${ticket.seatLabel}`
                  : ""}
              </span>
            </div>
          </div>

          {isPaid && (
            <Button
              variant="secondary"
              size="sm"
              block
              disabled={Boolean(busy)}
              onClick={() => onDownloadTicket(ticket._id, ticket.number)}
            >
              <Download />
              {busy === ticket._id ? "Préparation…" : "Télécharger le PDF"}
            </Button>
          )}
        </article>
      ))}

      <div className="grid grid-cols-2 gap-s-2">
        <Button variant="secondary" onClick={() => void share()}>
          <Share2 />
          {shareState === "copied" ? "Lien copié" : "Partager"}
        </Button>
        <Button variant="secondary" onClick={onAddToCalendar}>
          <CalendarPlus />
          Calendrier
        </Button>
      </div>

      <Button asChild variant="ghost" block>
        <Link
          href={`/suivi?train=${encodeURIComponent(trainNumber)}&date=${serviceDate}`}
        >
          <TrainFront /> Suivre la desserte
        </Link>
      </Button>

      <p className="text-caption text-ink-faint">
        Poussez la luminosité au maximum pour le contrôle. Le code reste
        vérifiable sans réseau.
      </p>
    </div>
  )
}
