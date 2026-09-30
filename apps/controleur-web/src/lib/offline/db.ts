/**
 * Base embarquée du terminal, sur IndexedDB.
 *
 * Le plan d'origine visait SQLite chiffré par SQLCipher, qui suppose une
 * application native. Sur le web, IndexedDB est le seul magasin transactionnel
 * disponible ; le chiffrement au repos revient alors au terminal lui-même
 * (verrouillage d'écran, chiffrement du profil). C'est le point où le portage
 * web s'écarte du plan mobile, et il est assumé : en échange, l'application
 * s'installe sans magasin d'applications sur n'importe quel terminal.
 *
 * Ce qui, en revanche, est tenu à l'identique : chaque écriture métier et son
 * entrée en file d'envoi sont écrites dans UNE SEULE transaction. Sans cela,
 * une coupure entre les deux écritures produirait soit un contrôle jamais
 * envoyé, soit un envoi sans objet.
 */

import type {
  EmbarkedManifest,
  EmbarkedSubscription,
  EmbarkedTicket,
  LocalIncident,
  LocalPenalty,
  LocalPhoto,
  LocalSale,
  LocalScan,
  QueueEntry,
  QueueKind,
  SyncState,
  TerminalSettings,
} from "./types"
import { INCIDENT_PRIORITY, QUEUE_PRIORITY } from "./types"

export const DB_NAME = "setrag-controle"
export const DB_VERSION = 1

export const STORES = {
  manifests: "manifests",
  tickets: "tickets",
  subscriptions: "subscriptions",
  scans: "scans",
  sales: "sales",
  penalties: "penalties",
  incidents: "incidents",
  photos: "photos",
  queue: "queue",
  settings: "settings",
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

let handle: Promise<IDBDatabase> | null = null

/** Ouvre — et crée au besoin — la base embarquée. */
export function openDb(): Promise<IDBDatabase> {
  if (handle) return handle
  handle = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible sur ce terminal"))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.manifests)) {
        db.createObjectStore(STORES.manifests, { keyPath: "tripId" })
      }
      if (!db.objectStoreNames.contains(STORES.tickets)) {
        const s = db.createObjectStore(STORES.tickets, { keyPath: "key" })
        s.createIndex("by_trip", "tripId")
        s.createIndex("by_number", "number")
        // La recherche manuelle interroge ces trois axes, et eux seuls : le
        // manifeste peut compter des centaines de titres, un balayage complet
        // à chaque frappe se verrait à l'écran.
        s.createIndex("by_trip_search", ["tripId", "searchName"])
        s.createIndex("by_trip_seat", ["tripId", "seatLabel"])
      }
      if (!db.objectStoreNames.contains(STORES.subscriptions)) {
        const s = db.createObjectStore(STORES.subscriptions, { keyPath: "key" })
        s.createIndex("by_trip", "tripId")
        s.createIndex("by_card", "cardNumber")
      }
      if (!db.objectStoreNames.contains(STORES.scans)) {
        const s = db.createObjectStore(STORES.scans, { keyPath: "clientScanId" })
        s.createIndex("by_trip", "tripId")
        s.createIndex("by_ticket", "ticketNumber")
        s.createIndex("by_state", "state")
      }
      if (!db.objectStoreNames.contains(STORES.sales)) {
        const s = db.createObjectStore(STORES.sales, { keyPath: "clientSaleId" })
        s.createIndex("by_trip", "tripId")
        s.createIndex("by_state", "state")
      }
      if (!db.objectStoreNames.contains(STORES.penalties)) {
        const s = db.createObjectStore(STORES.penalties, { keyPath: "clientId" })
        s.createIndex("by_trip", "tripId")
        s.createIndex("by_state", "state")
      }
      if (!db.objectStoreNames.contains(STORES.incidents)) {
        const s = db.createObjectStore(STORES.incidents, { keyPath: "clientId" })
        s.createIndex("by_state", "state")
      }
      if (!db.objectStoreNames.contains(STORES.photos)) {
        const s = db.createObjectStore(STORES.photos, { keyPath: "id" })
        s.createIndex("by_incident", "incidentClientId")
      }
      if (!db.objectStoreNames.contains(STORES.queue)) {
        const s = db.createObjectStore(STORES.queue, { keyPath: "id" })
        s.createIndex("by_state", "state")
        s.createIndex("by_kind", "kind")
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return handle
}

/**
 * Ferme la connexion et oublie le cache d'ouverture.
 *
 * La fermeture n'est pas décorative : tant qu'une connexion reste ouverte,
 * `deleteDatabase` et les montées de version restent bloqués indéfiniment.
 */
export async function closeDb(): Promise<void> {
  const current = handle
  handle = null
  if (!current) return
  try {
    ;(await current).close()
  } catch {
    // Une base déjà fermée ou jamais ouverte n'a rien à libérer.
  }
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Attend la fin d'une transaction, pas seulement celle de ses requêtes. */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("Transaction interrompue"))
  })
}

