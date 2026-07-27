"use client"

import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  Mail,
  TrainFront,
} from "lucide-react"
import Link from "next/link"
import QRCode from "react-qr-code"
import { useState } from "react"

import { useAction, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import {
  Ticket,
  type TicketState,
} from "@workspace/ui/components/voyage/ticket"

import { BookingDetailMobile } from "@/components/booking/booking-detail-mobile"
import { ticketingStorage } from "@/lib/ticketing"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

async function saveRemoteFile(url: string, filename: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error("Téléchargement impossible")
    const blob = await response.blob()
    const localUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = localUrl
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(localUrl)
  } catch {
    // Repli pour les navigateurs qui interdisent la lecture cross-origin du
    // fichier : une navigation directe reste plus fiable qu'une popup.
    window.location.assign(url)
  }
}

function ticketState(status: string): TicketState {
  if (status === "utilise") return "utilise"
  if (status === "rembourse" || status === "annule") return "rembourse"
  return "valide"
}

function buildCalendar(
  reference: string,
  trainNumber: string,
  origin: string,
  destination: string,
  departureAt: number,
  arrivalAt: number
) {
  const date = (timestamp: number) =>
    new Date(timestamp)
      .toISOString()
      .replaceAll("-", "")
      .replaceAll(":", "")
      .replace(".000", "")
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SETRAG//Billetterie//FR",
    "BEGIN:VEVENT",
    `UID:${reference}@billets.setrag.ga`,
    `DTSTAMP:${date(Date.now())}`,
    `DTSTART:${date(departureAt)}`,
    `DTEND:${date(arrivalAt)}`,
    `SUMMARY:Train ${trainNumber} — ${origin} vers ${destination}`,
    `DESCRIPTION:Dossier SETRAG ${reference}. Présentez-vous en gare 45 minutes avant le départ.`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Votre voyage SETRAG part demain",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
}

