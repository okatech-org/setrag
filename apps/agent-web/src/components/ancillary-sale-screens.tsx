"use client"

import { ArrowLeft, CarFront, PackagePlus, Search, Trash2 } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ReactNode, useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  DEMO_DASHBOARD,
  DEMO_STATIONS,
  type SellerDashboardData,
  type StationSummary,
} from "@/lib/agent-data"
import { formatXaf } from "@/lib/format"
import { SellerShell } from "./seller-shell"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

interface TicketLookupResult {
  id: string
  number: string
  passengerName: string
  originCode: string
  destinationCode: string
  trainNumber: string
  distanceKm: number
  status: string
}

function AncillaryFrame({
  dashboard,
  online,
  code,
  title,
  children,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  online: boolean
  code: string
  title: string
  children: ReactNode
  onSignOut?: () => void
}) {
  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
        <header className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-4">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal"
          >
            <Link href={"/vente" as Route}>
              <ArrowLeft />
              Abandonner
            </Link>
          </Button>
          <div className="min-w-0">
            <span className="text-mono-label text-accent-ink">{code}</span>
            <h1 className="text-h2 mt-1">{title}</h1>
          </div>
        </header>
        {!online || !dashboard.session ? (
          <InlineMessage tone="warning" title="Vente indisponible.">
            La connexion centrale et une caisse ouverte sont obligatoires.
          </InlineMessage>
        ) : null}
        {children}
      </div>
    </SellerShell>
  )
}

export function BaggageSaleScreen({
  dashboard,
  online,
  ticket,
  quote,
  pending,
  result,
  error,
  onLookup,
  onWeightChange,
  onSell,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  online: boolean
  ticket: TicketLookupResult | null
  quote?: { distanceKm: number; totalTtc: number }
  pending: boolean
  result?: { tagNumber: string; totalTtc: number }
  error?: string
  onLookup: (number: string) => void
  onWeightChange?: (weightKg: number) => void
  onSell: (input: {
    weightKg: number
    senderName: string
    recipientName?: string
  }) => Promise<void>
  onSignOut?: () => void
}) {
  const [number, setNumber] = useState("B-4821")
  const [weight, setWeight] = useState("12")
  const [sender, setSender] = useState("MBADINGA Paul")
  const [recipient, setRecipient] = useState("")
  const overweight = Number(weight) > 30

  return (
    <AncillaryFrame
      dashboard={dashboard}
      online={online}
      code="AW-V-04"
      title="Bagage"
      onSignOut={onSignOut}
    >
      <Card className="gap-4 p-5 shadow-none">
        <Field
          label="Billet voyageur de rattachement"
          htmlFor="baggage-ticket"
          hint="Obligatoire : le trajet et la distance sont hérités du billet."
        >
          <div className="flex flex-wrap gap-2">
            <Input
              id="baggage-ticket"
              className="min-w-56 flex-1"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => onLookup(number)}
            >
              <Search />
              Rechercher
            </Button>
          </div>
        </Field>
        {ticket ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-accent-soft p-4">
            <div className="min-w-0 flex-1">
              <strong>{ticket.passengerName}</strong>
              <p className="text-small text-accent-ink">
                {ticket.originCode} → {ticket.destinationCode} ·{" "}
                {ticket.trainNumber} · {ticket.distanceKm} km
              </p>
            </div>
            <Badge variant="success">billet {ticket.status}</Badge>
          </div>
        ) : (
          <InlineMessage
            tone="info"
            title="Saisissez d’abord le billet du voyageur."
          >
            Le formulaire reste inactif tant que le billet n’est pas validé.
          </InlineMessage>
        )}
      </Card>

      <form
        className="grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          await onSell({
            weightKg: Number(weight),
            senderName: sender,
            recipientName: recipient || undefined,
          })
        }}
      >
        <Card className="grid gap-4 p-5 shadow-none md:grid-cols-2">
          <Field label="Poids (kg) · maximum 30" htmlFor="baggage-weight">
            <Input
              id="baggage-weight"
              type="number"
              min={0.1}
              max={30}
              step={0.1}
              value={weight}
              disabled={!ticket}
              onChange={(event) => {
                setWeight(event.target.value)
                onWeightChange?.(Number(event.target.value))
              }}
            />
          </Field>
          <Field label="Code tarifaire" htmlFor="baggage-fare">
            <SelectNative id="baggage-fare" disabled={!ticket}>
              <option>Général — franchise 0 kg</option>
              <option>Agent SETRAG — franchise 20 kg</option>
              <option>Groupe — franchise 10 kg</option>
            </SelectNative>
          </Field>
          <Field label="Expéditeur" htmlFor="baggage-sender">
            <Input
              id="baggage-sender"
              value={sender}
              disabled={!ticket}
              onChange={(event) => setSender(event.target.value)}
              required
            />
          </Field>
          <Field label="Destinataire" htmlFor="baggage-recipient">
            <Input
              id="baggage-recipient"
              value={recipient}
              disabled={!ticket}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </Field>
          {overweight ? (
            <InlineMessage
              className="md:col-span-2"
              tone="danger"
              title="Au-delà de 30 kg, ce n’est plus un bagage."
            >
              Orientez le client vers le colis express.
            </InlineMessage>
          ) : null}
        </Card>
        <SaleFooter
          total={quote?.totalTtc}
          pending={pending}
          disabled={!ticket || overweight}
          result={result && `Étiquette ${result.tagNumber} émise`}
          error={error}
        />
      </form>
    </AncillaryFrame>
  )
}

