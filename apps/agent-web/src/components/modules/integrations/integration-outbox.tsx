"use client"

import { RefreshCw } from "lucide-react"
import { useState } from "react"
import type { FunctionReference } from "convex/server"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export type IntegrationEventStatus =
  "en_attente" | "en_cours" | "envoye" | "rejete"

interface IntegrationCounts {
  en_attente: number
  en_cours: number
  envoye: number
  rejete: number
}

export interface IntegrationHealthDto {
  generatedAt: number
  truncated: boolean
  totals: IntegrationCounts
  due: number
  oldestPendingAgeMs: number | null
  endpoints: readonly {
    endpointId: string
    code: string
    name: string
    transport: string
    isActive: boolean
    maxAttempts: number
    counts: IntegrationCounts
    due: number
    oldestPendingAgeMs: number | null
    lastError: string | null
  }[]
}

export interface IntegrationEventDto {
  _id: string
  endpointId: string
  type: string
  schemaVersion: number
  idempotencyKey: string
  entityType: string
  entityId: string
  status: IntegrationEventStatus
  attempts: number
  maxAttempts: number
  nextAttemptAt: number
  error?: {
    code: string
    message: string
    retryable: boolean
    occurredAt: number
  }
  correlationId: string
  createdAt: number
  updatedAt: number
  sentAt?: number
  rejectedAt?: number
  endpoint: {
    code: string
    name: string
    transport: string
  } | null
}

interface IntegrationEventsDto {
  events: readonly IntegrationEventDto[]
  limit: number
}

type IntegrationHealthReference = FunctionReference<
  "query",
  "public",
  Record<string, never>,
  IntegrationHealthDto
>

type IntegrationEventsReference = FunctionReference<
  "query",
  "public",
  {
    status?: IntegrationEventStatus
    endpointCode?: string
    limit?: number
  },
  IntegrationEventsDto
>

type ReplayIntegrationEventReference = FunctionReference<
  "mutation",
  "public",
  { eventId: string; reason: string; correlationId: string },
  { eventId: string; replayed: true }
>

/**
 * Références dynamiques : le frontend peut être livré avant les nouvelles
 * fonctions Convex. Le composant qui les consomme n'est monté qu'après
 * activation explicite de NEXT_PUBLIC_PLATFORM_MODULES_API.
 */
const integrationApi = (
  api as unknown as {
    modules: {
      platform: {
        integration: {
          integrationHealth: IntegrationHealthReference
          listIntegrationEvents: IntegrationEventsReference
          replayIntegrationEvent: ReplayIntegrationEventReference
        }
      }
    }
  }
).modules.platform.integration

const STATUS_PRESENTATION: Record<
  IntegrationEventStatus,
  { label: string; variant: "info" | "warning" | "success" | "destructive" }
> = {
  en_attente: { label: "En attente", variant: "warning" },
  en_cours: { label: "En cours", variant: "info" },
  envoye: { label: "Envoyés", variant: "success" },
  rejete: { label: "Rejetés", variant: "destructive" },
}

export function shouldLoadIntegrationOutbox({
  apiEnabled,
  isIntegrationSection,
  canConsult,
}: {
  apiEnabled: boolean
  isIntegrationSection: boolean
  canConsult: boolean
}) {
  return apiEnabled && isIntegrationSection && canConsult
}

export function formatIntegrationAge(ageMs: number | null) {
  if (ageMs === null) return "Aucun événement en attente"
  if (ageMs < 60_000) return "Moins d’une minute"
  if (ageMs < 3_600_000) {
    return `${Math.floor(ageMs / 60_000)} min`
  }
  if (ageMs < 86_400_000) {
    const hours = Math.floor(ageMs / 3_600_000)
    const minutes = Math.floor((ageMs % 3_600_000) / 60_000)
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  }
  const days = Math.floor(ageMs / 86_400_000)
  const hours = Math.floor((ageMs % 86_400_000) / 3_600_000)
  return hours > 0 ? `${days} j ${hours} h` : `${days} j`
}

export function normalizeIntegrationError(error: string | null | undefined) {
  if (!error?.trim()) return "Aucune erreur signalée"

  const firstLine = error
    .trim()
    .split(/\r?\n/, 1)[0]
    ?.replace(/^(?:ConvexError|Error):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!firstLine) return "Aucune erreur signalée"
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}…` : firstLine
}

function createCorrelationId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `integration-replay-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

function IntegrationCounter({
  status,
  count,
}: {
  status: IntegrationEventStatus
  count: number
}) {
  const presentation = STATUS_PRESENTATION[status]
  return (
    <Card className="gap-2 p-4">
      <span className="text-h3 tabular-nums">
        {count.toLocaleString("fr-FR")}
      </span>
      <span className="text-small text-ink-muted">{presentation.label}</span>
    </Card>
  )
}

