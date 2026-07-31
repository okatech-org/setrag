/**
 * Types de la base embarquée du terminal contrôleur.
 *
 * Tout ce qui vit ici est écrit AVANT d'être envoyé : le contrôle en pleine
 * voie est le cas nominal, pas un mode dégradé. Chaque écriture porte donc un
 * identifiant client, seule garantie qu'un lot rejoué après une coupure ne
 * duplique rien.
 */

/** Verdicts rendus par la vérification locale d'un titre. */
export type Verdict =
  | "valide"
  | "abonnement"
  | "contrefait"
  | "illisible"
  | "cle_hors_service"
  | "mauvaise_desserte"
  | "hors_segment"
  | "expire"
  | "annule"
  | "rembourse"
  | "deja_controle"
  | "non_paye"
  | "inconnu"

/**
 * Résultat de contrôle tel qu'il part vers `control.syncScans`.
 *
 * Ces valeurs sont celles de l'énumération `scanResult` du schéma Convex, et
 * doivent le rester : une valeur inconnue du serveur ferait échouer tout le
 * lot à la validation d'arguments, en bloc et sans recours. Un test compare
 * les deux listes pour que la divergence ne puisse pas s'installer.
 */
export type ScanResult =
  | "valide"
  | "signature_invalide"
  | "illisible"
  | "cle_hors_service"
  | "mauvaise_desserte"
  | "hors_segment"
  | "expire"
  | "deja_controle"
  | "annule"
  | "rembourse"
  | "non_paye"
  | "inconnu"

/** État d'un élément dans la file d'envoi. */
export type SyncState = "pending" | "sent" | "failed"

/** Nature d'une écriture en attente, qui commande sa priorité d'envoi. */
export type QueueKind = "incident" | "penalty" | "sale" | "scan"

/**
 * Ordre d'envoi, du plus urgent au plus ordinaire.
 *
 * Un incident critique part avant tout le reste : c'est le seul élément dont
 * le retard a une conséquence physique à bord. Les contrôles ferment la
 * marche — ils sont nombreux et leur valeur est comptable, pas opérationnelle.
 */
export const QUEUE_PRIORITY: Record<QueueKind, number> = {
  incident: 0,
  penalty: 1,
  sale: 2,
  scan: 3,
}

export interface QueueEntry {
  /** Identifiant client de l'écriture métier — clé d'idempotence. */
  id: string
  kind: QueueKind
  /** 0 pour un incident critique, sinon la priorité de la nature. */
  priority: number
  createdAt: number
  state: SyncState
  attempts: number
  lastError?: string
  lastAttemptAt?: number
}

/* ───────────────────────────── Manifeste ────────────────────────────────── */

export interface EmbarkedStop {
  sequence: number
  stationId: string
  code: string
  name: string
  kilometerPoint: number
  arrivalAt?: number
  departureAt?: number
}

export interface EmbarkedTicket {
  _id: string
  number: string
  passenger: {
    lastName: string
    firstName: string
    gender: "M" | "F"
    phone?: string
  }
  serviceClass: string
  seatLabel?: string
  coachLabel?: string
  fromStopIndex: number
  toStopIndex: number
  status: string
  barcodePayload?: string
}

export interface EmbarkedSubscription {
  _id: string
  cardNumber: string
  kind: string
  serviceClass: string
  validFrom: number
  validUntil: number
  barcodePayload?: string
}

export interface EmbarkedFareBase {
  trainType: string
  serviceClass: string
  shortDistanceRate: number
  longDistanceRate: number
}

export interface EmbarkedFare {
  scheduleId: string
  label: string
  validFrom: number
  validUntil: number
  roundingBasis: "HT" | "TTC"
  vatPct: number
  cssPct: number
  bases: EmbarkedFareBase[]
}

export interface PenaltyScaleRow {
  reason: "sans_titre" | "titre_invalide" | "classe_superieure" | "autre"
  label: string
  amountXaf: number
}