async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDb()
  const tx = db.transaction(store, mode)
  const result = await run(tx.objectStore(store))
  await done(tx)
  return result
}

/* ─────────────────────────────── Manifeste ──────────────────────────────── */

export async function putManifest(manifest: EmbarkedManifest): Promise<void> {
  await withStore(STORES.manifests, "readwrite", (s) => wrap(s.put(manifest)))
}

export async function getManifest(
  tripId: string
): Promise<EmbarkedManifest | undefined> {
  return await withStore(STORES.manifests, "readonly", (s) =>
    wrap<EmbarkedManifest | undefined>(s.get(tripId))
  )
}

export async function listManifests(): Promise<EmbarkedManifest[]> {
  return await withStore(STORES.manifests, "readonly", (s) =>
    wrap<EmbarkedManifest[]>(s.getAll())
  )
}

/** Titre embarqué, augmenté des clés qui rendent la recherche indexable. */
type StoredTicket = EmbarkedTicket & {
  key: string
  tripId: string
  searchName: string
}

function ticketKey(tripId: string, number: string): string {
  return `${tripId}::${number}`
}

/** Forme normalisée d'un nom : sans accents, en capitales. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
}

/**
 * Écrit un lot de titres et avance le curseur du manifeste, ensemble.
 *
 * Un lot écrit sans que le curseur bouge serait rejoué à la reprise ; un
 * curseur avancé sans ses titres laisserait un trou définitif dans le
 * manifeste. Les deux vont donc dans la même transaction.
 */
export async function putTicketBatch(
  tripId: string,
  tickets: EmbarkedTicket[],
  progress: { cursor: string | null; complete: boolean }
): Promise<number> {
  const db = await openDb()
  const tx = db.transaction([STORES.tickets, STORES.manifests], "readwrite")
  const store = tx.objectStore(STORES.tickets)
  for (const ticket of tickets) {
    const stored: StoredTicket = {
      ...ticket,
      key: ticketKey(tripId, ticket.number),
      tripId,
      searchName: normalize(
        `${ticket.passenger.lastName} ${ticket.passenger.firstName}`
      ),
    }
    store.put(stored)
  }
  const manifests = tx.objectStore(STORES.manifests)
  const current = await wrap<EmbarkedManifest | undefined>(manifests.get(tripId))
  let total = 0
  if (current) {
    // Le compte se déduit des clés écrites, pas d'un cumul : un lot rejoué
    // après une coupure ne doit pas gonfler le compteur.
    total = await wrap<number>(
      store.index("by_trip").count(IDBKeyRange.only(tripId))
    )
    manifests.put({
      ...current,
      downloadedCount: total,
      cursor: progress.cursor,
      complete: progress.complete,
      updatedAt: Date.now(),
    })
  }
  await done(tx)
  return total
}

export async function putSubscriptions(
  tripId: string,
  subscriptions: EmbarkedSubscription[]
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORES.subscriptions, "readwrite")
  const store = tx.objectStore(STORES.subscriptions)
  for (const sub of subscriptions) {
    store.put({ ...sub, key: `${tripId}::${sub.cardNumber}`, tripId })
  }
  await done(tx)
}

