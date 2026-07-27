"use client"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { TripResultCard } from "@workspace/ui/components/voyage/trip-result-card"

import type {
  ResultTrip,
  Sort,
  useTripResults,
} from "@/features/resultats/use-trip-results"
import { ticketingStorage, type SearchDraft } from "@/lib/ticketing"

/** Liste des dessertes, au format bureau : une carte large par circulation. */
export function TripResultsDesktop({
  results,
}: {
  results: ReturnType<typeof useTripResults>
}) {
  return (
    <div className="hidden gap-5 md:grid">
      <div className="flex items-center justify-between gap-4">
        <span className="text-small font-medium text-ink-muted">
          {results.trips.length} dessertes disponibles
        </span>
        <label className="text-small flex items-center gap-2 font-medium">
          Trier par
          <select
            aria-label="Trier les résultats"
            value={results.sort}
            onChange={(event) => results.setSort(event.target.value as Sort)}
            className="min-h-target rounded-md border border-line-strong bg-surface px-3"
          >
            <option value="horaire">Horaire</option>
            <option value="duree">Durée</option>
            <option value="prix">Prix</option>
          </select>
        </label>
      </div>
      {results.trips.map((trip) => (
        <DesktopTripCard
          key={trip.tripId}
          trip={trip}
          search={results.search}
          canQuery={results.canQuery}
        />
      ))}
      <p className="text-caption text-ink-muted">
        Disponibilité calculée sur chaque segment. Le prix est figé pendant 15
        minutes à la réservation.
      </p>
    </div>
  )
}

function DesktopTripCard({
  trip,
  search,
  canQuery,
}: {
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
          serviceClass: "DEUXIEME",
          passengerCount: trip.passengers,
          discountCodes: [
            ...Array(search.adults).fill(""),
            ...Array(search.children).fill("ENFANT"),
          ],
        }
      : "skip"
  )

  const displayed = {
    ...trip,
    priceXaf: quote
      ? Math.round(quote.totalTtc / trip.passengers)
      : trip.priceXaf,
    available: quote?.available ?? trip.available,
  }

  return (
    <TripResultCard
      departureAt={displayed.departureAt}
      arrivalAt={displayed.arrivalAt}
      durationMinutes={(displayed.arrivalAt - displayed.departureAt) / 60_000}
      originLabel={displayed.originName}
      destinationLabel={displayed.destinationName}
      priceXaf={displayed.priceXaf}
      priceNote="à partir de · par voyageur"
      actionLabel={`Choisir ${displayed.trainNumber}`}
      actionHref={`/reservation?trip=${displayed.tripId}`}
      tags={[
        { label: displayed.trainNumber, tone: "info" },
        { label: displayed.trainType === "EXPRESS" ? "Express" : "Omnibus" },
        {
          label: `${displayed.available} places`,
          tone: displayed.available < 10 ? "warning" : "success",
        },
      ]}
      onSelect={() => ticketingStorage.setTrip(displayed)}
    />
  )
}
