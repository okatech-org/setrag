/**
 * Classification des anomalies d'exploitation — logique pure.
 *
 * L'objet n'est pas de détecter des pannes : Convex s'en charge. C'est de
 * repérer ce qui ne se voit pas — un déversement comptable resté en file, une
 * caisse jamais fermée, un barème provisoire encore actif en production. Ces
 * situations ne lèvent aucune erreur ; elles s'installent.
 *
 * Les seuils sont ici, pas dans les requêtes, pour qu'on puisse les discuter
 * et les tester sans base de données.
 */

/** Gravité d'un constat, du plus bénin au plus urgent. */
export type Severity = "info" | "avertissement" | "critique"

export interface Finding {
  readonly code: string
  readonly severity: Severity
  readonly label: string
  /** Ce qu'il faut faire, pas seulement ce qui ne va pas. */
  readonly action: string
  readonly count: number
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * Seuils d'exploitation.
 *
 * Justifications plutôt que valeurs rondes : un déversement comptable qui
 * traîne plus d'une journée ouvrée décale la comptabilité ; une caisse ouverte
 * au-delà de 24 h a traversé une relève d'équipe sans être comptée.
 */
export const THRESHOLDS = {
  /** Au-delà, un événement en file mérite qu'on regarde. */
  outboxPendingMs: 6 * HOUR,
  /** Au-delà, la comptabilité prend du retard. */
  outboxPendingCriticalMs: 36 * HOUR,
  /** Nombre de tentatives à partir duquel l'échec n'est plus transitoire. */
  outboxFailedAttempts: 3,
  /** Une journée comptable ouverte au-delà a sauté sa clôture. */
  accountingDayOpenMs: 36 * HOUR,
  /** Une caisse ouverte au-delà a traversé une relève sans être comptée. */
  cashSessionOpenMs: DAY,
  /** Une réservation non libérée bien après son échéance : le cron ne tourne plus. */
  staleHoldGraceMs: HOUR,
} as const

/* ─────────────────────────── Constats élémentaires ─────────────────────── */

export interface OutboxEventView {
  readonly status: "en_attente" | "envoye" | "echec"
  readonly attempts: number
  readonly createdAt: number
}

/** Événements de file restés en attente ou en échec durable. */
export function classifyOutbox(
  events: readonly OutboxEventView[],
  now: number,
): Finding[] {
  const findings: Finding[] = []

  const pending = events.filter((e) => e.status === "en_attente")
  const attardés = pending.filter(
    (e) => now - e.createdAt > THRESHOLDS.outboxPendingMs,
  )
  const bloqués = pending.filter(
    (e) => now - e.createdAt > THRESHOLDS.outboxPendingCriticalMs,
  )

  if (bloqués.length > 0) {
    findings.push({
      code: "outbox_bloque",
      severity: "critique",
      label: `${bloqués.length} déversement(s) en file depuis plus de 36 h`,
      action:
        "Vérifier la disponibilité de SAGE X3, puis relancer depuis " +
        "l'écran d'intégration comptable.",
      count: bloqués.length,
    })
  } else if (attardés.length > 0) {
    findings.push({
      code: "outbox_attarde",
      severity: "avertissement",
      label: `${attardés.length} déversement(s) en file depuis plus de 6 h`,
      action: "Surveiller ; relancer si la situation persiste demain.",
      count: attardés.length,
    })
  }

  const échecs = events.filter(
    (e) =>
      e.status === "echec" && e.attempts >= THRESHOLDS.outboxFailedAttempts,
  )
  if (échecs.length > 0) {
    findings.push({
      code: "outbox_echec_persistant",
      severity: "critique",
      label: `${échecs.length} déversement(s) en échec après plusieurs tentatives`,
      action:
        "L'échec n'est plus transitoire : lire le message d'erreur avant " +
        "de relancer, sous peine de répéter la même tentative.",
      count: échecs.length,
    })
  }

  return findings
}

/** Journées comptables restées ouvertes au-delà du délai de clôture. */
export function classifyAccountingDays(
  days: readonly { status: string; openedAt: number }[],
  now: number,
): Finding[] {
  const ouvertes = days.filter(
    (d) =>
      d.status === "ouverte" &&
      now - d.openedAt > THRESHOLDS.accountingDayOpenMs,
  )
  if (ouvertes.length === 0) return []
  return [
    {
      code: "journee_non_cloturee",
      severity: "critique",
      label: `${ouvertes.length} journée(s) comptable(s) ouverte(s) depuis plus de 36 h`,
      action:
        "Le contrôleur de recettes doit valider la journée avant que le " +
        "comptable puisse déverser.",
      count: ouvertes.length,
    },
  ]
}

/** Sessions de caisse jamais fermées. */
export function classifyCashSessions(
  sessions: readonly { status: string; openedAt: number }[],
  now: number,
): Finding[] {
  const ouvertes = sessions.filter(
    (s) =>
      s.status === "ouverte" &&
      now - s.openedAt > THRESHOLDS.cashSessionOpenMs,
  )
  if (ouvertes.length === 0) return []
  return [
    {
      code: "caisse_non_fermee",
      severity: "avertissement",
      label: `${ouvertes.length} session(s) de caisse ouverte(s) depuis plus de 24 h`,
      action:
        "Une caisse qui traverse une relève sans être comptée rend tout " +
        "écart inattribuable. Faire fermer par le vendeur concerné.",
      count: ouvertes.length,
    },
  ]
}

/**
 * Réservations expirées que le cron n'a pas libérées.
 *
 * C'est un contrôle du cron lui-même : s'il tournait, cette liste serait
 * vide. Une place immobilisée par une réservation abandonnée est une place
 * invendue.
 */
export function classifyStaleHolds(
  holds: readonly { priceLockedUntil?: number }[],
  now: number,
): Finding[] {
  const périmées = holds.filter(
    (h) =>
      h.priceLockedUntil !== undefined &&
      now - h.priceLockedUntil > THRESHOLDS.staleHoldGraceMs,
  )
  if (périmées.length === 0) return []
  return [
    {
      code: "reservations_non_liberees",
      severity: "critique",
      label: `${périmées.length} réservation(s) expirée(s) non libérée(s)`,
      action:
        "Le cron « expire stale holds » ne tourne plus : des places restent " +
        "immobilisées sans contrepartie.",
      count: périmées.length,
    },
  ]
}

/**
 * Configuration de démonstration encore en service.
 *
 * Ces deux constats ne sont pas des pannes mais des risques : un titre signé
 * par la clé du dépôt n'a aucune valeur probante, et un barème provisoire ne
 * doit jamais facturer un client réel.
 */
export function classifyDemoConfiguration(input: {
  usingDemoSigningKey: boolean
  provisionalFareCount: number
}): Finding[] {
  const findings: Finding[] = []

  if (input.usingDemoSigningKey) {
    findings.push({
      code: "cle_de_demonstration",
      severity: "avertissement",
      label: "Les titres sont signés avec la clé de démonstration du dépôt",
      action:
        "Poser BARCODE_SIGNING_KEY_V1 sur le déploiement, puis re-signer " +
        "les titres existants. Sans cela, les billets portent la mention " +
        "SPÉCIMEN et n'ont aucune valeur probante.",
      count: 1,
    })
  }

  if (input.provisionalFareCount > 0) {
    findings.push({
      code: "bareme_provisoire",
      severity: "info",
      label: `${input.provisionalFareCount} tarif(s) provisoire(s) actif(s)`,
      action:
        "Valeurs de démonstration en attente des barèmes SETRAG. " +
        "À purger avant toute facturation réelle.",
      count: input.provisionalFareCount,
    })
  }

  return findings
}

/* ──────────────────────────────── Synthèse ─────────────────────────────── */

/** Verdict d'ensemble : la gravité la plus élevée observée. */
export function overallSeverity(findings: readonly Finding[]): Severity {
  if (findings.some((f) => f.severity === "critique")) return "critique"
  if (findings.some((f) => f.severity === "avertissement")) {
    return "avertissement"
  }
  return "info"
}

/** Trie du plus urgent au plus bénin, à nombre égal le plus nombreux d'abord. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const rang: Record<Severity, number> = {
    critique: 0,
    avertissement: 1,
    info: 2,
  }
  return [...findings].sort(
    (a, b) => rang[a.severity] - rang[b.severity] || b.count - a.count,
  )
}