export async function getTicketByNumber(
  tripId: string,
  number: string
): Promise<EmbarkedTicket | undefined> {
  return await withStore(STORES.tickets, "readonly", (s) =>
    wrap<StoredTicket | undefined>(s.get(ticketKey(tripId, number)))
  )
}

export async function listTickets(tripId: string): Promise<EmbarkedTicket[]> {
  return await withStore(STORES.tickets, "readonly", (s) =>
    wrap<StoredTicket[]>(s.index("by_trip").getAll(IDBKeyRange.only(tripId)))
  )
}

export async function getSubscriptionByCard(
  tripId: string,
  cardNumber: string
): Promise<EmbarkedSubscription | undefined> {
  return await withStore(STORES.subscriptions, "readonly", (s) =>
    wrap<EmbarkedSubscription | undefined>(s.get(`${tripId}::${cardNumber}`))
  )
}

export async function listSubscriptions(
  tripId: string
): Promise<EmbarkedSubscription[]> {
  return await withStore(STORES.subscriptions, "readonly", (s) =>
    wrap<EmbarkedSubscription[]>(
      s.index("by_trip").getAll(IDBKeyRange.only(tripId))
    )
  )
}

/* ───────────────────────── Écritures et file d'envoi ────────────────────── */

const STORE_BY_KIND: Record<QueueKind, StoreName> = {
  scan: STORES.scans,
  sale: STORES.sales,
  penalty: STORES.penalties,
  incident: STORES.incidents,
}

/**
 * Rang d'envoi d'une écriture.
 *
 * Un incident prend le rang de sa gravité (`INCIDENT_PRIORITY`) : seul le
 * critique passe en tête de file. Les autres natures ont un rang fixe.
 */
function priorityOf(
  kind: QueueKind,
  record: LocalScan | LocalSale | LocalPenalty | LocalIncident
): number {
  if (kind === "incident" && "severity" in record) {
    return INCIDENT_PRIORITY[record.severity] ?? QUEUE_PRIORITY.incident
  }
  return QUEUE_PRIORITY[kind]
}

/**
 * Écrit une opération de terrain ET son entrée en file, atomiquement.
 *
 * C'est l'unique porte d'entrée des écritures locales. Tout ce qui doit
 * remonter au système passe par elle, ce qui rend impossible l'oubli d'une
 * mise en file.
 */
export async function commitOperation(
  kind: QueueKind,
  id: string,
  record: LocalScan | LocalSale | LocalPenalty | LocalIncident,
  options: { priority?: number } = {}
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_BY_KIND[kind], STORES.queue], "readwrite")
  tx.objectStore(STORE_BY_KIND[kind]).put(record)
  const entry: QueueEntry = {
    id,
    kind,
    priority: options.priority ?? priorityOf(kind, record),
    createdAt: Date.now(),
    state: "pending",
    attempts: 0,
  }
  tx.objectStore(STORES.queue).put(entry)
  await done(tx)
}

/** Enregistre une photo d'incident, avant même que l'incident existe. */
export async function putPhoto(photo: LocalPhoto): Promise<void> {
  await withStore(STORES.photos, "readwrite", (s) => wrap(s.put(photo)))
}

export async function listPhotos(
  incidentClientId: string
): Promise<LocalPhoto[]> {
  return await withStore(STORES.photos, "readonly", (s) =>
    wrap<LocalPhoto[]>(
      s.index("by_incident").getAll(IDBKeyRange.only(incidentClientId))
    )
  )
}

export async function updatePhoto(photo: LocalPhoto): Promise<void> {
  await withStore(STORES.photos, "readwrite", (s) => wrap(s.put(photo)))
}

export async function listQueue(): Promise<QueueEntry[]> {
  const all = await withStore(STORES.queue, "readonly", (s) =>
    wrap<QueueEntry[]>(s.getAll())
  )
  // L'ordre d'envoi est un choix d'exploitation, pas d'implémentation : il
  // est donc appliqué ici, une fois, plutôt que redécidé par chaque appelant.
  return all.sort(
    (a, b) => a.priority - b.priority || a.createdAt - b.createdAt
  )
}

