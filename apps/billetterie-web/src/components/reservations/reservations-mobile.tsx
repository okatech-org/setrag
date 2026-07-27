"use client"

import * as React from "react"
import { QrCode } from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Tag } from "@workspace/ui/components/tag"
import { formatPrice } from "@workspace/ui/lib/format"

import type { useReservations } from "@/features/reservations/use-reservations"

type Period = "avenir" | "passes"

const PERIODS = [
  { value: "avenir", label: "À venir" },
  { value: "passes", label: "Passés" },
]

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "long",
  day: "numeric",
  month: "long",
})

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

type Reservation = ReturnType<typeof useReservations>["items"][number]

/**
 * Mes billets, en mobile.
 *
 * Le prochain départ occupe une carte pleine, les suivants des cartes
 * atténuées : sur un quai, c'est le billet du jour qu'on cherche, et il ne
 * doit jamais demander de faire défiler.
 */
export function ReservationsMobile({
  reservations,
}: {
  reservations: ReturnType<typeof useReservations>
}) {
  const [period, setPeriod] = React.useState<Period>("avenir")
  const list = period === "avenir" ? reservations.upcoming : reservations.past
  const [first, ...rest] = list

  return (
    <div className="grid gap-s-4 *:min-w-0 md:hidden">
      <SegmentedControl
        size="touch"
        label="Période des billets"
        options={PERIODS}
        value={period}
        onValueChange={(value) => setPeriod(value as Period)}
      />

      {reservations.message && (
        <InlineMessage tone="info" title={reservations.message} />
      )}

      {list.length === 0 ? (
        <EmptyState
          title={
            period === "avenir" ? "Aucun voyage prévu" : "Aucun voyage passé"
          }
          description={
            period === "avenir"
              ? "Vos prochains billets apparaîtront ici, consultables même sans réseau."
              : "Vos titres passés restent consultables cinq ans, avec leurs reçus téléchargeables."
          }
          action={
            period === "avenir" ? (
              <Button asChild>
                <Link href="/">Rechercher une desserte</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {first && (
            <>
              <span className="text-mono-label text-ink-muted">
                {period === "avenir" ? "Prochain départ" : "Dernier voyage"}
              </span>
              <FeaturedTicket item={first} reservations={reservations} />
            </>
          )}
          {rest.length > 0 && (
            <>
              <span className="text-mono-label text-ink-muted">
                {period === "avenir" ? "Plus tard" : "Avant"}
              </span>
              <ul className="grid gap-s-2">
                {rest.map((item) => (
                  <li key={item.sale.number}>
                    <CompactTicket item={item} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

function statusTag(status: string) {
  if (status === "confirmee")
    return { tone: "success" as const, label: "payé · hors ligne prêt" }
  if (status === "en_attente_paiement")
    return { tone: "warning" as const, label: "à régler" }
  if (status === "remboursee")
    return { tone: "neutral" as const, label: "remboursé" }
  if (status === "annulee") return { tone: "danger" as const, label: "annulé" }
  return { tone: "neutral" as const, label: status }
}

/** Carte pleine du billet le plus proche — celle qu'on présente au contrôle. */
function FeaturedTicket({
  item,
  reservations,
}: {
  item: Reservation
  reservations: ReturnType<typeof useReservations>
}) {
  const tag = statusTag(item.sale.status)
  const departure = item.trip?.departureAt
  const paid = item.sale.status === "confirmee"

  return (
    <article className="grid gap-s-3 rounded-lg bg-ink p-s-4 text-ink-inverse shadow-lg">
      <div className="flex items-center gap-s-2">
        <span className="tabular text-caption flex-1 text-ink-faint">
          {item.sale.number}
        </span>
        <Tag tone={tag.tone}>{tag.label}</Tag>
      </div>

      <div className="flex items-center gap-s-3">
        <span className="grid min-w-0 flex-1 gap-1">
          {departure && (
            <span className="text-caption text-ink-faint">
              {dayFormatter.format(departure)}
            </span>
          )}
          <strong className="text-body-lg truncate">
            {item.origin?.name ?? "Départ"} →{" "}
            {item.destination?.name ?? "Arrivée"}
          </strong>
          <span className="tabular text-caption text-ink-faint">
            {item.trip?.trainNumber ?? "Train"}
            {departure ? ` · ${hourFormatter.format(departure)}` : ""} ·{" "}
            {item.tickets.length} billet{item.tickets.length > 1 ? "s" : ""}
          </span>
        </span>
        {paid && (
          <QrCode aria-hidden className="size-14 shrink-0 text-ink-inverse" />
        )}
      </div>

      {!paid && item.sale.status === "en_attente_paiement" && (
        <p className="text-caption text-ink-faint">
          À régler au guichet avant l’échéance — aucun code n’est encore émis.
        </p>
      )}

      <div className="grid gap-s-2">
        <Button asChild size="sm">
          <Link href={`/reservation/${encodeURIComponent(item.sale.number)}`}>
            {paid ? "Ouvrir le billet" : "Voir le dossier"}
          </Link>
        </Button>
        <div className="grid grid-cols-2 gap-s-2">
          <Button asChild variant="secondary" size="sm">
            <Link
              href={`/suivi?train=${encodeURIComponent(item.trip?.trainNumber ?? "")}`}
            >
              Suivre
            </Link>
          </Button>
          {item.sale.status === "en_attente_paiement" ? (
            <Button
              variant="danger"
              size="sm"
              disabled={reservations.cancelling === item.sale.number}
              onClick={() => void reservations.cancel(item.sale.number)}
            >
              {reservations.cancelling === item.sale.number
                ? "Annulation…"
                : "Annuler"}
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href="/aide">Aide</Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Billets suivants — assez d'information pour les distinguer, pas plus. */
function CompactTicket({ item }: { item: Reservation }) {
  const tag = statusTag(item.sale.status)
  const departure = item.trip?.departureAt

  return (
    <Link
      href={`/reservation/${encodeURIComponent(item.sale.number)}`}
      className="grid gap-s-2 rounded-md border border-line bg-surface p-s-4 hover:bg-surface-sunk"
    >
      <div className="flex items-center gap-s-2">
        <span className="text-caption min-w-0 flex-1 truncate text-ink-muted">
          {departure ? dayFormatter.format(departure) : "Date indisponible"}
        </span>
        <Tag tone={tag.tone}>{tag.label}</Tag>
      </div>
      <strong className="text-body truncate">
        {item.origin?.name ?? "Départ"} → {item.destination?.name ?? "Arrivée"}
      </strong>
      <span className="tabular text-caption text-ink-muted">
        {item.trip?.trainNumber ?? "Train"} · {item.tickets.length} billet
        {item.tickets.length > 1 ? "s" : ""} ·{" "}
        {formatPrice(item.sale.amounts.ttc)}
      </span>
    </Link>
  )
}
