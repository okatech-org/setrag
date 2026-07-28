"use client"

import type { GenericId } from "convex/values"
import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { formatPrice } from "@workspace/ui/lib/format"

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

type PenaltyId = GenericId<"procesVerbaux">

const REASON_LABELS = {
  sans_titre: "Absence de titre",
  titre_invalide: "Titre invalide",
  classe_superieure: "Surclassement",
  autre: "Autre irrégularité",
} as const

const STATUS_LABELS = {
  emis: "Émis · à encaisser",
  paye: "Payé",
  conteste: "Contesté",
  annule: "Annulé",
} as const

const STATUS_TRANSITIONS = {
  emis: ["paye", "conteste", "annule"],
  conteste: ["emis", "paye", "annule"],
  paye: [],
  annule: [],
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

export function PenaltyDetail({ penaltyId }: { penaltyId: string }) {
  const id = penaltyId as PenaltyId
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayModify = canRole(role, "proces_verbaux", "modifier")
  const detail = useQuery(api.functions.control.getPenalty, { penaltyId: id })
  const setStatus = useMutation(api.functions.control.setPenaltyStatus)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const status = String(data.get("status")) as
      "emis" | "paye" | "conteste" | "annule"
    const resolutionNote = String(data.get("resolutionNote") ?? "").trim()
    if (!resolutionNote) {
      setError("Un motif est obligatoire pour tracer cette action.")
      return
    }

    setPending(true)
    setMessage("")
    setError("")
    try {
      await setStatus({ penaltyId: id, status, resolutionNote })
      setMessage(
        `Le procès-verbal est maintenant « ${STATUS_LABELS[status]} ».`
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
        title="Procès-verbal"
        eyebrow="Détail de l’irrégularité"
        backHref="/gestion/incidents"
      >
        <p role="status">Chargement du procès-verbal…</p>
      </ManagementDetailShell>
    )
  }

  if (detail === null) {
    return (
      <ManagementDetailShell
        title="Procès-verbal introuvable"
        eyebrow="Irrégularités"
        backHref="/gestion/incidents"
      >
        <InlineMessage tone="danger" title="Ce procès-verbal n’existe plus." />
      </ManagementDetailShell>
    )
  }

  const { penalty, agent, trip, ticket, payment, resolver } = detail
  const allowedStatuses = STATUS_TRANSITIONS[penalty.status]
  const offenderName = penalty.offender.declined
    ? "Identité refusée"
    : [penalty.offender.firstName, penalty.offender.lastName]
        .filter(Boolean)
        .join(" ") || "Non renseignée"

  return (
    <ManagementDetailShell
      title={penalty.number}
      eyebrow="Détail du procès-verbal"
      backHref="/gestion/incidents"
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
            <Badge>{STATUS_LABELS[penalty.status]}</Badge>
          </div>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Montant</span>
          <p className="tabular font-semibold">
            {formatPrice(penalty.amountXaf)}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Motif</span>
          <p>{REASON_LABELS[penalty.reason]}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Émis le</span>
          <p>{new Date(penalty.issuedAt).toLocaleString("fr-FR")}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Contrevenant</span>
          <p>{offenderName}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Téléphone</span>
          <p>{penalty.offender.phone ?? "Non renseigné"}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Document</span>
          <p>{penalty.offender.documentNumber ?? "Non renseigné"}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">
            Agent verbalisateur
          </span>
          <p>{fullName(agent)}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Train</span>
          <p>{trip?.trainNumber ?? "Non renseigné"}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Billet lié</span>
          <p>{ticket?.number ?? "Aucun"}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Paiement</span>
          <p>
            {payment
              ? `${payment.method} · ${formatPrice(payment.amountXaf)}`
              : "Non encaissé"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Saisie</span>
          <p>{penalty.offline ? "Synchronisée hors ligne" : "En ligne"}</p>
        </div>
      </Card>

      {penalty.notes ? (
        <Card className="grid gap-3 p-5">
          <h2 className="text-h3">Notes du contrôle</h2>
          <p className="whitespace-pre-wrap">{penalty.notes}</p>
        </Card>
      ) : null}

      {penalty.resolutionNote ? (
        <Card className="grid gap-3 p-5">
          <h2 className="text-h3">Dernier motif de traitement</h2>
          <p className="whitespace-pre-wrap">{penalty.resolutionNote}</p>
          <p className="text-small text-ink-muted">
            {resolver ? `Par ${fullName(resolver)}` : "Auteur non renseigné"}
          </p>
        </Card>
      ) : null}

      {mayModify && allowedStatuses.length ? (
        <Card className="p-5">
          <h2 className="text-h3">Traiter le procès-verbal</h2>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={updateStatus}
          >
            <Field label="Nouvel état" htmlFor="penalty-status">
              <SelectNative
                id="penalty-status"
                name="status"
                defaultValue=""
                required
              >
                <option value="">Choisir le nouvel état</option>
                {allowedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field
              className="sm:col-span-2"
              label="Motif ou note obligatoire"
              htmlFor="penalty-resolution-note"
            >
              <Textarea
                id="penalty-resolution-note"
                name="resolutionNote"
                placeholder="Expliquez le paiement, la contestation ou l’annulation."
                required
              />
            </Field>
            <Button type="submit" loading={pending}>
              Enregistrer le changement
            </Button>
          </form>
        </Card>
      ) : null}
    </ManagementDetailShell>
  )
}
