"use client"

import type { GenericId } from "convex/values"
import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

type SeatBlockId = GenericId<"seatBlocks">

const REASON_LABELS = {
  maintenance: "Maintenance",
  exploitation: "Exploitation",
  protocole: "Protocole",
  autre: "Autre",
} as const

function fullName(
  user?: { firstName?: string; lastName?: string; matricule?: string } | null
) {
  if (!user) return "Non renseigné"
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.matricule ||
    "Non renseigné"
  )
}

export function SeatBlockDetail({ blockId }: { blockId: string }) {
  const id = blockId as SeatBlockId
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayRelease = canRole(role, "places", "modifier")
  const detail = useQuery(api.functions.management.getSeatBlock, {
    blockId: id,
  })
  const releaseBlock = useMutation(api.functions.management.releaseSeatBlock)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const note = String(new FormData(form).get("note") ?? "").trim()
    if (!note) {
      setError("Une note de libération est obligatoire.")
      return
    }
    setPending(true)
    setMessage("")
    setError("")
    try {
      await releaseBlock({ blockId: id, note })
      setMessage(
        "Le blocage est levé. Les compteurs de disponibilité ont été recalculés."
      )
      form.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’action a échoué.")
    } finally {
      setPending(false)
    }
  }

  if (detail === undefined) {
    return (
      <ManagementDetailShell
        title="Blocage de place"
        eyebrow="Inventaire"
        backHref="/gestion/places"
      >
        <p role="status">Chargement du blocage…</p>
      </ManagementDetailShell>
    )
  }

  if (detail === null) {
    return (
      <ManagementDetailShell
        title="Blocage introuvable"
        eyebrow="Inventaire"
        backHref="/gestion/places"
      >
        <InlineMessage tone="danger" title="Ce blocage n’existe plus." />
      </ManagementDetailShell>
    )
  }

  const { block, trip, seat, coach, creator, releaser, occupancy, stops } =
    detail
  const blockedStops = stops.filter(({ stop }) =>
    detail.blockedSegments.includes(stop.sequence)
  )
  const firstStop = blockedStops[0]?.station
  const lastSegment = detail.blockedSegments.at(-1)
  const lastStop = stops.find(({ stop }) => stop.sequence === lastSegment! + 1)

  return (
    <ManagementDetailShell
      title={`${trip?.trainNumber ?? "Desserte"} · ${coach?.label ?? "Voiture"} ${seat?.label ?? ""}`}
      eyebrow="Détail du blocage de place"
      backHref="/gestion/places"
    >
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {message ? <InlineMessage tone="success" title={message} /> : null}

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-caption text-ink-muted">État</span>
          <div className="mt-1">
            <Badge>{block.isActive ? "Bloquée" : "Libérée"}</Badge>
          </div>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Motif</span>
          <p>{REASON_LABELS[block.reason]}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Desserte</span>
          <p>
            {trip
              ? `${trip.trainNumber} · ${trip.serviceDate}`
              : "Non renseignée"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Place</span>
          <p>
            {coach?.label ?? "—"} · {seat?.label ?? "—"} ·{" "}
            {occupancy?.serviceClass ?? "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <span className="text-caption text-ink-muted">Portion bloquée</span>
          <p>
            {firstStop?.name ?? "Départ inconnu"} →{" "}
            {lastStop?.station?.name ?? "Arrivée inconnue"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Créé par</span>
          <p>{fullName(creator)}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Libéré par</span>
          <p>{releaser ? fullName(releaser) : "—"}</p>
        </div>
      </Card>

      {block.comment ? (
        <Card className="grid gap-3 p-5">
          <h2 className="text-h3">Traçabilité</h2>
          <p className="whitespace-pre-wrap">{block.comment}</p>
        </Card>
      ) : null}

      {block.isActive && mayRelease ? (
        <Card className="p-5">
          <h2 className="text-h3">Libérer la place</h2>
          <p className="text-small mt-2 text-ink-muted">
            Cette action ne touche ni aux ventes ni aux réservations. Seuls les
            segments de ce blocage seront remis en disponibilité.
          </p>
          <form className="mt-4 grid gap-4" onSubmit={release}>
            <Field
              label="Note de libération obligatoire"
              htmlFor="seat-block-release-note"
            >
              <Textarea
                id="seat-block-release-note"
                name="note"
                placeholder="Ex. siège réparé et contrôlé par l’équipe maintenance."
                required
              />
            </Field>
            <Button type="submit" loading={pending}>
              Lever le blocage
            </Button>
          </form>
        </Card>
      ) : null}
    </ManagementDetailShell>
  )
}