/** En-tête du manifeste : tout sauf les titres, qui arrivent par lots. */
export interface EmbarkedManifest {
  tripId: string
  trainNumber: string
  trainType: string
  serviceDate: string
  departureAt: number
  arrivalAt?: number
  originName: string
  destinationName: string
  segmentCount: number
  stops: EmbarkedStop[]
  fare: EmbarkedFare | null
  penalties: PenaltyScaleRow[]
  signing: { publicKey: string; keyVersion: number; isDemoKey: boolean }
  /** Nombre total de titres à embarquer, annoncé par le serveur. */
  ticketCount: number
  /** Nombre de titres réellement écrits en base locale. */
  downloadedCount: number
  /** Curseur du prochain lot, `null` quand le manifeste est complet. */
  cursor: string | null
  complete: boolean
  /** Instant de la dernière mise à jour réussie. */
  updatedAt: number
}

/* ─────────────────────────── Écritures locales ──────────────────────────── */

export interface LocalScan {
  clientScanId: string
  tripId: string
  ticketId?: string
  ticketNumber?: string
  subscriptionId?: string
  passengerName?: string
  result: ScanResult
  verdict: Verdict
  reason?: string
  stopIndex?: number
  coachLabel?: string
  scannedAt: number
  offline: boolean
  state: SyncState
}

export interface LocalSale {
  clientSaleId: string
  tripId: string
  originStationId: string
  destinationStationId: string
  originName: string
  destinationName: string
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  passengers: Array<{
    lastName: string
    firstName: string
    gender: "M" | "F"
    phone?: string
  }>
  distanceKm: number
  quotedXaf: number
  tenderedXaf?: number
  changeXaf?: number
  method: "especes" | "airtel_money" | "moov_money"
  /** Référence provisoire montrée au voyageur avant la synchronisation. */
  localRef: string
  soldAt: number
  state: SyncState
  /** Numéro définitif attribué par le serveur, après envoi. */
  serverSaleNumber?: string
  serverTicketNumbers?: string[]
  serverXaf?: number
}

export interface LocalPenalty {
  clientId: string
  tripId: string
  ticketId?: string
  offender: {
    lastName?: string
    firstName?: string
    documentNumber?: string
    phone?: string
    declined: boolean
  }
  reason: PenaltyScaleRow["reason"]
  notes?: string
  fineXaf: number
  legXaf: number
  legLabel?: string
  amountXaf: number
  paidOnBoard: boolean
  signature: "signe" | "refuse" | "aucune"
  issuedAt: number
  offline: boolean
  /** Numéro provisoire, opposable à bord avant toute synchronisation. */
  localNumber: string
  state: SyncState
  serverNumber?: string
}

export interface LocalIncident {
  clientId: string
  tripId?: string
  category: "securite" | "technique" | "comportement" | "medical" | "autre"
  severity: "information" | "important" | "critique"
  description: string
  location?: string
  photoIds: string[]
  reportedAt: number
  offline: boolean
  localNumber: string
  state: SyncState
}

export interface LocalPhoto {
  id: string
  incidentClientId: string
  blob: Blob
  capturedAt: number
  /** Identifiant de stockage Convex, une fois la photo envoyée. */
  storageId?: string
}

/** Réglages persistants du terminal, indépendants de la tournée. */
export interface TerminalSettings {
  activeTripId?: string
  /**
   * Libellé de la desserte choisie, retenu dès la sélection.
   *
   * Sans lui, l'écran de téléchargement ne saurait nommer la desserte tant
   * que son manifeste n'est pas arrivé — et afficherait « aucune desserte »
   * à un agent qui vient précisément d'en choisir une.
   */
  activeTripLabel?: string
  coachLabel: string
  currentStopIndex: number
  torch: boolean
  deviceId: string
  /** Empreinte du code court de verrouillage, jamais le code lui-même. */
  lockHash?: string
  lockedAt?: number
  lastActivityAt?: number
  /**
   * Empreinte de la dernière session ouverte avec le réseau.
   *
   * C'est ce qui permet de rouvrir le terminal en pleine voie : le serveur est
   * injoignable, mais on sait QUI a ouvert cette session et quand. Sans cette
   * trace, l'application resterait bloquée sur « ouverture de session » —
   * exactement au moment où l'agent en a le plus besoin.
   *
   * Aucune donnée sensible n'y figure : un matricule et un rôle, que le
   * terminal affiche déjà en clair sur chaque écran.
   */
  session?: {
    matricule: string
    role: string
    openedAt: number
  }
}
