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

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

type IncidentId = GenericId<"incidents">

const CATEGORY_LABELS = {
  securite: "Sécurité",
  technique: "Technique",
  comportement: "Comportement",
  medical: "Médical",
  autre: "Autre",
} as const

const SEVERITY_LABELS = {
  information: "Information",
  important: "Important",
  critique: "Critique",
} as const

const STATUS_LABELS = {
  ouvert: "Ouvert",
  en_cours: "En cours",
  resolu: "Résolu",
} as const

const STATUS_TRANSITIONS = {
  ouvert: ["en_cours", "resolu"],
  en_cours: ["resolu"],
  resolu: ["en_cours"],
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

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const id = incidentId as IncidentId
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayModify = canRole(role, "incidents", "modifier")
  const detail = useQuery(api.functions.control.getIncident, {
    incidentId: id,
  })
  const setStatus = useMutation(api.functions.control.setIncidentStatus)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const status = String(data.get("status")) as
      "ouvert" | "en_cours" | "resolu"
    const resolutionNote = String(data.get("resolutionNote") ?? "").trim()
    if (!resolutionNote) {
      setError("Une note est obligatoire pour tracer cette action.")
      return
    }

    setPending(true)
    setMessage("")
    setError("")
    try {
      await setStatus({ incidentId: id, status, resolutionNote })
      setMessage(`L’incident est maintenant « ${STATUS_LABELS[status]} ».`)
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
        title="Incident"
        eyebrow="Détail du signalement"
        backHref="/gestion/incidents"
      >
        <p role="status">Chargement de l’incident…</p>
      </ManagementDetailShell>
    )
  }

  if (detail === null) {
    return (
      <ManagementDetailShell
        title="Incident introuvable"
        eyebrow="Signalements"
        backHref="/gestion/incidents"
      >
        <InlineMessage tone="danger" title="Ce signalement n’existe plus." />
      </ManagementDetailShell>
    )
  }

  const { incident, reporter, trip, station, resolver, photoUrls } = detail
  const allowedStatuses = STATUS_TRANSITIONS[incident.status]

  return (
    <ManagementDetailShell
      title={`Incident ${incident.clientId}`}
      eyebrow="Détail du signalement"
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
            <Badge>{STATUS_LABELS[incident.status]}</Badge>
          </div>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Gravité</span>
          <p>{SEVERITY_LABELS[incident.severity]}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Catégorie</span>
          <p>{CATEGORY_LABELS[incident.category]}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Signalé le</span>
          <p>{new Date(incident.reportedAt).toLocaleString("fr-FR")}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Agent déclarant</span>
          <p>{fullName(reporter)}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Train</span>
          <p>{trip?.trainNumber ?? "Hors desserte"}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Gare</span>
          <p>
            {station ? `${station.code} · ${station.name}` : "Non précisée"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Saisie</span>
          <p>{incident.offline ? "Synchronisée hors ligne" : "En ligne"}</p>
        </div>
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="text-h3">Description</h2>
        <p className="whitespace-pre-wrap">{incident.description}</p>
        {photoUrls.length ? (
          <div className="flex flex-wrap gap-3">
            {photoUrls.map((url, index) => (
              <a
                key={url}
                className="text-small font-semibold text-accent-ink underline"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir la photo {index + 1}
              </a>
            ))}
          </div>
        ) : null}
      </Card>

      {incident.resolutionNote ? (
        <Card className="grid gap-3 p-5">
          <h2 className="text-h3">Dernière note de traitement</h2>
          <p className="whitespace-pre-wrap">{incident.resolutionNote}</p>
          <p className="text-small text-ink-muted">
            {resolver ? `Par ${fullName(resolver)}` : "Auteur non renseigné"}
            {incident.resolvedAt
              ? ` · ${new Date(incident.resolvedAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
        </Card>
      ) : null}

      {mayModify && allowedStatuses.length ? (
        <Card className="p-5">
          <h2 className="text-h3">Faire évoluer le signalement</h2>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={updateStatus}
          >
            <Field label="Nouvel état" htmlFor="incident-status">
              <SelectNative
                id="incident-status"
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
              label="Note obligatoire"
              htmlFor="incident-resolution-note"
            >
              <Textarea
                id="incident-resolution-note"
                name="resolutionNote"
                placeholder="Décrivez l’action réalisée ou le motif du changement."
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
