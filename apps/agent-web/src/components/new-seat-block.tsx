"use client"

import type { GenericId } from "convex/values"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { ManagementDetailShell } from "./management-detail-shell"

type TripId = GenericId<"trips">
type SeatId = GenericId<"seats">

export function NewSeatBlock() {
  const router = useRouter()
  const [tripId, setTripId] = useState("")
  const options = useQuery(api.functions.management.seatBlockOptions, {})
  const selected = useQuery(
    api.functions.management.seatBlockOptions,
    tripId ? { tripId: tripId as TripId } : "skip"
  )
  const createBlock = useMutation(api.functions.management.createSeatBlock)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const seatId = String(data.get("seatId") ?? "")
    const fromStopIndex = Number(data.get("fromStopIndex"))
    const toStopIndex = Number(data.get("toStopIndex"))
    if (!tripId || !seatId) {
      setError("Choisissez une desserte et une place.")
      return
    }
    if (toStopIndex <= fromStopIndex) {
      setError("La gare d’arrivée doit suivre la gare de départ.")
      return
    }

    setPending(true)
    setError("")
    try {
      const blockId = await createBlock({
        tripId: tripId as TripId,
        seatId: seatId as SeatId,
        fromStopIndex,
        toStopIndex,
        reason: String(data.get("reason")) as
          "maintenance" | "exploitation" | "protocole" | "autre",
        comment: String(data.get("comment") ?? ""),
      })
      router.push(`/gestion/places/${blockId}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le blocage a échoué.")
    } finally {
      setPending(false)
    }
  }

  const details = selected?.selected

  return (
    <ManagementDetailShell
      title="Nouveau blocage de place"
      eyebrow="Inventaire réel par segment"
      backHref="/gestion/places"
    >
      {error ? (
        <InlineMessage tone="danger" title="Blocage impossible">
          {error}
        </InlineMessage>
      ) : null}

      <Card className="p-5">
        <p className="text-small text-ink-muted">
          Le blocage retire une place de la vente uniquement entre les deux
          gares choisies. Une place déjà vendue, tenue ou bloquée sera refusée
          par l’inventaire.
        </p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field
            className="sm:col-span-2"
            label="Desserte"
            htmlFor="seat-block-trip"
          >
            <SelectNative
              id="seat-block-trip"
              value={tripId}
              onChange={(event) => setTripId(event.target.value)}
              required
            >
              <option value="">Choisir une desserte</option>
              {(options?.trips ?? []).map((trip) => (
                <option key={trip._id} value={trip._id}>
                  {trip.trainNumber} · {trip.serviceDate}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Place" htmlFor="seat-block-seat">
            <SelectNative
              id="seat-block-seat"
              name="seatId"
              disabled={!details}
              required
            >
              <option value="">Choisir une place</option>
              {(details?.seats ?? []).map(({ seat, coach, occupancy }) =>
                seat ? (
                  <option key={seat._id} value={seat._id}>
                    {coach?.label ?? "Voiture"} · {seat.label} ·{" "}
                    {occupancy.serviceClass}
                  </option>
                ) : null
              )}
            </SelectNative>
          </Field>
          <Field label="Motif" htmlFor="seat-block-reason">
            <SelectNative id="seat-block-reason" name="reason">
              <option value="maintenance">Maintenance</option>
              <option value="exploitation">Exploitation</option>
              <option value="protocole">Protocole</option>
              <option value="autre">Autre</option>
            </SelectNative>
          </Field>
          <Field label="De la gare" htmlFor="seat-block-from">
            <SelectNative
              id="seat-block-from"
              name="fromStopIndex"
              disabled={!details}
              required
            >
              {(details?.stops ?? []).slice(0, -1).map(({ stop, station }) => (
                <option key={stop._id} value={stop.sequence}>
                  {station?.code ?? "?"} · {station?.name ?? "Gare inconnue"}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Jusqu’à la gare" htmlFor="seat-block-to">
            <SelectNative
              id="seat-block-to"
              name="toStopIndex"
              disabled={!details}
              required
            >
              {(details?.stops ?? []).slice(1).map(({ stop, station }) => (
                <option key={stop._id} value={stop.sequence}>
                  {station?.code ?? "?"} · {station?.name ?? "Gare inconnue"}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field
            className="sm:col-span-2"
            label="Motif détaillé obligatoire"
            htmlFor="seat-block-comment"
          >
            <Textarea
              id="seat-block-comment"
              name="comment"
              placeholder="Décrivez la cause, le responsable et la condition de remise en vente."
              required
            />
          </Field>
          <Button type="submit" loading={pending} disabled={!details}>
            Bloquer la place
          </Button>
        </form>
      </Card>
    </ManagementDetailShell>
  )
}
