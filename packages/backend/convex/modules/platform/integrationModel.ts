/** Logique pure de la machine d'état de l'outbox plateforme. */

export const MAX_BACKOFF_MS = 24 * 60 * 60 * 1_000
export const MAX_ERROR_MESSAGE_LENGTH = 500

export type IntegrationStatus = "en_attente" | "en_cours" | "envoye" | "rejete"

export interface IntegrationErrorInput {
  code: string
  message: string
  retryable: boolean
}

export interface NormalizedIntegrationError extends IntegrationErrorInput {
  occurredAt: number
}

/**
 * Calcule le délai de la tentative suivante. La première erreur attend le
 * délai de base, puis le délai double sans jamais dépasser 24 heures.
 */
export function integrationBackoffMs(
  baseBackoffMs: number,
  attempts: number,
  maximumMs = MAX_BACKOFF_MS
): number {
  if (!Number.isFinite(baseBackoffMs) || baseBackoffMs < 1) {
    throw new Error("Le délai de reprise de base doit être positif.")
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Le nombre de tentatives doit être un entier positif.")
  }
  if (!Number.isFinite(maximumMs) || maximumMs < 1) {
    throw new Error("Le délai maximal de reprise doit être positif.")
  }

  const exponent = Math.min(attempts - 1, 52)
  return Math.min(maximumMs, baseBackoffMs * 2 ** exponent)
}

export function normalizeIntegrationError(
  error: IntegrationErrorInput,
  occurredAt: number
): NormalizedIntegrationError {
  const rawCode = error.code.trim().toUpperCase()
  const code = rawCode.replace(/[^A-Z0-9_.-]+/g, "_").slice(0, 80) || "UNKNOWN"
  const message = error.message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)

  return {
    code,
    message: message || "Erreur d'intégration sans détail.",
    retryable: error.retryable,
    occurredAt,
  }
}

/** Une erreur non rejouable ou la dernière tentative épuise l'événement. */
export function shouldRejectIntegrationEvent(params: {
  attempts: number
  maxAttempts: number
  retryable: boolean
}): boolean {
  return !params.retryable || params.attempts >= params.maxAttempts
}