interface ParcelItem {
  description: string
  weightKg: number
}

export function ParcelSaleScreen({
  dashboard,
  stations,
  online,
  quote,
  pending,
  result,
  error,
  onQuoteInput,
  onSell,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  stations: StationSummary[]
  online: boolean
  quote?: { zone: number; distanceKm: number; totalTtc: number }
  pending: boolean
  result?: { shipmentNumber: string }
  error?: string
  onQuoteInput: (
    originId: string,
    destinationId: string,
    items: ParcelItem[]
  ) => void
  onSell: (input: {
    originId: string
    destinationId: string
    senderName: string
    senderPhone: string
    recipientName: string
    recipientPhone: string
    items: ParcelItem[]
  }) => Promise<void>
  onSignOut?: () => void
}) {
  const [originId, setOriginId] = useState(stations[0]?.id ?? "")
  const [destinationId, setDestinationId] = useState(stations.at(-1)?.id ?? "")
  const [senderName, setSenderName] = useState("")
  const [senderPhone, setSenderPhone] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [recipientPhone, setRecipientPhone] = useState("")
  const [items, setItems] = useState<ParcelItem[]>([
    { description: "Carton scellé", weightKg: 18 },
  ])

  function updateItems(next: ParcelItem[]) {
    setItems(next)
    onQuoteInput(originId, destinationId, next)
  }

  return (
    <AncillaryFrame
      dashboard={dashboard}
      online={online}
      code="AW-V-05"
      title="Colis express"
      onSignOut={onSignOut}
    >
      <form
        className="grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          await onSell({
            originId,
            destinationId,
            senderName,
            senderPhone,
            recipientName,
            recipientPhone,
            items,
          })
        }}
      >
        <Card className="grid gap-4 p-5 shadow-none md:grid-cols-2">
          <Field label="Gare de départ" htmlFor="parcel-origin">
            <SelectNative
              id="parcel-origin"
              value={originId}
              onChange={(event) => {
                setOriginId(event.target.value)
                onQuoteInput(event.target.value, destinationId, items)
              }}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Gare d’arrivée" htmlFor="parcel-destination">
            <SelectNative
              id="parcel-destination"
              value={destinationId}
              onChange={(event) => {
                setDestinationId(event.target.value)
                onQuoteInput(originId, event.target.value, items)
              }}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Expéditeur · nom" htmlFor="parcel-sender">
            <Input
              id="parcel-sender"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              required
            />
          </Field>
          <Field label="Téléphone expéditeur" htmlFor="parcel-sender-phone">
            <Input
              id="parcel-sender-phone"
              type="tel"
              value={senderPhone}
              onChange={(event) => setSenderPhone(event.target.value)}
              required
            />
          </Field>
          <Field label="Destinataire · nom" htmlFor="parcel-recipient">
            <Input
              id="parcel-recipient"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              required
            />
          </Field>
          <Field
            label="Téléphone destinataire"
            htmlFor="parcel-recipient-phone"
          >
            <Input
              id="parcel-recipient-phone"
              type="tel"
              value={recipientPhone}
              onChange={(event) => setRecipientPhone(event.target.value)}
              required
            />
          </Field>
        </Card>

        <Card className="gap-4 p-5 shadow-none">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h4">Articles</h2>
            {quote ? (
              <Badge variant="secondary">
                zone {quote.zone} · {quote.distanceKm} km
              </Badge>
            ) : null}
          </div>
          {items.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[1fr_160px_auto]"
            >
              <Field
                label={`Description article ${index + 1}`}
                htmlFor={`parcel-description-${index}`}
              >
                <Input
                  id={`parcel-description-${index}`}
                  value={item.description}
                  onChange={(event) =>
                    updateItems(
                      items.map((candidate, itemIndex) =>
                        itemIndex === index
                          ? { ...candidate, description: event.target.value }
                          : candidate
                      )
                    )
                  }
                  required
                />
              </Field>
              <Field label="Poids (kg)" htmlFor={`parcel-weight-${index}`}>
                <Input
                  id={`parcel-weight-${index}`}
                  type="number"
                  min={0.1}
                  max={100}
                  step={0.1}
                  value={item.weightKg}
                  onChange={(event) =>
                    updateItems(
                      items.map((candidate, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...candidate,
                              weightKg: Number(event.target.value),
                            }
                          : candidate
                      )
                    )
                  }
                  required
                />
              </Field>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Supprimer l’article ${index + 1}`}
                disabled={items.length === 1}
                onClick={() =>
                  updateItems(
                    items.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              updateItems([...items, { description: "", weightKg: 1 }])
            }
          >
            <PackagePlus />
            Ajouter un article
          </Button>
        </Card>
        <SaleFooter
          total={quote?.totalTtc}
          pending={pending}
          disabled={originId === destinationId}
          result={result && `Expédition ${result.shipmentNumber} enregistrée`}
          error={error}
        />
      </form>
    </AncillaryFrame>
  )
}

export function SpecialTransportScreen({
  dashboard,
  stations,
  online,
  initialType,
  pending,
  quote,
  result,
  error,
  onTypeChange,
  onTicketNumberChange,
  onRouteChange,
  onTonnageChange,
  onSell,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  stations: StationSummary[]
  online: boolean
  initialType: "auto" | "funeraire"
  pending: boolean
  quote?: { totalTtc: number }
  result?: string
  error?: string
  onTypeChange?: (type: "auto" | "funeraire") => void
  onTicketNumberChange?: (number: string) => void
  onRouteChange?: (originId: string, destinationId: string) => void
  onTonnageChange?: (tonnage: number) => void
  onSell: (input: {
    type: "auto" | "funeraire"
    ticketNumber: string
    originId: string
    destinationId: string
    tonnage: number
    senderName: string
  }) => Promise<void>
  onSignOut?: () => void
}) {
  const [type, setType] = useState(initialType)
  const [ticketNumber, setTicketNumber] = useState("B-4823")
  const [originId, setOriginId] = useState(stations[0]?.id ?? "")
  const [destinationId, setDestinationId] = useState(stations.at(-1)?.id ?? "")
  const [tonnage, setTonnage] = useState("1.4")
  const [senderName, setSenderName] = useState("MBADINGA Paul")

  return (
    <AncillaryFrame
      dashboard={dashboard}
      online={online}
      code="AW-V-06"
      title="Prestation spéciale"
      onSignOut={onSignOut}
    >
      <div
        className="grid min-w-0 gap-2 sm:flex sm:flex-wrap"
        role="group"
        aria-label="Type de prestation"
      >
        <Button
          type="button"
          variant={type === "auto" ? "primary" : "secondary"}
          onClick={() => {
            setType("auto")
            onTypeChange?.("auto")
          }}
          className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
        >
          <CarFront />
          Transport auto accompagné
        </Button>
        <Button
          type="button"
          variant={type === "funeraire" ? "primary" : "secondary"}
          onClick={() => {
            setType("funeraire")
            onTypeChange?.("funeraire")
          }}
          className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
        >
          Transport funéraire
        </Button>
      </div>
      <form
        className="grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          await onSell({
            type,
            ticketNumber,
            originId,
            destinationId,
            tonnage: Number(tonnage),
            senderName,
          })
        }}
      >
        <Card className="grid gap-4 p-5 shadow-none md:grid-cols-2">
          {type === "auto" ? (
            <Field
              className="md:col-span-2"
              label="Billet voyageur de rattachement"
              htmlFor="special-ticket"
              hint="Obligatoire : le véhicule suit son propriétaire."
            >
              <Input
                id="special-ticket"
                value={ticketNumber}
                onChange={(event) => {
                  setTicketNumber(event.target.value)
                  onTicketNumberChange?.(event.target.value)
                }}
                required
              />
            </Field>
          ) : (
            <InlineMessage
              className="md:col-span-2"
              tone="info"
              title="Pièces administratives exigées."
            >
              Autorisation de transport de corps, certificat de décès et
              laissez-passer mortuaire.
            </InlineMessage>
          )}
          <Field label="Gare de départ" htmlFor="special-origin">
            <SelectNative
              id="special-origin"
              value={originId}
              disabled={type === "auto"}
              onChange={(event) => {
                setOriginId(event.target.value)
                onRouteChange?.(event.target.value, destinationId)
              }}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Gare d’arrivée" htmlFor="special-destination">
            <SelectNative
              id="special-destination"
              value={destinationId}
              disabled={type === "auto"}
              onChange={(event) => {
                setDestinationId(event.target.value)
                onRouteChange?.(originId, event.target.value)
              }}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Tonnage" htmlFor="special-tonnage">
            <Input
              id="special-tonnage"
              type="number"
              min={0.1}
              step={0.1}
              value={tonnage}
              onChange={(event) => {
                setTonnage(event.target.value)
                onTonnageChange?.(Number(event.target.value))
              }}
              required
            />
          </Field>
          <Field label="Expéditeur" htmlFor="special-sender">
            <Input
              id="special-sender"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              required
            />
          </Field>
          <div className="rounded-md border border-dashed border-line-strong bg-surface-sunk p-4 md:col-span-2">
            <span className="text-mono-label text-ink-muted">
              Pièces jointes
            </span>
            <p className="text-small mt-1 text-ink-muted">
              Carte grise ou autorisation — dépôt optionnel. Le stockage des
              justificatifs sera activé avec le service documentaire.
            </p>
          </div>
        </Card>
        <SaleFooter
          total={quote?.totalTtc}
          pending={pending}
          disabled={
            (type === "auto" && !ticketNumber.trim()) ||
            (type === "funeraire" && originId === destinationId)
          }
          result={result}
          error={error}
        />
      </form>
    </AncillaryFrame>
  )
}

function SaleFooter({
  total,
  pending,
  disabled,
  result,
  error,
}: {
  total?: number
  pending: boolean
  disabled: boolean
  result?: string
  error?: string
}) {
  return (
    <Card className="min-w-0 gap-4 p-4 shadow-none sm:p-5">
      <div className="grid min-w-0 gap-4 sm:flex sm:flex-wrap sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <span className="text-mono-label text-ink-muted">Total TTC</span>
          <p className="tabular text-h1 break-words">
            {total === undefined ? "Calcul en cours…" : formatXaf(total)}
          </p>
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={disabled || pending}
          className="h-auto min-h-13 w-full min-w-0 py-3 text-center whitespace-normal sm:w-auto"
        >
          {pending ? "Enregistrement…" : "Enregistrer et encaisser"}
        </Button>
      </div>
      {result ? (
        <InlineMessage tone="success" title="Vente confirmée.">
          {result}
        </InlineMessage>
      ) : null}
      {error ? (
        <InlineMessage tone="danger" title="Vente impossible.">
          {error}
        </InlineMessage>
      ) : null}
    </Card>
  )
}

function useAncillaryRuntime() {
  const router = useRouter()
  const online = useOnlineStatus()
  const { isAuthenticated, isLoading } = useAuth()
  const liveDashboard = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const liveStations = useQuery(
    api.functions.referential.listStations,
    E2E_MODE ? "skip" : { includeInactive: false }
  )
  useEffect(() => {
    if (!E2E_MODE && !isLoading && !isAuthenticated) {
      router.replace("/connexion")
    }
  }, [isAuthenticated, isLoading, router])
  return {
    router,
    online,
    dashboard: E2E_MODE
      ? DEMO_DASHBOARD
      : (liveDashboard as SellerDashboardData | undefined),
    stations: E2E_MODE
      ? DEMO_STATIONS
      : (liveStations ?? []).map(
          (station: { _id: string; code: string; name: string }) => ({
            id: station._id,
            code: station.code,
            name: station.name,
          })
        ),
    stationsLoading: !E2E_MODE && liveStations === undefined,
  }
}

function LoadingSale() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p role="status">Préparation de la vente…</p>
    </main>
  )
}

export function BaggageSalePageClient() {
  const runtime = useAncillaryRuntime()
  const [lookupNumber, setLookupNumber] = useState("")
  const [weight, setWeight] = useState(12)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<
    { tagNumber: string; totalTtc: number } | undefined
  >()
  const sell = useMutation(api.functions.ancillaries.sellBaggage)
  const liveLookup = useQuery(
    api.functions.ancillaries.lookupTicket,
    E2E_MODE || !lookupNumber ? "skip" : { number: lookupNumber }
  )
  const ticket: TicketLookupResult | null = E2E_MODE
    ? lookupNumber
      ? {
          id: "ticket-demo-1",
          number: lookupNumber,
          passengerName: "Paul MBADINGA",
          originCode: "OWE",
          destinationCode: "FCV",
          trainNumber: "TR-201",
          distanceKm: 648,
          status: "valide",
        }
      : null
    : liveLookup
      ? {
          id: liveLookup.ticket._id,
          number: liveLookup.ticket.number,
          passengerName: `${liveLookup.ticket.passenger.firstName} ${liveLookup.ticket.passenger.lastName}`,
          originCode: liveLookup.origin?.code ?? "",
          destinationCode: liveLookup.destination?.code ?? "",
          trainNumber: liveLookup.trip?.trainNumber ?? "",
          distanceKm: Math.abs(
            (liveLookup.destination?.kilometerPoint ?? 0) -
              (liveLookup.origin?.kilometerPoint ?? 0)
          ),
          status: liveLookup.ticket.status,
        }
      : null
  const liveQuote = useQuery(
    api.functions.ancillaries.quoteBaggage,
    E2E_MODE || !ticket
      ? "skip"
      : { ticketId: ticket.id as never, weightKg: weight }
  )
  if (!runtime.dashboard || runtime.stationsLoading) return <LoadingSale />
  return (
    <BaggageSaleScreen
      dashboard={runtime.dashboard}
      online={runtime.online}
      ticket={ticket}
      quote={
        E2E_MODE && ticket ? { distanceKm: 648, totalTtc: 833 } : liveQuote
      }
      pending={pending}
      result={result}
      error={error}
      onLookup={setLookupNumber}
      onWeightChange={setWeight}
      onSell={async (input) => {
        if (!ticket) return
        setPending(true)
        setError("")
        try {
          const sold = E2E_MODE
            ? { tagNumber: "G-OWE-PV-20260726-000001", amounts: { ttc: 833 } }
            : await sell({
                ticketId: ticket.id as never,
                weightKg: input.weightKg,
                senderName: input.senderName,
                recipientName: input.recipientName,
                deviceId: "agent-web-browser",
              })
          setResult({
            tagNumber: sold.tagNumber,
            totalTtc: sold.amounts.ttc,
          })
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Échec de la vente")
        } finally {
          setPending(false)
        }
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        runtime.router.replace("/connexion")
      }}
    />
  )
}

export function ParcelSalePageClient() {
  const runtime = useAncillaryRuntime()
  const [quoteInput, setQuoteInput] = useState<{
    originId: string
    destinationId: string
    items: ParcelItem[]
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ shipmentNumber: string }>()
  const sell = useMutation(api.functions.ancillaries.sellParcel)
  const liveQuote = useQuery(
    api.functions.ancillaries.quoteParcel,
    E2E_MODE || !quoteInput
      ? "skip"
      : {
          originStationId: quoteInput.originId as never,
          destinationStationId: quoteInput.destinationId as never,
          items: quoteInput.items.map(({ weightKg }) => ({ weightKg })),
        }
  )
  if (!runtime.dashboard || runtime.stationsLoading) return <LoadingSale />
  return (
    <ParcelSaleScreen
      dashboard={runtime.dashboard}
      stations={runtime.stations}
      online={runtime.online}
      quote={
        E2E_MODE ? { zone: 7, distanceKm: 648, totalTtc: 4_500 } : liveQuote
      }
      pending={pending}
      result={result}
      error={error}
      onQuoteInput={(originId, destinationId, items) =>
        setQuoteInput({ originId, destinationId, items })
      }
      onSell={async (input) => {
        setPending(true)
        setError("")
        try {
          const sold = E2E_MODE
            ? { shipmentNumber: "C-OWE-PV-20260726-000001" }
            : await sell({
                originStationId: input.originId as never,
                destinationStationId: input.destinationId as never,
                senderName: input.senderName,
                senderPhone: input.senderPhone,
                recipientName: input.recipientName,
                recipientPhone: input.recipientPhone,
                items: input.items,
                deviceId: "agent-web-browser",
              })
          setResult({ shipmentNumber: sold.shipmentNumber })
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Échec de la vente")
        } finally {
          setPending(false)
        }
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        runtime.router.replace("/connexion")
      }}
    />
  )
}

export function SpecialTransportPageClient({
  initialType,
}: {
  initialType: "auto" | "funeraire"
}) {
  const runtime = useAncillaryRuntime()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")
  const [lookupNumber, setLookupNumber] = useState("B-4823")
  const [product, setProduct] = useState<"auto" | "funeraire">(initialType)
  const [tonnage, setTonnage] = useState(1.4)
  const [route, setRoute] = useState({
    originId: runtime.stations[0]?.id ?? "",
    destinationId: runtime.stations.at(-1)?.id ?? "",
  })
  const [serviceDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10)
  })
  const sellVehicle = useMutation(
    api.functions.ancillaries.sellVehicleTransport
  )
  const sellFuneral = useMutation(
    api.functions.ancillaries.sellFuneralTransport
  )
  const liveLookup = useQuery(
    api.functions.ancillaries.lookupTicket,
    E2E_MODE || !lookupNumber ? "skip" : { number: lookupNumber }
  )
  const resolvedOriginId = route.originId || runtime.stations[0]?.id || ""
  const resolvedDestinationId =
    route.destinationId || runtime.stations.at(-1)?.id || ""
  const liveTrips = useQuery(
    api.functions.trips.search,
    E2E_MODE
      ? "skip"
      : runtime.stations.length >= 2
        ? {
            originStationId: resolvedOriginId as never,
            destinationStationId: resolvedDestinationId as never,
            serviceDate,
          }
        : "skip"
  )
  const liveQuote = useQuery(
    api.functions.ancillaries.quoteSpecialTransport,
    E2E_MODE ||
      (product === "auto" && !liveLookup) ||
      (product === "funeraire" && (!resolvedOriginId || !resolvedDestinationId))
      ? "skip"
      : {
          product: product === "auto" ? "taa" : "funeraire",
          ticketId:
            product === "auto" ? (liveLookup?.ticket._id as never) : undefined,
          originStationId:
            product === "funeraire" ? (resolvedOriginId as never) : undefined,
          destinationStationId:
            product === "funeraire"
              ? (resolvedDestinationId as never)
              : undefined,
          tonnage,
        }
  )
  if (!runtime.dashboard || runtime.stationsLoading) return <LoadingSale />
  return (
    <SpecialTransportScreen
      dashboard={runtime.dashboard}
      stations={runtime.stations}
      online={runtime.online}
      initialType={initialType}
      pending={pending}
      quote={E2E_MODE ? { totalTtc: 185_000 } : liveQuote}
      result={result}
      error={error}
      onTypeChange={setProduct}
      onTicketNumberChange={setLookupNumber}
      onRouteChange={(originId, destinationId) =>
        setRoute({ originId, destinationId })
      }
      onTonnageChange={setTonnage}
      onSell={async (input) => {
        setPending(true)
        setError("")
        try {
          if (E2E_MODE) {
            setResult(
              input.type === "auto"
                ? "Expédition TAA-OWE-000001 enregistrée"
                : "Expédition F-OWE-000001 enregistrée"
            )
          } else if (input.type === "auto") {
            if (!liveLookup) {
              throw new Error("Billet voyageur introuvable.")
            }
            const sold = await sellVehicle({
              ticketId: liveLookup.ticket._id,
              tonnage: input.tonnage,
              senderName: input.senderName,
              validUntil: Date.now() + 2 * 86_400_000,
              deviceId: "agent-web-browser",
            })
            setResult(`Expédition ${sold.shipmentNumber} enregistrée`)
          } else {
            const trip = liveTrips?.[0]
            if (!trip) throw new Error("Aucune desserte disponible demain.")
            const sold = await sellFuneral({
              tripId: trip.trip._id,
              originStationId: input.originId as never,
              destinationStationId: input.destinationId as never,
              tonnage: input.tonnage,
              senderName: input.senderName,
              deviceId: "agent-web-browser",
            })
            setResult(`Expédition ${sold.shipmentNumber} enregistrée`)
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Échec de la vente")
        } finally {
          setPending(false)
        }
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        runtime.router.replace("/connexion")
      }}
    />
  )
}
