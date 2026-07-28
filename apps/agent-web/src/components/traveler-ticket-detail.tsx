"use client"

import type { GenericId } from "convex/values"
import { useState } from "react"

import { useAction, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { formatPrice } from "@workspace/ui/lib/format"

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

type TicketId = GenericId<"tickets">

const STATUS_LABELS = {
  en_attente: "En attente de paiement",
  valide: "Valide",
  utilise: "Utilisé",
  annule: "Annulé",
  rembourse: "Remboursé",
  expire: "Expiré",
} as const

export function TravelerTicketDetail({ ticketId }: { ticketId: string }) {
  const id = ticketId as TicketId
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayReadDocument = canRole(role, "duplicatas", "consulter")
  const mayDuplicate = canRole(role, "duplicatas", "creer")
  const detail = useQuery(api.functions.management.getTravelerTicket, {
    ticketId: id,
  })
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const reprint = useMutation(api.functions.sales.reprintTicket)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function download() {
    setPending(true)
    setMessage("")
    setError("")
    try {
      const result = await ticketPdf({ ticketId: id })
      window.open(result.url, "_blank", "noopener,noreferrer")
      setMessage("Le document du billet a été généré.")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Document indisponible."
      )
    } finally {
      setPending(false)
    }
  }

  async function createDuplicate() {
    if (
      !window.confirm(
        "Émettre un duplicata tracé de ce billet ? Cette action sera auditée."
      )
    ) {
      return
    }
    setPending(true)
    setMessage("")
    setError("")
    try {
      const result = await reprint({ ticketId: id })
      setMessage(`${result.mention} enregistré pour ${result.ticketNumber}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Duplicata impossible.")
    } finally {
      setPending(false)
    }
  }

  if (detail === undefined) {
    return (
      <ManagementDetailShell
        title="Voyageur"
        eyebrow="Billet et manifeste"
        backHref="/gestion/voyageurs"
      >
        <p role="status">Chargement du billet…</p>
      </ManagementDetailShell>
    )
  }

  if (detail === null) {
    return (
      <ManagementDetailShell
        title="Billet introuvable"
        eyebrow="Voyageurs"
        backHref="/gestion/voyageurs"
      >
        <InlineMessage tone="danger" title="Ce billet n’existe plus." />
      </ManagementDetailShell>
    )
  }

  const {
    ticket,
    sale,
    trip,
    origin,
    destination,
    customer,
    scans,
    baggages,
    payments,
  } = detail

  return (
    <ManagementDetailShell
      title={`${ticket.passenger.firstName} ${ticket.passenger.lastName}`}
      eyebrow={`Billet ${ticket.number}`}
      backHref="/gestion/voyageurs"
    >
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {message ? <InlineMessage tone="success" title={message} /> : null}

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-caption text-ink-muted">État du billet</span>
          <div className="mt-1">
            <Badge>{STATUS_LABELS[ticket.status]}</Badge>
          </div>
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
          <span className="text-caption text-ink-muted">Trajet</span>
          <p>
            {origin?.name ?? "?"} → {destination?.name ?? "?"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Place</span>
          <p>
            {ticket.coachLabel ?? "—"} ·{" "}
            {ticket.seatLabel ?? (ticket.isStanding ? "Debout" : "—")}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Classe</span>
          <p>{ticket.serviceClass}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Prix TTC</span>
          <p className="tabular">{formatPrice(ticket.unitPriceTtc)}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Vente</span>
          <p>{sale?.number ?? "Non renseignée"}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Duplicatas</span>
          <p>{ticket.duplicateCount}</p>
        </div>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <h2 className="text-h3">Identité du voyageur</h2>
          <dl className="text-small mt-3 grid gap-2">
            <div>
              <dt className="text-ink-muted">Nom complet</dt>
              <dd>
                {ticket.passenger.firstName} {ticket.passenger.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Genre</dt>
              <dd>{ticket.passenger.gender}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Téléphone voyageur</dt>
              <dd>{ticket.passenger.phone ?? "Non renseigné"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Contact d’urgence</dt>
              <dd>{ticket.passenger.emergencyPhone ?? "Non renseigné"}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h2 className="text-h3">Contact du dossier</h2>
          <dl className="text-small mt-3 grid gap-2">
            <div>
              <dt className="text-ink-muted">Téléphone</dt>
              <dd>
                {sale?.contactPhone ?? customer?.phone ?? "Non renseigné"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">E-mail</dt>
              <dd>
                {sale?.contactEmail ?? customer?.email ?? "Non renseigné"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Paiement</dt>
              <dd>
                {payments[0]
                  ? `${payments[0].status} · ${payments[0].method}`
                  : "Non renseigné"}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="text-h3">Suivi opérationnel</h2>
        <p>
          {scans.length
            ? `${scans.length} contrôle(s), dernier résultat : ${scans[0]!.result}`
            : "Aucun contrôle enregistré."}
        </p>
        <p>
          {baggages.length
            ? `${baggages.length} bagage(s) enregistré(s).`
            : "Aucun bagage enregistré."}
        </p>
      </Card>

      {mayReadDocument || (mayDuplicate && ticket.status === "valide") ? (
        <Card className="flex flex-wrap gap-3 p-5">
          {mayReadDocument ? (
            <Button
              variant="secondary"
              loading={pending}
              onClick={() => void download()}
            >
              Télécharger le billet
            </Button>
          ) : null}
          {mayDuplicate && ticket.status === "valide" ? (
            <Button loading={pending} onClick={() => void createDuplicate()}>
              Émettre un duplicata tracé
            </Button>
          ) : null}
          <p className="text-small basis-full text-ink-muted">
            Les données transactionnelles ne peuvent être ni modifiées ni
            supprimées depuis cette fiche.
          </p>
        </Card>
      ) : null}
    </ManagementDetailShell>
  )
}