export async function listPending(): Promise<QueueEntry[]> {
  return (await listQueue()).filter((e) => e.state !== "sent")
}

/**
 * Marque une écriture comme confirmée par le serveur.
 *
 * L'entrée de file et l'enregistrement métier changent d'état ensemble : un
 * enregistrement « envoyé » dont la file ignore la confirmation repartirait
 * au prochain lot.
 */
export async function markSent(kind: QueueKind, id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_BY_KIND[kind], STORES.queue], "readwrite")
  const store = tx.objectStore(STORE_BY_KIND[kind])
  const record = await wrap<Record<string, unknown> | undefined>(store.get(id))
  if (record) store.put({ ...record, state: "sent" })
  const queue = tx.objectStore(STORES.queue)
  const entry = await wrap<QueueEntry | undefined>(queue.get(id))
  if (entry) {
    queue.put({ ...entry, state: "sent", lastAttemptAt: Date.now() })
  }
  await done(tx)
}

/** Note l'échec d'un envoi. Rien n'est supprimé : l'écriture reste due. */
export async function markFailed(
  kind: QueueKind,
  id: string,
  error: string
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_BY_KIND[kind], STORES.queue], "readwrite")
  const store = tx.objectStore(STORE_BY_KIND[kind])
  const record = await wrap<Record<string, unknown> | undefined>(store.get(id))
  if (record) store.put({ ...record, state: "failed" })
  const queue = tx.objectStore(STORES.queue)
  const entry = await wrap<QueueEntry | undefined>(queue.get(id))
  if (entry) {
    queue.put({
      ...entry,
      state: "failed",
      attempts: entry.attempts + 1,
      lastError: error,
      lastAttemptAt: Date.now(),
    })
  }
  await done(tx)
}

/** Complète un enregistrement local avec ce que le serveur a répondu. */
export async function patchRecord(
  kind: QueueKind,
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  await withStore(STORE_BY_KIND[kind], "readwrite", async (s) => {
    const record = await wrap<Record<string, unknown> | undefined>(s.get(id))
    if (record) await wrap(s.put({ ...record, ...patch }))
  })
}

export async function listScans(tripId?: string): Promise<LocalScan[]> {
  const all = await withStore(STORES.scans, "readonly", (s) =>
    wrap<LocalScan[]>(s.getAll())
  )
  const kept = tripId ? all.filter((s) => s.tripId === tripId) : all
  return kept.sort((a, b) => b.scannedAt - a.scannedAt)
}

/**
 * Contrôles déjà enregistrés pour un titre — le garde-fou anti-repassage.
 *
 * Il ne voit que ce terminal : un titre présenté deux fois dans la même
 * voiture est détecté immédiatement, un titre présenté à deux agents
 * différents ne l'est qu'à la synchronisation. C'est la limite inhérente au
 * travail hors ligne, pas un défaut d'implémentation.
 */
export async function scansForTicket(
  ticketNumber: string
): Promise<LocalScan[]> {
  return await withStore(STORES.scans, "readonly", (s) =>
    wrap<LocalScan[]>(s.index("by_ticket").getAll(IDBKeyRange.only(ticketNumber)))
  )
}

export async function listSales(tripId?: string): Promise<LocalSale[]> {
  const all = await withStore(STORES.sales, "readonly", (s) =>
    wrap<LocalSale[]>(s.getAll())
  )
  const kept = tripId ? all.filter((s) => s.tripId === tripId) : all
  return kept.sort((a, b) => b.soldAt - a.soldAt)
}

export async function listPenalties(tripId?: string): Promise<LocalPenalty[]> {
  const all = await withStore(STORES.penalties, "readonly", (s) =>
    wrap<LocalPenalty[]>(s.getAll())
  )
  const kept = tripId ? all.filter((p) => p.tripId === tripId) : all
  return kept.sort((a, b) => b.issuedAt - a.issuedAt)
}

