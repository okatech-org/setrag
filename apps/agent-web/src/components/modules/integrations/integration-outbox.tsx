"use client"

import { Network, RefreshCw } from "lucide-react"
import { useState } from "react"
import type { FunctionReference } from "convex/server"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import { Indicateur, Indicateurs, Panneau } from "@/components/charte"

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
  { label: string; tone: "info" | "warning" | "success" | "danger" }
> = {
  en_attente: { label: "En attente", tone: "warning" },
  en_cours: { label: "En cours", tone: "info" },
  envoye: { label: "Envoyés", tone: "success" },
  rejete: { label: "Rejetés", tone: "danger" },
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
    <Panneau
      titre="Outbox plateforme"
      icone={Network}
      sousTitre="Événements inter-modules suivis jusqu’à leur acquittement"
      actions={
        health ? (
          <span className="tabular text-[12.5px] text-ink-muted" role="status">
            Plus ancien en attente : {formatIntegrationAge(health.oldestPendingAgeMs)}
            {health.due > 0 ? ` · ${health.due} à traiter` : ""}
          </span>
        ) : null
      }
    >
      {loading ? (
        <SkeletonLines />
      ) : health ? (
        <Indicateurs colonnes={4}>
          {(Object.keys(STATUS_PRESENTATION) as IntegrationEventStatus[]).map((status) => (
            <Indicateur
              key={status}
              libelle={STATUS_PRESENTATION[status].label}
              valeur={health.totals[status].toLocaleString("fr-FR")}
            />
          ))}
        </Indicateurs>
      ) : (
        <InlineMessage tone="warning" title="Supervision indisponible.">
          L’état de l’outbox n’a pas pu être chargé.
        </InlineMessage>
      )}

      {replayMessage ? <InlineMessage tone="success" title={replayMessage} /> : null}
      {replayError ? (
        <InlineMessage tone="danger" title="Le rejeu a échoué.">
          {normalizeIntegrationError(replayError)}
        </InlineMessage>
      ) : null}

      {!loading && health ? (
        rows.length === 0 ? (
          <EmptyState
            title="Aucun événement d’intégration à afficher."
            description="Les modules publient ici leurs échanges avec les systèmes tiers."
          />
        ) : (
          <div className="relative overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-[14px]">
              <caption className="sr-only">
                {health.truncated
                  ? `Derniers événements affichés (limite ${rows.length}).`
                  : "Derniers événements d’intégration."}
              </caption>
              <thead>
                <tr className="bg-surface-sunk text-left text-[11.5px] tracking-[0.05em] text-ink-muted uppercase">
                  <th scope="col" className="px-3.5 py-2.5">Événement</th>
                  <th scope="col" className="px-3.5 py-2.5">Destination</th>
                  <th scope="col" className="px-3.5 py-2.5">Âge</th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">Tentatives</th>
                  <th scope="col" className="hidden px-3.5 py-2.5 md:table-cell">Dernière erreur</th>
                  <th scope="col" className="px-3.5 py-2.5">État</th>
                  {canReplay ? (
                    <th scope="col" className="px-3.5 py-2.5 text-right">Action</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((event) => {
                  const presentation = STATUS_PRESENTATION[event.status]
                  const isReplaying = replayingEventId === event._id
                  return (
                    <tr key={event._id} className="border-t border-line">
                      <td className="px-3.5 py-2.5">
                        <b className="block max-w-64 truncate font-semibold" title={event.type}>
                          {event.type}
                        </b>
                        <small className="text-[12.5px] text-ink-muted">
                          {event.entityType} · {event.entityId}
                        </small>
                      </td>
                      <td className="px-3.5 py-2.5">
                        {event.endpoint?.name ?? "Destination supprimée"}
                        {event.endpoint ? (
                          <small className="block text-[12.5px] text-ink-muted">
                            {event.endpoint.code} · {event.endpoint.transport}
                          </small>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <time className="tabular text-[13px]" dateTime={new Date(event.createdAt).toISOString()}>
                          {formatIntegrationAge(Math.max(health.generatedAt - event.createdAt, 0))}
                        </time>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                        {event.attempts} / {event.maxAttempts}
                      </td>
                      <td className="hidden px-3.5 py-2.5 md:table-cell">
                        <span className="block max-w-72 truncate" title={normalizeIntegrationError(event.error?.message)}>
                          {normalizeIntegrationError(event.error?.message)}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Tag tone={presentation.tone}>{presentation.label}</Tag>
                      </td>
                      {canReplay ? (
                        <td className="px-3.5 py-2.5 text-right">
                          {event.status === "rejete" ? (
                            <Button
                              type="button"
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
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </Panneau>
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
