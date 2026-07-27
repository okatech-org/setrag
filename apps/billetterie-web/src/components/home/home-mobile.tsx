"use client"

import { QrCode } from "lucide-react"
import Link from "next/link"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"
import { Chip, ChipScroller } from "@workspace/ui/mobile/chip-scroller"

import { MobileSearchCard } from "@/components/home/mobile-search-card"
import { NotificationsBell } from "@/components/shell/notifications-bell"
import { useToday } from "@/hooks/use-today"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const longDayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "long",
  day: "numeric",
  month: "long",
})

const shortDayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "short",
  day: "numeric",
  month: "short",
})

type Departure = {
  tripId: string
  trainNumber: string
  trainType: "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
  serviceDate: string
  departureAt: number
  arrivalAt: number
  status: "planifie" | "a_lheure" | "retarde" | "annule" | "termine"
  delayMinutes: number
  origin: { stationId: string; code: string; name: string }
  destination: { stationId: string; code: string; name: string } | null
}

type Ticket = {
  ticket: { _id: string; number?: string; tripId: string }
  trip: { departureAt: number; trainNumber: string; serviceDate: string } | null
  origin: { name: string } | null
  destination: { name: string } | null
  reference: string
}

/**
 * Accueil mobile.
 *
 * L'ordre de l'écran suit celui de l'urgence : ce qu'on a déjà acheté vient en
 * premier — c'est ce qu'on vient rouvrir sur le quai — puis la recherche, puis
 * les départs du jour.
 */
export function HomeMobile({ className }: { className?: string }) {
  const today = useToday()
  const { isAuthenticated, profile } = useTravelerAuth()
  const firstName = profile?.user.firstName
  const tickets = useQuery(
    api.functions.bookings.myTickets,
    isAuthenticated ? {} : "skip"
  ) as Ticket[] | undefined
  const departures = useQuery(api.functions.trips.nextDepartures, {
    originCode: "OWE",
    limit: 3,
  }) as Departure[] | undefined

  const nextTicket = tickets?.[0]
  // Trajets déjà empruntés — déduits des billets en cours, faute de table
  // dédiée côté backend. La section disparaît quand il n'y en a aucun.
  const savedRoutes = dedupeRoutes(tickets)

  return (
    <main
      data-experience="mobile-app"
      className={cn("grid gap-s-5 pb-s-6 *:min-w-0 md:hidden", className)}
    >
      <header className="grid gap-s-4 bg-ink px-s-5 pt-s-4 pb-s-8 text-ink-inverse">
        <div className="flex items-center gap-s-3">
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-caption min-h-4 text-accent-on-ink">
              {today === null ? "" : longDayFormatter.format(today)}
            </span>
            <span className="text-h3 truncate">
              {firstName ? `Bonjour ${firstName}` : "Bonjour"}
            </span>
          </span>
          <NotificationsBell variant="inverse" className="shrink-0" />
        </div>

        {isAuthenticated && tickets === undefined ? (
          <SkeletonLines lines={2} />
        ) : nextTicket ? (
          <NextTicketCard ticket={nextTicket} />
        ) : null}
      </header>

      <div className="grid gap-s-6 px-s-5 *:min-w-0">
        <MobileSearchCard />

        {savedRoutes.length > 0 && (
          <section aria-labelledby="trajets-memorises" className="grid gap-s-3">
            <h2 id="trajets-memorises" className="text-h4">
              Trajets mémorisés
            </h2>
            <ChipScroller label="Trajets déjà empruntés">
              {savedRoutes.map((route) => (
                <Chip key={route} asChild>
                  <Link href="/#recherche">{route}</Link>
                </Chip>
              ))}
            </ChipScroller>
          </section>
        )}

        <section aria-labelledby="departs-du-jour" className="grid gap-s-3">
          <h2 id="departs-du-jour" className="text-h4">
            Départs du jour
          </h2>
          {departures === undefined ? (
            <SkeletonLines lines={3} />
          ) : departures.length === 0 ? (
            <p className="text-small rounded-lg border border-line bg-surface p-s-4 text-ink-muted">
              Aucun départ en vente depuis Owendo aujourd’hui. Utilisez la
              recherche pour consulter une autre date.
            </p>
          ) : (
            <ul className="grid gap-s-2">
              {departures.map((departure) => (
                <li key={departure.tripId}>
                  <DepartureRow departure={departure} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

function NextTicketCard({ ticket }: { ticket: Ticket }) {
  const departureAt = ticket.trip?.departureAt

  return (
    <article className="grid gap-s-3 rounded-lg bg-white/10 p-s-4">
      <div className="flex items-center gap-s-2">
        <span className="text-mono-label flex-1 text-accent-on-ink">
          Prochain billet
        </span>
        <Tag tone="success">hors ligne prêt</Tag>
      </div>
      <div className="flex items-center gap-s-3">
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="tabular text-small text-ink-faint">
            {ticket.trip?.trainNumber ?? "—"}
            {departureAt
              ? ` · ${shortDayFormatter.format(departureAt)} · ${hourFormatter.format(departureAt)}`
              : ""}
          </span>
          <strong className="text-body-lg truncate">
            {ticket.origin?.name ?? "—"} → {ticket.destination?.name ?? "—"}
          </strong>
          <span className="tabular text-caption text-ink-faint">
            {ticket.reference}
          </span>
        </span>
        <QrCode aria-hidden className="size-12 shrink-0 text-ink-inverse" />
      </div>
      <div className="grid grid-cols-2 gap-s-2">
        <Button asChild size="sm">
          <Link href={`/reservation/${ticket.reference}`}>
            Afficher le billet
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link
            href={`/suivi?train=${encodeURIComponent(ticket.trip?.trainNumber ?? "")}`}
          >
            Suivre
          </Link>
        </Button>
      </div>
    </article>
  )
}

function DepartureRow({ departure }: { departure: Departure }) {
  const late = departure.status === "retarde" || departure.delayMinutes > 0

  return (
    <article className="grid gap-s-2 rounded-md border border-line bg-surface p-s-4">
      <div className="flex items-center gap-s-3">
        <span className="tabular text-body flex-1 font-semibold">
          {hourFormatter.format(departure.departureAt)} →{" "}
          {hourFormatter.format(departure.arrivalAt)}
        </span>
        {departure.status === "annule" ? (
          <Tag tone="danger">supprimé</Tag>
        ) : late ? (
          <Tag tone="warning">+{departure.delayMinutes} min</Tag>
        ) : (
          <Tag tone="success">à l’heure</Tag>
        )}
      </div>
      <span className="text-small truncate text-ink-muted">
        {departure.trainNumber} · {departure.origin.name} →{" "}
        {departure.destination?.name ?? "—"}
      </span>
    </article>
  )
}

/** Trajets distincts, dans l'ordre d'apparition, plafonnés à cinq pastilles. */
function dedupeRoutes(tickets: Ticket[] | undefined) {
  if (!tickets) return []
  const seen = new Set<string>()
  for (const item of tickets) {
    const origin = item.origin?.name
    const destination = item.destination?.name
    if (!origin || !destination) continue
    seen.add(`${origin} → ${destination}`)
    if (seen.size >= 5) break
  }
  return [...seen]
}
