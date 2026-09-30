/**
 * Le fil d'une conversation avec Ruban, tel que l'interface le garde.
 *
 * Le backend conserve les messages et les résultats structurés de chaque tour
 * (`assistantTurns`) ; l'interface y ajoute ce qui ne concerne qu'elle : l'état
 * d'envoi, l'état de la réponse pendant son flux, l'état des cartes.
 */

/** Une carte du fil : un résultat métier que l'interface sait montrer. */
export interface Carte {
  /** `show_trip_results`, `show_quote`, `show_booking`, `request_sign_in`… */
  type: string
  payload: unknown
}

export type EtatApprobation = "ouverte" | "en-cours" | "confirmee" | "refusee" | "echec"

/** Une action engageante préparée par Ruban : elle n'aboutit que par un geste. */
export interface Approbation {
  callId: string
  toolName: string
  label: string
  input: unknown
  etat: EtatApprobation
  /** Résultat métier après confirmation (réservation créée, paiement…). */
  resultat?: unknown
  erreur?: string
}

export type Entree =
  | {
      id: string
      role: "moi"
      texte: string
      vocal?: boolean
      envoi: "en-cours" | "ok" | "echec"
    }
  | {
      id: string
      role: "ruban"
      texte: string
      cartes: Carte[]
      approbations: Approbation[]
      vocal?: boolean
      /**
       * `en-cours` : la réponse s'écrit — le texte est celui réellement reçu
       * du serveur, au fil du flux ; `erreur` : elle s'est interrompue, le
       * texte reçu reste. Absent : terminée, cartes comprises.
       */
      etat?: "en-cours" | "erreur"
      /** Libellé montré quand la réponse s'est interrompue. */
      erreur?: string
      /** Identifiant de la question (clé d'idempotence), pour la relancer. */
      question?: string
      /** Reçue en direct dans cet onglet : annoncée une fois complète. */
      direct?: boolean
    }

export function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function texteDe(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

export function nombreDe(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
