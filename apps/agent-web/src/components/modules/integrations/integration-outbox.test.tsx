import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  formatIntegrationAge,
  IntegrationOutboxPanel,
  normalizeIntegrationError,
  shouldLoadIntegrationOutbox,
  type IntegrationEventDto,
  type IntegrationHealthDto,
} from "./integration-outbox"

const NOW = new Date("2026-09-10T10:00:00.000Z").getTime()

const health: IntegrationHealthDto = {
  generatedAt: NOW,
  truncated: false,
  totals: {
    en_attente: 4,
    en_cours: 1,
    envoye: 82,
    rejete: 2,
  },
  due: 3,
  oldestPendingAgeMs: 7_500_000,
  endpoints: [],
}

const rejectedEvent: IntegrationEventDto = {
  _id: "event-rejected-1",
  endpointId: "endpoint-sage",
  type: "fret.order.approved",
  schemaVersion: 1,
  idempotencyKey: "fret-order-42-approved",
  entityType: "freightOrder",
  entityId: "order-42",
  status: "rejete",
  attempts: 3,
  maxAttempts: 3,
  nextAttemptAt: NOW - 60_000,
  error: {
    code: "ENDPOINT_UNAVAILABLE",
    message: "Error: SAGE X3 indisponible\ntrace technique interne",
    retryable: true,
    occurredAt: NOW - 300_000,
  },
  correlationId: "correlation-42",
  createdAt: NOW - 7_500_000,
  updatedAt: NOW - 300_000,
  rejectedAt: NOW - 300_000,
  endpoint: {
    code: "SAGE_X3",
    name: "SAGE X3",
    transport: "http",
  },
}

afterEach(() => {
  vi.useRealTimers()
})

describe("supervision de l’outbox plateforme", () => {
  it("reste désactivée tant que le backend plateforme n’est pas déclaré compatible", () => {
    expect(
      shouldLoadIntegrationOutbox({
        apiEnabled: false,
        isIntegrationSection: true,
        canConsult: true,
      })
    ).toBe(false)
    expect(
      shouldLoadIntegrationOutbox({
        apiEnabled: true,
        isIntegrationSection: true,
        canConsult: true,
      })
    ).toBe(true)
  })

  it("présente les états, l’ancienneté, les tentatives et une erreur normalisée", () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    render(
      <IntegrationOutboxPanel
        health={health}
        events={[rejectedEvent]}
        canReplay={false}
        online
      />
    )

    expect(
      screen.getByRole("heading", { name: "Outbox plateforme" })
    ).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByText("En attente")).toBeInTheDocument()
    expect(screen.getByText("82")).toBeInTheDocument()
    expect(screen.getByText("Envoyés")).toBeInTheDocument()
    expect(screen.getByText("2 h 5 min")).toBeInTheDocument()
    expect(screen.getByText("3 / 3")).toBeInTheDocument()
    expect(screen.getByText("SAGE X3 indisponible")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /rejouer/i })
    ).not.toBeInTheDocument()
  })

  it("n’affiche le rejeu d’un événement rejeté qu’à un utilisateur autorisé", () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const replay = vi.fn()

    render(
      <IntegrationOutboxPanel
        health={health}
        events={[rejectedEvent]}
        canReplay
        online
        onReplay={replay}
      />
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Rejouer l’événement fret.order.approved",
      })
    )
    expect(replay).toHaveBeenCalledWith("event-rejected-1")
  })
})

describe("formatage de la supervision", () => {
  it("normalise les erreurs sans exposer les traces multilignes", () => {
    expect(
      normalizeIntegrationError("ConvexError: délai dépassé\nstack secret")
    ).toBe("délai dépassé")
    expect(normalizeIntegrationError(undefined)).toBe("Aucune erreur signalée")
  })

  it("formate les durées opérationnelles en français", () => {
    expect(formatIntegrationAge(null)).toBe("Aucun événement en attente")
    expect(formatIntegrationAge(125_000)).toBe("2 min")
    expect(formatIntegrationAge(90_000_000)).toBe("1 j 1 h")
  })
})