export function BookingDetailScreen({ reference }: { reference: string }) {
  const {
    isAuthenticated,
    isLoading: authLoading,
    isProfileReady,
  } = useTravelerAuth()
  const storedBooking = ticketingStorage.getBooking()
  const storedPhone =
    storedBooking?.reference === reference ? storedBooking.contactPhone : ""
  const [phone, setPhone] = useState(storedPhone)
  const [accessPhone, setAccessPhone] = useState(storedPhone)
  const canLoad = (isAuthenticated && isProfileReady) || Boolean(accessPhone)
  const detail = useQuery(
    api.functions.bookings.getByReference,
    canLoad
      ? {
          reference,
          contactPhone: accessPhone || undefined,
        }
      : "skip"
  )
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const bookingPdf = useAction(api.functions.documents.bookingPdf)
  const emailTickets = useAction(api.functions.notifications.emailTickets)
  const [busy, setBusy] = useState<string>()
  const [email, setEmail] = useState(storedBooking?.contactEmail ?? "")
  const [message, setMessage] = useState<{
    tone: "success" | "warning" | "danger" | "info"
    title: string
    body?: string
  }>()
  const [copied, setCopied] = useState(false)

  if (authLoading || (isAuthenticated && !isProfileReady))
    return <SkeletonLines lines={5} />
  if (!canLoad) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Retrouver ce dossier</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-small text-ink-muted">
            Saisissez le téléphone utilisé lors de la réservation. Vous pouvez
            aussi vous connecter pour accéder à tous vos dossiers.
          </p>
          <Field label="Téléphone de réservation" htmlFor="booking-phone">
            <Input
              id="booking-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <Button onClick={() => setAccessPhone(phone.trim())}>
            Afficher mes billets
          </Button>
          <Button asChild variant="secondary">
            <Link
              href={`/connexion?retour=/reservation/${encodeURIComponent(reference)}`}
            >
              Se connecter
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (detail === undefined) return <SkeletonLines lines={7} />
  if (detail === null || !detail.trip) {
    return (
      <EmptyState
        title="Dossier introuvable"
        description="Vérifiez la référence et le téléphone de réservation."
        action={
          <Button asChild>
            <Link href="/mes-reservations">Mes réservations</Link>
          </Button>
        }
      />
    )
  }

  const origin = detail.origin?.name ?? "Gare de départ"
  const destination = detail.destination?.name ?? "Gare d’arrivée"
  const isPaid = detail.sale.status === "confirmee"
  const currentTrip = detail.trip

  async function downloadTicket(ticketId: string, number: string) {
    setBusy(ticketId)
    setMessage(undefined)
    try {
      const result = await ticketPdf({
        ticketId: ticketId as never,
        contactPhone: accessPhone || undefined,
      })
      await saveRemoteFile(result.url, `billet-${number}.pdf`)
    } catch (cause) {
      setMessage({
        tone: "danger",
        title: "Le billet n’a pas pu être téléchargé.",
        body: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function downloadAll() {
    setBusy("all")
    setMessage(undefined)
    try {
      const result = await bookingPdf({
        reference,
        contactPhone: accessPhone || undefined,
      })
      await saveRemoteFile(result.url, result.filename)
    } catch (cause) {
      setMessage({
        tone: "danger",
        title: "Les billets n’ont pas pu être téléchargés.",
        body: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function sendEmail() {
    setBusy("email")
    setMessage(undefined)
    try {
      const result = await emailTickets({
        reference,
        contactPhone: accessPhone || undefined,
        email: email.trim() || undefined,
      })
      if (result.sent) {
        setMessage({
          tone: "success",
          title: `Billets envoyés à ${result.recipient}.`,
        })
      } else if (result.reason === "missing_email") {
        setMessage({
          tone: "warning",
          title: "Renseignez une adresse e-mail.",
        })
      } else if (result.reason === "rate_limited") {
        setMessage({
          tone: "warning",
          title: "Trop de renvois rapprochés.",
          body: "Réessayez dans environ une heure.",
        })
      } else {
        setMessage({
          tone: "info",
          title: "L’envoi d’e-mails n’est pas encore activé.",
          body: "Le téléchargement reste disponible. L’envoi fonctionnera dès que le fournisseur sera configuré.",
        })
      }
    } catch (cause) {
      setMessage({
        tone: "danger",
        title: "L’e-mail n’a pas pu être envoyé.",
        body: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(undefined)
    }
  }

  function addToCalendar() {
    const calendar = buildCalendar(
      reference,
      currentTrip.trainNumber,
      origin,
      destination,
      currentTrip.departureAt,
      currentTrip.arrivalAt
    )
    const url = URL.createObjectURL(
      new Blob([calendar], { type: "text/calendar;charset=utf-8" })
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `voyage-${reference}.ics`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-6 md:gap-8">
      <BookingDetailMobile
        reference={reference}
        origin={origin}
        destination={destination}
        trainNumber={currentTrip.trainNumber}
        departureAt={currentTrip.departureAt}
        arrivalAt={currentTrip.arrivalAt}
        serviceDate={currentTrip.serviceDate}
        isPaid={isPaid}
        tickets={detail.tickets.map((ticket) => ({
          _id: ticket._id,
          number: ticket.number,
          status: ticket.status,
          barcodePayload: ticket.barcodePayload,
          seatLabel: ticket.seatLabel,
          coachLabel: ticket.coachLabel,
          passenger: ticket.passenger,
        }))}
        busy={busy}
        onDownloadTicket={(ticketId, number) =>
          void downloadTicket(ticketId, number)
        }
        onAddToCalendar={addToCalendar}
      />

      {/* Vue bureau — le mobile a sa propre présentation, plein écran. */}
      <div className="hidden gap-8 md:grid">
        <InlineMessage
          tone={isPaid ? "success" : "warning"}
          title={
            isPaid
              ? "Réservation confirmée. Vos titres sont prêts."
              : "Réservation enregistrée, en attente de paiement."
          }
        >
          {isPaid
            ? `${detail.tickets.length} billet(s) émis pour ce dossier.`
            : "Aucun titre valable ne sera émis avant le règlement au guichet."}
        </InlineMessage>

        {message && (
          <InlineMessage tone={message.tone} title={message.title}>
            {message.body}
          </InlineMessage>
        )}

        <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <span className="text-mono-label text-ink-muted">
              Référence de réservation
            </span>
            <div className="flex items-center gap-2">
              <h1 className="tabular text-h1 break-all">{reference}</h1>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Copier la référence"
                onClick={async () => {
                  await navigator.clipboard.writeText(reference)
                  setCopied(true)
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-small text-ink-muted">
              {detail.trip.trainNumber} · {origin} → {destination}
            </p>
          </div>
          <Tag tone={isPaid ? "success" : "warning"}>
            {isPaid ? "Payée" : "À payer"}
          </Tag>
        </div>

        <div className="grid gap-5">
          {detail.tickets.map((ticket) => (
            <div key={ticket._id} className="grid gap-3">
              <Ticket
                legLabel={`Billet ${ticket.number}`}
                routeLabel={`${origin} → ${destination}`}
                departureAt={detail.trip!.departureAt}
                arrivalAt={detail.trip!.arrivalAt}
                departurePlace={origin}
                arrivalPlace={destination}
                passengerLabel={`${ticket.passenger.firstName} ${ticket.passenger.lastName}`}
                reference={reference}
                seatLabel={
                  ticket.seatLabel
                    ? `${ticket.coachLabel ?? "Voiture"} · ${ticket.seatLabel}`
                    : undefined
                }
                conditionsNote="Présentez ce code à l’embarquement"
                state={ticketState(ticket.status)}
                qrCode={
                  ticket.barcodePayload ? (
                    <QRCode value={ticket.barcodePayload} size={82} />
                  ) : undefined
                }
              />
              {isPaid && (
                <Button
                  variant="secondary"
                  className="justify-self-start"
                  disabled={Boolean(busy)}
                  onClick={() => downloadTicket(ticket._id, ticket.number)}
                >
                  <Download />
                  {busy === ticket._id
                    ? "Préparation…"
                    : `PDF ${ticket.number}`}
                </Button>
              )}
            </div>
          ))}
        </div>

        {isPaid && (
          <Card>
            <CardHeader>
              <CardTitle>Récupérer et conserver mes billets</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button disabled={Boolean(busy)} onClick={downloadAll}>
                  <Download />
                  {busy === "all"
                    ? "Préparation…"
                    : `Télécharger les ${detail.tickets.length} billets`}
                </Button>
                <Button variant="secondary" onClick={addToCalendar}>
                  <CalendarPlus /> Ajouter au calendrier
                </Button>
              </div>
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Adresse e-mail" htmlFor="ticket-email">
                  <Input
                    id="ticket-email"
                    type="email"
                    value={email}
                    placeholder={detail.sale.contactEmail ?? "vous@exemple.com"}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={Boolean(busy)}
                  onClick={sendEmail}
                >
                  <Mail />
                  {busy === "email" ? "Envoi…" : "Envoyer par e-mail"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <InlineMessage tone="info" title="À savoir avant le départ">
          Présentez-vous en gare 45 minutes avant le départ. Une pièce
          d’identité peut être demandée et les bagages restent soumis au barème
          SETRAG.
        </InlineMessage>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link
              href={`/suivi?train=${encodeURIComponent(detail.trip.trainNumber)}&date=${detail.trip.serviceDate}`}
            >
              <TrainFront /> Suivre la desserte
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/mes-reservations">Mes réservations</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
