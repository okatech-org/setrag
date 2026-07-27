"use client"

import Link from "next/link"

import { api } from "@workspace/backend/generated"
import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"

import { gabonDate } from "@/lib/ticketing"

type Departure = {
  tripId: string
  trainNumber: string
  trainType: "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
  serviceDate: string
  departureAt: number
  arrivalAt: number
  status: "planifie" | "a_lheure" | "retarde" | "annule" | "termine"
  delayMinutes: number
  origin: {
    stationId: string
    code: string
    name: string
  }
  destination: {
    stationId: string
    code: string
    name: string
  } | null
}

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "short",
  day: "numeric",
  month: "short",
})

function dayLabel(serviceDate: string) {
  if (serviceDate === gabonDate(0)) return "Aujourd’hui"
  if (serviceDate === gabonDate(1)) return "Demain"
  return dayFormatter.format(new Date(`${serviceDate}T12:00:00+01:00`))
}

function statusLabel(departure: Departure) {
  if (departure.status === "retarde" || departure.delayMinutes > 0) {
    return `retard ${departure.delayMinutes} min`
  }
  if (departure.status === "a_lheure") return "à l’heure"
  return "prévu"
}

function resultHref(departure: Departure) {
  if (!departure.destination) return "/"
  const query = new URLSearchParams({
    origin: departure.origin.stationId,
    destination: departure.destination.stationId,
    date: departure.serviceDate,
    adults: "1",
    children: "0",
  })
  return `/resultats?${query.toString()}`
}

export function UpcomingDepartures() {
  const departures = useQuery(api.functions.trips.nextDepartures, {
    originCode: "OWE",
    limit: 2,
  }) as Departure[] | undefined

  const allSchedulesHref = departures?.[0]
    ? resultHref(departures[0])
    : "/#recherche"

  return (
    <>
      <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-h2">Prochains départs depuis Owendo</h2>
        <Button
          asChild
          variant="secondary"
          className="max-w-full text-center whitespace-normal"
        >
          <Link href={allSchedulesHref}>Tous les horaires</Link>
        </Button>
      </div>

      {departures === undefined ? (
        <SkeletonLines lines={2} />
      ) : departures.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-5">
          <strong className="block">Aucun prochain départ en vente</strong>
          <p className="text-small mt-1 text-ink-muted">
            Utilisez la recherche pour consulter une autre date ou un autre
            trajet.
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3">
          {departures.map((departure) => (
            <article
              key={departure.tripId}
              className="flex min-w-0 flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-5"
            >
              <span className="tabular text-time">
                {hourFormatter.format(departure.departureAt)} →{" "}
                {hourFormatter.format(departure.arrivalAt)}
              </span>
              <div className="min-w-0 flex-[1_1_13rem]">
                <strong className="block">
                  {dayLabel(departure.serviceDate)} · {departure.trainNumber} ·{" "}
                  {departure.trainType === "EXPRESS" ? "Express" : "Omnibus"}
                </strong>
                <span className="text-small text-ink-muted">
                  {statusLabel(departure)}
                </span>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link
                  href={`/suivi?train=${encodeURIComponent(departure.trainNumber)}&date=${departure.serviceDate}`}
                >
                  Suivre
                </Link>
              </Button>
              <Button asChild size="sm" disabled={!departure.destination}>
                <Link href={resultHref(departure)}>Réserver</Link>
              </Button>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
