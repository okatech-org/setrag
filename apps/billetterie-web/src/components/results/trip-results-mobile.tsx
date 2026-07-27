"use client"

import Link from "next/link"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { Chip, ChipScroller } from "@workspace/ui/mobile/chip-scroller"

import type {
  ResultTrip,
  TrainTypeFilter,
  useTripResults,
} from "@/features/resultats/use-trip-results"
import { ticketingStorage, type SearchDraft } from "@/lib/ticketing"

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const xafFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
})

const CLASS_LABELS: Record<string, string> = {
  DEUXIEME: "2e classe",
  PREMIERE: "1re classe",
  VIP: "VIP",
}

const TYPE_FILTERS: Array<{ value: TrainTypeFilter; label: string }> = [
  { value: "TOUS", label: "Toutes" },
  { value: "EXPRESS", label: "Express" },
  { value: "OMNIBUS", label: "Omnibus" },
]

/** Durée en « 14 h 15 », comme la maquette. */
function durationLabel(from: number, to: number) {
  const minutes = Math.round((to - from) / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} h ${String(rest).padStart(2, "0")}`
}

/**
 * Liste des dessertes, en mobile.
 *
 * Chaque carte porte l'horaire, l'engin, et le détail des classes encore
 * ouvertes sur la portion demandée — c'est ce qui décide de l'achat, et le
 * replier derrière un écran de détail obligerait à faire l'aller-retour pour
 * comparer deux trains.
 */
export function TripResultsMobile({
  results,
}: {
  results: ReturnType<typeof useTripResults>
}) {
  return (
    <div className="grid gap-s-4 *:min-w-0 md:hidden">
      <ChipScroller label="Filtrer par type de desserte">
        {TYPE_FILTERS.map((filter) => (
          <Chip
            key={filter.value}
            selected={results.typeFilter === filter.value}
            onClick={() => results.setTypeFilter(filter.value)}
          >
            {filter.label}
          </Chip>
        ))}
      </ChipScroller>

      {results.trips.length === 0 ? (
        <InlineMessage
          tone="info"
          title="Aucune desserte de ce type ce jour-là."
        >
          {results.totalCount} desserte
          {results.totalCount > 1 ? "s sont disponibles" : " est disponible"} en
          retirant le filtre.
        </InlineMessage>
      ) : (
        <ul className="grid gap-s-3">
          {results.trips.map((trip) => (
            <li key={trip.tripId}>
              <MobileTripCard
                trip={trip}
                search={results.search}
                canQuery={results.canQuery}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-caption text-ink-muted">
        Prix indicatifs. Le tarif est figé pendant 15 minutes dès l’ouverture du
        dossier.
      </p>
      <Button asChild variant="ghost" block>
        <Link href="/">Modifier la recherche</Link>
      </Button>
    </div>
  )
}

function MobileTripCard({
  trip,
  search,
  canQuery,
}: {
  trip: ResultTrip
  search: SearchDraft
  canQuery: boolean
}) {
  const cancelled = trip.status === "annule"
  const late = trip.status === "retarde" || trip.delayMinutes > 0
  const openClasses = Object.entries(trip.availableByClass).filter(
    ([, seats]) => seats > 0
  )
  const tightest = openClasses.reduce(
    (min, [, seats]) => Math.min(min, seats),
    Number.POSITIVE_INFINITY
  )

  return (
    <article className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
      <div className="flex items-start gap-s-3">
        <span
          className={
            cancelled
              ? "tabular text-body flex-1 font-semibold line-through"
              : "tabular text-body flex-1 font-semibold"
          }
        >
          {hourFormatter.format(trip.departureAt)} →{" "}
          {hourFormatter.format(trip.arrivalAt)}
        </span>
        {cancelled ? (
          <Tag tone="danger">annulée</Tag>
        ) : late ? (
          <Tag tone="warning">+{trip.delayMinutes} min</Tag>
        ) : (
          <Tag tone="neutral">
            {durationLabel(trip.departureAt, trip.arrivalAt)}
          </Tag>
        )}
      </div>

      <p className="text-small text-ink-muted">
        {trip.trainNumber} ·{" "}
        {trip.trainType === "EXPRESS" ? "Express" : "Omnibus"} ·{" "}
        {trip.distanceKm} km · sans changement
      </p>

      {cancelled ? (
        <InlineMessage tone="danger" title="Desserte supprimée ce jour.">
          Aucune place n’est vendue sur cette circulation.
        </InlineMessage>
      ) : openClasses.length === 0 ? (
        <p className="text-small rounded-sm bg-surface-sunk p-s-3 text-ink-muted">
          Complet sur votre portion.
        </p>
      ) : (
        <ul className="grid gap-s-2 rounded-sm bg-surface-sunk p-s-3">
          {openClasses.map(([serviceClass, seats]) => (
            <li key={serviceClass}>
              <ClassRow
                serviceClass={serviceClass}
                seats={seats}
                trip={trip}
                search={search}
                canQuery={canQuery}
              />
            </li>
          ))}
        </ul>
      )}

      {!cancelled && tightest > 0 && tightest < 5 && (
        <InlineMessage
          tone="warning"
          title="Dernières places sur votre portion."
        >
          Il reste {tightest} place{tightest > 1 ? "s" : ""} dans la classe la
          moins disponible.
        </InlineMessage>
      )}

      <Button
        asChild
        variant="secondary"
        block
        disabled={cancelled || openClasses.length === 0}
        onClick={() => ticketingStorage.setTrip(trip)}
      >
        <Link href={`/reservation?trip=${trip.tripId}`}>
          Choisir cette desserte
        </Link>
      </Button>
    </article>
  )
}

/**
 * Une classe et son prix.
 *
 * Le tarif vient du devis serveur, jamais d'un calcul local : c'est lui qui
 * applique le barème kilométrique et les réductions déclarées.
 */
function ClassRow({
  serviceClass,
  seats,
  trip,
  search,
  canQuery,
}: {
  serviceClass: string
  seats: number
  trip: ResultTrip
  search: SearchDraft
  canQuery: boolean
}) {
  const quote = useQuery(
    api.functions.bookings.quote,
    canQuery
      ? {
          tripId: trip.tripId as never,
          originStationId: search.originId as never,
          destinationStationId: search.destinationId as never,
          serviceClass: serviceClass as "DEUXIEME" | "PREMIERE" | "VIP",
          passengerCount: trip.passengers,
          discountCodes: [
            ...Array(search.adults).fill(""),
            ...Array(search.children).fill("ENFANT"),
          ],
        }
      : "skip"
  )

  const unitPrice = quote
    ? Math.round(quote.totalTtc / trip.passengers)
    : trip.priceXaf

  return (
    <div className="flex items-baseline gap-s-2">
      <span className="text-small min-w-0 flex-1 truncate font-medium">
        {CLASS_LABELS[serviceClass] ?? serviceClass}
        <span className="text-ink-muted"> · {seats} places</span>
      </span>
      <span className="tabular text-small shrink-0 font-semibold">
        {xafFormatter.format(unitPrice)} FCFA
      </span>
    </div>
  )
}