export function IntegrationOutboxPanel({
  health,
  events,
  loading = false,
  canReplay,
  online,
  replayingEventId,
  replayMessage,
  replayError,
  onReplay,
}: {
  health?: IntegrationHealthDto
  events?: readonly IntegrationEventDto[]
  loading?: boolean
  canReplay: boolean
  online: boolean
  replayingEventId?: string
  replayMessage?: string
  replayError?: string
  onReplay?: (eventId: string) => void
}) {
  const rows = events ?? []

  return (
    <section aria-labelledby="integration-outbox-title" className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="integration-outbox-title" className="text-h3">
            Outbox plateforme
          </h2>
          <p className="text-small mt-1 text-ink-muted">
            Événements inter-modules suivis jusqu’à leur acquittement.
          </p>
        </div>
        {health ? (
          <p className="text-caption text-ink-muted" role="status">
            Plus ancien en attente :{" "}
            {formatIntegrationAge(health.oldestPendingAgeMs)}
            {health.due > 0 ? ` · ${health.due} à traiter` : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <Card className="p-5">
          <p role="status" className="text-small text-ink-muted">
            Chargement de l’outbox…
          </p>
        </Card>
      ) : health ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(STATUS_PRESENTATION) as IntegrationEventStatus[]).map(
            (status) => (
              <IntegrationCounter
                key={status}
                status={status}
                count={health.totals[status]}
              />
            )
          )}
        </div>
      ) : (
        <InlineMessage tone="warning" title="Supervision indisponible.">
          L’état de l’outbox n’a pas pu être chargé.
        </InlineMessage>
      )}

      {replayMessage ? (
        <InlineMessage tone="success" title={replayMessage} />
      ) : null}
      {replayError ? (
        <InlineMessage tone="danger" title="Le rejeu a échoué.">
          {normalizeIntegrationError(replayError)}
        </InlineMessage>
      ) : null}

      {!loading && health ? (
        <Card className="min-w-0 overflow-hidden p-0">
          <Table>
            <TableCaption>
              {health.truncated
                ? `Derniers événements affichés (limite ${rows.length}).`
                : "Derniers événements d’intégration."}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Événement</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Âge</TableHead>
                <TableHead>Tentatives</TableHead>
                <TableHead>Dernière erreur</TableHead>
                <TableHead>État</TableHead>
                {canReplay ? (
                  <TableHead className="text-right">Action</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((event) => {
                const presentation = STATUS_PRESENTATION[event.status]
                const isReplaying = replayingEventId === event._id
                return (
                  <TableRow key={event._id}>
                    <TableCell className="font-semibold">
                      <span
                        className="block max-w-64 truncate"
                        title={event.type}
                      >
                        {event.type}
                      </span>
                      <span className="text-caption text-ink-muted">
                        {event.entityType} · {event.entityId}
                      </span>
                    </TableCell>
                    <TableCell>
                      {event.endpoint?.name ?? "Destination supprimée"}
                      {event.endpoint ? (
                        <span className="text-caption block text-ink-muted">
                          {event.endpoint.code} · {event.endpoint.transport}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <time dateTime={new Date(event.createdAt).toISOString()}>
                        {formatIntegrationAge(
                          Math.max(health.generatedAt - event.createdAt, 0)
                        )}
                      </time>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {event.attempts} / {event.maxAttempts}
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-72 truncate"
                        title={normalizeIntegrationError(event.error?.message)}
                      >
                        {normalizeIntegrationError(event.error?.message)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={presentation.variant}>
                        {presentation.label}
                      </Badge>
                    </TableCell>
                    {canReplay ? (
                      <TableCell className="text-right">
                        {event.status === "rejete" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={isReplaying}
                            loadingLabel="Rejeu…"
                            disabled={!online || Boolean(replayingEventId)}
                            aria-label={`Rejouer l’événement ${event.type}`}
                            onClick={() => onReplay?.(event._id)}
                          >
                            <RefreshCw />
                            Rejouer
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {rows.length === 0 ? (
            <p className="text-small p-6 text-center text-ink-muted">
              Aucun événement d’intégration à afficher.
            </p>
          ) : null}
        </Card>
      ) : null}
    </section>
  )
}

export function PlatformIntegrationOutbox({
  canReplay,
  online,
}: {
  canReplay: boolean
  online: boolean
}) {
  const health = useQuery(integrationApi.integrationHealth, {})
  const eventsResult = useQuery(integrationApi.listIntegrationEvents, {
    limit: 50,
  })
  const replayIntegrationEvent = useMutation(
    integrationApi.replayIntegrationEvent
  )
  const [replayingEventId, setReplayingEventId] = useState<string>()
  const [replayMessage, setReplayMessage] = useState("")
  const [replayError, setReplayError] = useState("")

  async function replay(eventId: string) {
    setReplayingEventId(eventId)
    setReplayMessage("")
    setReplayError("")
    try {
      await replayIntegrationEvent({
        eventId,
        reason: "Rejeu manuel depuis la supervision du back-office",
        correlationId: createCorrelationId(),
      })
      setReplayMessage("L’événement a été remis en file.")
    } catch (cause) {
      setReplayError(
        cause instanceof Error ? cause.message : "Erreur de rejeu inconnue"
      )
    } finally {
      setReplayingEventId(undefined)
    }
  }

  return (
    <IntegrationOutboxPanel
      health={health}
      events={eventsResult?.events}
      loading={health === undefined || eventsResult === undefined}
      canReplay={canReplay}
      online={online}
      replayingEventId={replayingEventId}
      replayMessage={replayMessage}
      replayError={replayError}
      onReplay={replay}
    />
  )
}
