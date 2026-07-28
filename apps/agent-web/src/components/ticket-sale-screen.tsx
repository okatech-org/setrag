"use client"

import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CreditCard,
  TrainFront,
  UserRound,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  DEMO_DASHBOARD,
  DEMO_SEATS,
  DEMO_STATIONS,
  DEMO_TRIPS,
  type SalePassenger,
  type SeatMapItem,
  type SellerDashboardData,
  type ServiceClass,
  type StationSummary,
  type TripSearchResult,
} from "@/lib/agent-data"
import { formatTime } from "@/lib/format"
import { saveTicketSaleDraft } from "@/lib/sale-draft"
import { SeatMapDialog } from "./seat-map-dialog"
import { SellerShell } from "./seller-shell"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export interface TicketSearchCriteria {
  originStationId: string
  destinationStationId: string
  serviceDate: string
  passengers: number
}

interface TicketSearchFormProps {
  stations: StationSummary[]
  disabled?: boolean
  onSearch: (criteria: TicketSearchCriteria) => void
}

function defaultServiceDate() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function TicketSearchForm({
  stations,
  disabled,
  onSearch,
}: TicketSearchFormProps) {
  const [origin, setOrigin] = useState(stations[0]?.id ?? "")
  const [destination, setDestination] = useState(stations.at(-1)?.id ?? "")
  const [serviceDate, setServiceDate] = useState(defaultServiceDate)
  const [passengers, setPassengers] = useState("1")
  const [error, setError] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!origin || !destination) {
      setError("Sélectionnez une gare de départ et une gare d’arrivée.")
      return
    }
    if (origin === destination) {
      setError("Les gares de départ et d’arrivée doivent être différentes.")
      return
    }
    const count = Number(passengers)
    if (!Number.isInteger(count) || count < 1 || count > 9) {
      setError("Le nombre de voyageurs doit être compris entre 1 et 9.")
      return
    }
    setError("")
    onSearch({
      originStationId: origin,
      destinationStationId: destination,
      serviceDate,
      passengers: count,
    })
  }

  return (
    <Card className="min-w-0 gap-5 p-4 shadow-none sm:p-5">
      <form className="grid min-w-0 gap-4 lg:grid-cols-4" onSubmit={submit}>
        <Field label="Gare de départ" htmlFor="origin-station">
          <SelectNative
            id="origin-station"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            disabled={disabled}
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name} ({station.code})
              </option>
            ))}
          </SelectNative>
        </Field>

        <Field label="Gare d’arrivée" htmlFor="destination-station">
          <SelectNative
            id="destination-station"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            disabled={disabled}
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name} ({station.code})
              </option>
            ))}
          </SelectNative>
        </Field>

        <Field label="Date de voyage" htmlFor="service-date">
          <Input
            id="service-date"
            type="date"
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
            disabled={disabled}
            required
          />
        </Field>

        <Field label="Voyageurs" htmlFor="passengers">
          <Input
            id="passengers"
            type="number"
            min={1}
            max={9}
            inputMode="numeric"
            value={passengers}
            onChange={(event) => setPassengers(event.target.value)}
            disabled={disabled}
            required
          />
        </Field>

        {error ? (
          <InlineMessage
            className="lg:col-span-4"
            tone="danger"
            title="Recherche impossible."
          >
            {error}
          </InlineMessage>
        ) : null}

        <div className="flex min-w-0 justify-end lg:col-span-4">
          <Button
            type="submit"
            size="lg"
            disabled={disabled}
            className="h-auto min-h-13 w-full min-w-0 py-3 text-center whitespace-normal sm:w-auto"
          >
            Rechercher les dessertes
            <ArrowRight />
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function TripSearchResults({
  results,
  loading,
  searched,
  onSelect,
}: {
  results: TripSearchResult[]
  loading: boolean
  searched: boolean
  onSelect: (trip: TripSearchResult) => void
}) {
  if (loading) {
    return (
      <p role="status" className="text-small py-8 text-center text-ink-muted">
        Recherche des dessertes et des disponibilités…
      </p>
    )
  }
  if (!searched) {
    return (
      <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none">
        <CalendarDays className="size-8 text-accent-ink" />
        <p className="font-semibold">Renseignez le trajet du voyageur.</p>
        <p className="text-small max-w-lg text-ink-muted">
          Les disponibilités affichées proviennent de l’inventaire Convex et
          couvrent l’intégralité du segment demandé.
        </p>
      </Card>
    )
  }
  if (results.length === 0) {
    return (
      <InlineMessage tone="warning" title="Aucune desserte disponible.">
        Essayez une autre date ou un autre trajet.
      </InlineMessage>
    )
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-small font-semibold">
        {results.length} desserte(s) disponible(s)
      </p>
      {results.map((result) => (
        <Card
          key={result.id}
          className="grid min-w-0 gap-5 p-4 shadow-none sm:p-5 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <span className="flex size-11 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
              <TrainFront />
            </span>
            <div>
              <p className="text-h4">{result.trainNumber}</p>
              <p className="text-small text-ink-muted">{result.trainType}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <p className="tabular text-time">
                {formatTime(result.departureAt)}
              </p>
              <p className="text-caption text-ink-muted">départ</p>
            </div>
            <ArrowRight className="size-5 text-ink-muted" />
            <div>
              <p className="tabular text-time">
                {formatTime(result.arrivalAt)}
              </p>
              <p className="text-caption text-ink-muted">arrivée</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
            {Object.entries(result.availableByClass).map(
              ([serviceClass, available]) => (
                <Badge
                  key={serviceClass}
                  variant={available > 0 ? "success" : "secondary"}
                >
                  {serviceClass.toLowerCase()} · {available}
                </Badge>
              )
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!result.hasAvailability}
              onClick={() => onSelect(result)}
            >
              Choisir {result.trainNumber}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

interface CounterSaleQuote {
  distanceKm: number
  available: number
  hasAvailability: boolean
  totalTtc: number
  lines: Array<{
    unitPriceTtc: number
    quotaLabel?: string
    appliedRules: string[]
  }>
}

export function PassengerDetails({
  passengers,
  onChange,
}: {
  passengers: SalePassenger[]
  onChange: (index: number, passenger: SalePassenger) => void
}) {
  return (
    <div className="grid gap-3">
      {passengers.map((passenger, index) => (
        <Card key={index} className="gap-4 p-5 shadow-none">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <UserRound />
            </span>
            <h3 className="text-h4">Voyageur {index + 1}</h3>
            {passenger.seatLabel ? (
              <Badge variant="success" className="ml-auto">
                place {passenger.seatLabel}
              </Badge>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Nom" htmlFor={`passenger-${index}-last-name`}>
              <Input
                id={`passenger-${index}-last-name`}
                value={passenger.lastName}
                autoComplete="family-name"
                required
                onChange={(event) =>
                  onChange(index, {
                    ...passenger,
                    lastName: event.target.value.toUpperCase(),
                  })
                }
              />
            </Field>
            <Field label="Prénom" htmlFor={`passenger-${index}-first-name`}>
              <Input
                id={`passenger-${index}-first-name`}
                value={passenger.firstName}
                autoComplete="given-name"
                required
                onChange={(event) =>
                  onChange(index, {
                    ...passenger,
                    firstName: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Genre" htmlFor={`passenger-${index}-gender`}>
              <SelectNative
                id={`passenger-${index}-gender`}
                value={passenger.gender}
                onChange={(event) =>
                  onChange(index, {
                    ...passenger,
                    gender: event.target.value as "M" | "F",
                  })
                }
              >
                <option value="F">Femme</option>
                <option value="M">Homme</option>
              </SelectNative>
            </Field>
            <Field
              label="Téléphone d’urgence"
              htmlFor={`passenger-${index}-emergency`}
              hint="Recommandé pour prévenir un proche."
            >
              <Input
                id={`passenger-${index}-emergency`}
                type="tel"
                value={passenger.emergencyPhone ?? ""}
                placeholder="+241 06…"
                onChange={(event) =>
                  onChange(index, {
                    ...passenger,
                    emergencyPhone: event.target.value,
                  })
                }
              />
            </Field>
          </div>
        </Card>
      ))}
    </div>
  )
}

interface TicketSaleScreenProps {
  dashboard: SellerDashboardData
  stations: StationSummary[]
  results: TripSearchResult[]
  loading: boolean
  searched: boolean
  online: boolean
  selectedTrip?: TripSearchResult
  serviceClass: ServiceClass
  passengers: SalePassenger[]
  quote?: CounterSaleQuote
  quoteLoading?: boolean
  seats: SeatMapItem[]
  seatsLoading?: boolean
  seatDialogOpen: boolean
  onSearch: (criteria: TicketSearchCriteria) => void
  onSelectTrip: (trip: TripSearchResult) => void
  onServiceClassChange: (serviceClass: ServiceClass) => void
  onPassengerChange: (index: number, passenger: SalePassenger) => void
  onSeatDialogOpenChange: (open: boolean) => void
  onSeatsConfirm: (seatIds: string[]) => void
  onContinue: () => void
  onSignOut?: () => void
}

export function TicketSaleScreen({
  dashboard,
  stations,
  results,
  loading,
  searched,
  online,
  selectedTrip,
  serviceClass,
  passengers,
  quote,
  quoteLoading,
  seats,
  seatsLoading,
  seatDialogOpen,
  onSearch,
  onSelectTrip,
  onServiceClassChange,
  onPassengerChange,
  onSeatDialogOpenChange,
  onSeatsConfirm,
  onContinue,
  onSignOut,
}: TicketSaleScreenProps) {
  const disabled = !online || !dashboard.session
  const passengersComplete = passengers.every(
    (passenger) => passenger.firstName.trim() && passenger.lastName.trim()
  )
  const selectedSeatIds = passengers
    .map((passenger) => passenger.seatId)
    .filter((seatId): seatId is string => seatId !== undefined)

  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid w-full max-w-[1440px] min-w-0 gap-6">
        <header className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-4">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal"
          >
            <Link href={"/vente" as Route}>
              <ArrowLeft />
              Accueil vendeur
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <span className="text-mono-label text-accent-ink">AW-V-02</span>
            <h1 className="text-h2 mt-1">Billet voyageur</h1>
            <p className="text-small mt-2 text-ink-muted">
              Étape 1 sur 4 · trajet et desserte
            </p>
          </div>
        </header>

        {disabled ? (
          <InlineMessage
            tone="warning"
            title={
              !online
                ? "Le système central est hors ligne."
                : "La caisse est fermée."
            }
          >
            Revenez à l’accueil et rétablissez les conditions de vente avant de
            créer un billet.
          </InlineMessage>
        ) : null}

        <section aria-labelledby="trip-search-heading" className="grid gap-3">
          <h2 id="trip-search-heading" className="text-h4">
            Trajet demandé
          </h2>
          <TicketSearchForm
            stations={stations}
            disabled={disabled}
            onSearch={onSearch}
          />
        </section>

        <section aria-labelledby="trip-results-heading" className="grid gap-3">
          <h2 id="trip-results-heading" className="text-h4">
            Dessertes et disponibilités
          </h2>
          <TripSearchResults
            results={results}
            loading={loading}
            searched={searched}
            onSelect={onSelectTrip}
          />
        </section>

        {selectedTrip ? (
          <>
            <section
              aria-labelledby="ticket-options-heading"
              className="grid min-w-0 gap-3"
            >
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-mono-label text-accent-ink">
                    {selectedTrip.trainNumber} sélectionné.
                  </span>
                  <h2 id="ticket-options-heading" className="text-h4 mt-1">
                    Classe et voyageurs
                  </h2>
                </div>
                <div
                  className="flex min-w-0 flex-wrap gap-2"
                  role="group"
                  aria-label="Classe de voyage"
                >
                  {(
                    [
                      ["DEUXIEME", "2e classe"],
                      ["PREMIERE", "1re classe"],
                      ["VIP", "VIP"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={serviceClass === value ? "primary" : "secondary"}
                      disabled={
                        (selectedTrip.availableByClass[value] ?? 0) <
                        passengers.length
                      }
                      onClick={() => onServiceClassChange(value)}
                    >
                      {label} · {selectedTrip.availableByClass[value] ?? 0}
                    </Button>
                  ))}
                </div>
              </div>

              <PassengerDetails
                passengers={passengers}
                onChange={onPassengerChange}
              />
            </section>

            <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <Card className="gap-4 p-5 shadow-none">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                    <Armchair />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-h4">Places</h2>
                    <p className="text-small text-ink-muted">
                      {selectedSeatIds.length === passengers.length
                        ? passengers
                            .map(
                              (passenger) =>
                                passenger.seatLabel ?? "automatique"
                            )
                            .join(" · ")
                        : "Attribution automatique par défaut"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onSeatDialogOpenChange(true)}
                  className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
                >
                  Choisir sur le plan de voiture
                </Button>
              </Card>

              <Card
                data-theme="dark"
                className="gap-4 border-0 bg-[oklch(0.24_0.058_257)] p-5 text-ink shadow-none"
              >
                <span className="text-mono-label text-ink-muted">
                  Devis guichet
                </span>
                {quoteLoading ? (
                  <p role="status" className="text-small text-ink-muted">
                    Calcul du tarif et du yield…
                  </p>
                ) : quote ? (
                  <>
                    <div className="flex min-w-0 flex-wrap items-end gap-3">
                      <strong className="tabular text-h1 break-words text-ink">
                        {quote.totalTtc.toLocaleString("fr-FR")} FCFA
                      </strong>
                      <span className="text-small pb-1 text-ink-muted">
                        TTC · {quote.distanceKm} km
                      </span>
                    </div>
                    <p className="text-caption text-ink-muted">
                      {quote.lines
                        .map(
                          (line, index) =>
                            `V${index + 1} ${line.unitPriceTtc.toLocaleString("fr-FR")} FCFA`
                        )
                        .join(" · ")}
                    </p>
                  </>
                ) : (
                  <p className="text-small text-warning">
                    Tarif momentanément indisponible.
                  </p>
                )}
              </Card>
            </section>

            {!passengersComplete ? (
              <InlineMessage
                tone="warning"
                title="Identité des voyageurs incomplète."
              >
                Le nom et le prénom sont obligatoires avant l’encaissement.
              </InlineMessage>
            ) : null}

            <div className="flex min-w-0 justify-end border-t border-line pt-5">
              <Button
                type="button"
                size="lg"
                disabled={
                  disabled || !passengersComplete || !quote?.hasAvailability
                }
                onClick={onContinue}
                className="h-auto min-h-13 min-w-0 py-3 text-center whitespace-normal"
              >
                Passer à l’encaissement
                <CreditCard />
              </Button>
            </div>

            {seatDialogOpen ? (
              <SeatMapDialog
                open
                seats={seats}
                requiredCount={passengers.length}
                initialSelection={selectedSeatIds}
                loading={seatsLoading}
                onOpenChange={onSeatDialogOpenChange}
                onConfirm={onSeatsConfirm}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </SellerShell>
  )
}

export function TicketSalePageClient() {
  const router = useRouter()
  const online = useOnlineStatus()
  const { isAuthenticated, isLoading } = useAuth()
  const [criteria, setCriteria] = useState<TicketSearchCriteria | null>(null)
  const [selectedTrip, setSelectedTrip] = useState<
    TripSearchResult | undefined
  >()
  const [serviceClass, setServiceClass] = useState<ServiceClass>("DEUXIEME")
  const [passengers, setPassengers] = useState<SalePassenger[]>([])
  const [seatDialogOpen, setSeatDialogOpen] = useState(false)
  const liveDashboard = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const liveStations = useQuery(
    api.functions.referential.listStations,
    E2E_MODE ? "skip" : { includeInactive: false }
  )
  const liveTrips = useQuery(
    api.functions.trips.search,
    E2E_MODE || !criteria
      ? "skip"
      : {
          originStationId: criteria.originStationId as never,
          destinationStationId: criteria.destinationStationId as never,
          serviceDate: criteria.serviceDate,
          passengers: criteria.passengers,
        }
  )
  const liveQuote = useQuery(
    api.functions.sales.quoteCounterSale,
    E2E_MODE || !criteria || !selectedTrip
      ? "skip"
      : {
          tripId: selectedTrip.id as never,
          originStationId: criteria.originStationId as never,
          destinationStationId: criteria.destinationStationId as never,
          serviceClass,
          passengerCount: passengers.length,
          discountCodes: passengers.map(
            (passenger) => passenger.discountCode ?? ""
          ),
        }
  )
  const liveSeats = useQuery(
    api.functions.trips.availableSeats,
    E2E_MODE || !selectedTrip
      ? "skip"
      : {
          tripId: selectedTrip.id as never,
          fromIndex: selectedTrip.fromIndex,
          toIndex: selectedTrip.toIndex,
          serviceClass,
        }
  )

  useEffect(() => {
    if (!E2E_MODE && !isLoading && !isAuthenticated) {
      router.replace("/connexion")
    }
  }, [isAuthenticated, isLoading, router])

  const dashboard = E2E_MODE
    ? DEMO_DASHBOARD
    : (liveDashboard as SellerDashboardData | undefined)
  const stations: StationSummary[] = E2E_MODE
    ? DEMO_STATIONS
    : (liveStations ?? []).map(
        (station: { _id: string; code: string; name: string }) => ({
          id: station._id,
          code: station.code,
          name: station.name,
        })
      )
  const results: TripSearchResult[] = E2E_MODE
    ? criteria
      ? DEMO_TRIPS
      : []
    : (liveTrips ?? []).map(
        (result: {
          trip: {
            _id: string
            trainNumber: string
            trainType: string
            serviceDate: string
          }
          departureAt: number
          arrivalAt: number
          fromIndex: number
          toIndex: number
          distanceKm: number
          availableByClass: Record<string, number>
          hasAvailability: boolean
        }) => ({
          id: result.trip._id,
          trainNumber: result.trip.trainNumber,
          trainType: result.trip.trainType,
          serviceDate: result.trip.serviceDate,
          departureAt: result.departureAt,
          arrivalAt: result.arrivalAt,
          fromIndex: result.fromIndex,
          toIndex: result.toIndex,
          distanceKm: result.distanceKm,
          availableByClass: result.availableByClass,
          hasAvailability: result.hasAvailability,
        })
      )
  const quote: CounterSaleQuote | undefined =
    E2E_MODE && selectedTrip
      ? {
          distanceKm: selectedTrip.distanceKm,
          available: selectedTrip.availableByClass[serviceClass] ?? 0,
          hasAvailability:
            (selectedTrip.availableByClass[serviceClass] ?? 0) >=
            passengers.length,
          totalTtc: passengers.length * 23_417,
          lines: passengers.map(() => ({
            unitPriceTtc: 23_417,
            appliedRules: ["tarif_guichet"],
          })),
        }
      : (liveQuote as CounterSaleQuote | undefined)
  const seats = E2E_MODE
    ? DEMO_SEATS.map((seat) => ({ ...seat, serviceClass }))
    : ((liveSeats ?? []) as SeatMapItem[])

  if (!dashboard || (!E2E_MODE && liveStations === undefined)) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p role="status" className="text-small text-ink-muted">
          Préparation de la vente…
        </p>
      </main>
    )
  }

  return (
    <TicketSaleScreen
      dashboard={dashboard}
      stations={stations}
      results={results}
      searched={criteria !== null}
      loading={!E2E_MODE && criteria !== null && liveTrips === undefined}
      online={online}
      selectedTrip={selectedTrip}
      onSearch={(nextCriteria) => {
        setSelectedTrip(undefined)
        setPassengers(
          Array.from({ length: nextCriteria.passengers }, () => ({
            firstName: "",
            lastName: "",
            gender: "F" as const,
          }))
        )
        setServiceClass("DEUXIEME")
        setCriteria(nextCriteria)
      }}
      onSelectTrip={(trip) => {
        const availableClass =
          (trip.availableByClass.DEUXIEME ?? 0) >= passengers.length
            ? "DEUXIEME"
            : ((["PREMIERE", "VIP"] as const).find(
                (candidate) =>
                  (trip.availableByClass[candidate] ?? 0) >= passengers.length
              ) ?? "DEUXIEME")
        setServiceClass(availableClass)
        setSelectedTrip(trip)
      }}
      serviceClass={serviceClass}
      passengers={passengers}
      quote={quote}
      quoteLoading={
        !E2E_MODE && selectedTrip !== undefined && liveQuote === undefined
      }
      seats={seats}
      seatsLoading={
        !E2E_MODE && selectedTrip !== undefined && liveSeats === undefined
      }
      seatDialogOpen={seatDialogOpen}
      onServiceClassChange={(nextClass) => {
        setServiceClass(nextClass)
        setPassengers((current) =>
          current.map((passenger) => ({
            ...passenger,
            seatId: undefined,
            seatLabel: undefined,
          }))
        )
      }}
      onPassengerChange={(index, passenger) =>
        setPassengers((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? passenger : item
          )
        )
      }
      onSeatDialogOpenChange={setSeatDialogOpen}
      onSeatsConfirm={(seatIds) =>
        setPassengers((current) =>
          current.map((passenger, index) => {
            const seatId = seatIds[index]
            const seat = seats.find((candidate) => candidate.seatId === seatId)
            return {
              ...passenger,
              seatId,
              seatLabel: seat?.label,
            }
          })
        )
      }
      onContinue={() => {
        if (!criteria || !selectedTrip || !quote) return
        const origin = stations.find(
          (station) => station.id === criteria.originStationId
        )
        const destination = stations.find(
          (station) => station.id === criteria.destinationStationId
        )
        if (!origin || !destination) return
        saveTicketSaleDraft({
          tripId: selectedTrip.id,
          trainNumber: selectedTrip.trainNumber,
          trainType: selectedTrip.trainType,
          serviceDate: selectedTrip.serviceDate,
          departureAt: selectedTrip.departureAt,
          arrivalAt: selectedTrip.arrivalAt,
          originStationId: origin.id,
          originName: origin.name,
          originCode: origin.code,
          destinationStationId: destination.id,
          destinationName: destination.name,
          destinationCode: destination.code,
          fromIndex: selectedTrip.fromIndex,
          toIndex: selectedTrip.toIndex,
          serviceClass,
          passengers,
          distanceKm: quote.distanceKm,
          totalTtc: quote.totalTtc,
        })
        router.push("/vente/encaissement" as Route)
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        router.replace("/connexion")
      }}
    />
  )
}