export async function listIncidents(): Promise<LocalIncident[]> {
  const all = await withStore(STORES.incidents, "readonly", (s) =>
    wrap<LocalIncident[]>(s.getAll())
  )
  return all.sort((a, b) => b.reportedAt - a.reportedAt)
}

export async function getRecord<T>(
  kind: QueueKind,
  id: string
): Promise<T | undefined> {
  return await withStore(STORE_BY_KIND[kind], "readonly", (s) =>
    wrap<T | undefined>(s.get(id))
  )
}

/** Compte les écritures par nature et par état, pour les compteurs d'écran. */
export async function queueSummary(): Promise<{
  total: number
  byKind: Record<QueueKind, { pending: number; failed: number; sent: number }>
  failed: number
  criticalPending: number
  /** Dernière tentative d'envoi en échec : la reprise part 30 s après. */
  lastFailedAt?: number
}> {
  const entries = await listQueue()
  const byKind = {
    incident: { pending: 0, failed: 0, sent: 0 },
    penalty: { pending: 0, failed: 0, sent: 0 },
    sale: { pending: 0, failed: 0, sent: 0 },
    scan: { pending: 0, failed: 0, sent: 0 },
  } satisfies Record<QueueKind, Record<SyncState, number>>

  let failed = 0
  let criticalPending = 0
  let lastFailedAt: number | undefined
  for (const entry of entries) {
    byKind[entry.kind][entry.state] += 1
    if (entry.state === "failed") {
      failed += 1
      if (entry.lastAttemptAt !== undefined) {
        lastFailedAt = Math.max(lastFailedAt ?? 0, entry.lastAttemptAt)
      }
    }
    if (entry.priority === 0 && entry.state !== "sent") criticalPending += 1
  }
  const total = entries.filter((e) => e.state !== "sent").length
  return { total, byKind, failed, criticalPending, lastFailedAt }
}

/* ──────────────────────────────── Réglages ─────────────────────────────── */

const SETTINGS_KEY = "terminal"

export async function getSettings(): Promise<TerminalSettings> {
  const row = await withStore(STORES.settings, "readonly", (s) =>
    wrap<{ key: string; value: TerminalSettings } | undefined>(
      s.get(SETTINGS_KEY)
    )
  )
  return (
    row?.value ?? {
      coachLabel: "1",
      currentStopIndex: 0,
      torch: false,
      deviceId: newDeviceId(),
    }
  )
}

export async function saveSettings(
  patch: Partial<TerminalSettings>
): Promise<TerminalSettings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await withStore(STORES.settings, "readwrite", (s) =>
    wrap(s.put({ key: SETTINGS_KEY, value: next }))
  )
  return next
}

function newDeviceId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `WEB-${random.toUpperCase()}`
}

/* ─────────────────────────────────  Purge ──────────────────────────────── */

/**
 * Efface les données voyageurs du terminal.
 *
 * Elle n'est offerte qu'une fois la tournée entièrement confirmée : purger
 * une écriture non envoyée la perdrait pour de bon. Les réglages du terminal
 * survivent — ils ne contiennent aucune donnée personnelle.
 */
export async function purgeLocalData(): Promise<void> {
  const pending = await listPending()
  if (pending.length > 0) {
    throw new Error(
      `Purge refusée : ${pending.length} écritures ne sont pas confirmées`
    )
  }
  const db = await openDb()
  const targets: StoreName[] = [
    STORES.manifests,
    STORES.tickets,
    STORES.subscriptions,
    STORES.scans,
    STORES.sales,
    STORES.penalties,
    STORES.incidents,
    STORES.photos,
    STORES.queue,
  ]
  const tx = db.transaction(targets, "readwrite")
  for (const name of targets) tx.objectStore(name).clear()
  await done(tx)
  await saveSettings({
    activeTripId: undefined,
    activeTripLabel: undefined,
    currentStopIndex: 0,
    currentStopConfirmedAt: undefined,
  })
}
