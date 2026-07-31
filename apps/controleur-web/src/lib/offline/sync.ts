/**
 * Synchronisation de la file d'envoi.
 *
 * Trois principes, tirés du terrain :
 *
 *  — l'ordre est une décision d'exploitation. Un incident critique part avant
 *    tout le reste, parce que son retard a une conséquence physique à bord ;
 *
 *  — un échec ne supprime rien. L'écriture reste due, avec son motif et son
 *    nombre de tentatives, jusqu'à ce qu'elle passe ;
 *
 *  — rien n'est envoyé sans clé d'idempotence. Une reprise après coupure
 *    rejoue le lot en entier ; c'est le serveur qui reconnaît ce qu'il a déjà.
 */

import { humanError } from "../errors"
import {
  getRecord,
  listPhotos,
  markFailed,
  markSent,
  patchRecord,
  listPending,
  updatePhoto,
} from "./db"
import type {
  LocalIncident,
  LocalPenalty,
  LocalSale,
  LocalScan,
  QueueEntry,
} from "./types"

/** Appels serveur dont la synchronisation a besoin, injectés par l'appelant. */
export interface SyncTransport {
  syncScans: (args: {
    scans: Array<{
      clientScanId: string
      tripId: string
      ticketId?: string
      subscriptionId?: string
      result: LocalScan["result"]
      stopIndex?: number
      scannedAt: number
      offline: boolean
    }>
  }) => Promise<{ created: number; duplicates: number; conflicts: number }>

  syncSale: (args: {
    clientSaleId: string
    tripId: string
    originStationId: string
    destinationStationId: string
    serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
    passengers: LocalSale["passengers"]
    quotedXaf: number
    method: LocalSale["method"]
    deviceId?: string
  }) => Promise<{
    status: "cree" | "doublon"
    saleNumber: string
    ticketNumbers: string[]
    serverXaf: number
  }>

  syncPenalties: (args: {
    penalties: Array<{
      clientId: string
      tripId: string
      ticketId?: string
      offender: LocalPenalty["offender"]
      reason: LocalPenalty["reason"]
      notes?: string
      amountXaf: number
      paidOnBoard: boolean
      issuedAt: number
      offline: boolean
    }>
  }) => Promise<{ created: number; duplicates: number; numbers: string[] }>

  syncIncidents: (args: {
    incidents: Array<{
      clientId: string
      tripId?: string
      category: LocalIncident["category"]
      severity: LocalIncident["severity"]
      description: string
      photoStorageIds?: string[]
      reportedAt: number
      offline: boolean
    }>
  }) => Promise<{ created: number; duplicates: number; critical: number }>

  /** Jeton d'envoi d'une photo, obtenu juste avant le téléversement. */
  uploadUrl: () => Promise<string>
}

export interface SyncProgress {
  sent: number
  total: number
  batch: number
  batchCount: number
  label: string
}

export interface SyncReport {
  sent: number
  failed: number
  conflicts: number
  errors: string[]
}

/** Taille des lots. Assez grand pour être efficace, assez petit pour reprendre. */
const BATCH_SIZE = 50

/**
 * Envoie tout ce qui attend, dans l'ordre des priorités.
 *
 * Les contrôles et procès-verbaux partent groupés — leurs mutations sont
 * idempotentes par lot. Les ventes partent une par une : une mutation Convex
 * est une transaction, et un refus au milieu d'un lot annulerait les ventes
 * déjà passées du même envoi.
 */
export async function synchronize(
  transport: SyncTransport,
  options: { onProgress?: (p: SyncProgress) => void } = {}
): Promise<SyncReport> {
  const pending = (await listPending()).filter((e) => e.state !== "sent")
  const report: SyncReport = { sent: 0, failed: 0, conflicts: 0, errors: [] }
  if (pending.length === 0) return report

  const groups = groupInOrder(pending)
  const batchCount = groups.length
  let batch = 0

  for (const group of groups) {
    batch += 1
    options.onProgress?.({
      sent: report.sent,
      total: pending.length,
      batch,
      batchCount,
      label: GROUP_LABELS[group.kind],
    })
    try {
      await sendGroup(group, transport, report)
    } catch (error) {
      const message = humanError(error)
      report.errors.push(message)
      for (const entry of group.entries) {
        await markFailed(entry.kind, entry.id, message)
        report.failed += 1
      }
    }
    options.onProgress?.({
      sent: report.sent,
      total: pending.length,
      batch,
      batchCount,
      label: GROUP_LABELS[group.kind],
    })
  }

  return report
}

const GROUP_LABELS: Record<QueueEntry["kind"], string> = {
  incident: "Incidents",
  penalty: "Procès-verbaux",
  sale: "Ventes à bord",
  scan: "Contrôles",
}

interface Group {
  kind: QueueEntry["kind"]
  entries: QueueEntry[]
}

/** Découpe la file en lots homogènes, en conservant l'ordre de priorité. */
function groupInOrder(entries: QueueEntry[]): Group[] {
  const groups: Group[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && last.kind === entry.kind && last.entries.length < BATCH_SIZE) {
      last.entries.push(entry)
    } else {
      groups.push({ kind: entry.kind, entries: [entry] })
    }
  }
  return groups
}

async function sendGroup(
  group: Group,
  transport: SyncTransport,
  report: SyncReport
): Promise<void> {
  switch (group.kind) {
    case "scan":
      return await sendScans(group.entries, transport, report)
    case "sale":
      return await sendSales(group.entries, transport, report)
    case "penalty":
      return await sendPenalties(group.entries, transport, report)
    case "incident":
      return await sendIncidents(group.entries, transport, report)
  }
}

async function sendScans(
  entries: QueueEntry[],
  transport: SyncTransport,
  report: SyncReport
): Promise<void> {
  const records = await loadAll<LocalScan>("scan", entries)
  if (records.length === 0) return

  const result = await transport.syncScans({
    scans: records.map((s) => ({
      clientScanId: s.clientScanId,
      tripId: s.tripId,
      ticketId: s.ticketId,
      subscriptionId: s.subscriptionId,
      result: s.result,
      stopIndex: s.stopIndex,
      scannedAt: s.scannedAt,
      offline: s.offline,
    })),
  })
  report.conflicts += result.conflicts
  for (const scan of records) {
    await markSent("scan", scan.clientScanId)
    report.sent += 1
  }
}

async function sendSales(
  entries: QueueEntry[],
  transport: SyncTransport,
  report: SyncReport
): Promise<void> {
  const records = await loadAll<LocalSale>("sale", entries)
  for (const sale of records) {
    // Une vente refusée — desserte fermée, segment complet — ne doit pas
    // emporter les autres : elle est notée en échec et reste due.
    try {
      const done = await transport.syncSale({
        clientSaleId: sale.clientSaleId,
        tripId: sale.tripId,
        originStationId: sale.originStationId,
        destinationStationId: sale.destinationStationId,
        serviceClass: sale.serviceClass,
        passengers: sale.passengers,
        quotedXaf: sale.quotedXaf,
        method: sale.method,
      })
      await patchRecord("sale", sale.clientSaleId, {
        serverSaleNumber: done.saleNumber,
        serverTicketNumbers: done.ticketNumbers,
        serverXaf: done.serverXaf,
      })
      await markSent("sale", sale.clientSaleId)
      report.sent += 1
    } catch (error) {
      const message = humanError(error)
      await markFailed("sale", sale.clientSaleId, message)
      report.failed += 1
      report.errors.push(`Vente ${sale.localRef} : ${message}`)
    }
  }
}

async function sendPenalties(
  entries: QueueEntry[],
  transport: SyncTransport,
  report: SyncReport
): Promise<void> {
  const records = await loadAll<LocalPenalty>("penalty", entries)
  if (records.length === 0) return

  const result = await transport.syncPenalties({
    penalties: records.map((p) => ({
      clientId: p.clientId,
      tripId: p.tripId,
      ticketId: p.ticketId,
      offender: p.offender,
      reason: p.reason,
      notes: p.notes,
      amountXaf: p.amountXaf,
      paidOnBoard: p.paidOnBoard,
      issuedAt: p.issuedAt,
      offline: p.offline,
    })),
  })
  // Les numéros définitifs reviennent dans l'ordre des créations ; un doublon
  // n'en produit pas, d'où l'appariement prudent.
  const created = records.filter((p) => !p.serverNumber)
  created.forEach((p, index) => {
    const number = result.numbers[index]
    if (number) void patchRecord("penalty", p.clientId, { serverNumber: number })
  })
  for (const pv of records) {
    await markSent("penalty", pv.clientId)
    report.sent += 1
  }
}

async function sendIncidents(
  entries: QueueEntry[],
  transport: SyncTransport,
  report: SyncReport
): Promise<void> {
  const records = await loadAll<LocalIncident>("incident", entries)
  if (records.length === 0) return

  // Les photos partent avant leur incident : le signalement doit arriver
  // complet, faute de quoi la preuve manquerait au dossier.
  const photoIdsByIncident = new Map<string, string[]>()
  for (const incident of records) {
    const stored: string[] = []
    for (const photo of await listPhotos(incident.clientId)) {
      if (photo.storageId) {
        stored.push(photo.storageId)
        continue
      }
      const url = await transport.uploadUrl()
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": photo.blob.type || "image/jpeg" },
        body: photo.blob,
      })
      if (!response.ok) {
        throw new Error(`Envoi de photo refusé (${response.status})`)
      }
      const { storageId } = (await response.json()) as { storageId: string }
      await updatePhoto({ ...photo, storageId })
      stored.push(storageId)
    }
    photoIdsByIncident.set(incident.clientId, stored)
  }

  await transport.syncIncidents({
    incidents: records.map((i) => ({
      clientId: i.clientId,
      tripId: i.tripId,
      category: i.category,
      severity: i.severity,
      description: i.description,
      photoStorageIds: photoIdsByIncident.get(i.clientId),
      reportedAt: i.reportedAt,
      offline: i.offline,
    })),
  })
  for (const incident of records) {
    await markSent("incident", incident.clientId)
    report.sent += 1
  }
}

async function loadAll<T>(
  kind: QueueEntry["kind"],
  entries: QueueEntry[]
): Promise<T[]> {
  const out: T[] = []
  for (const entry of entries) {
    const record = await getRecord<T>(kind, entry.id)
    if (record) out.push(record)
  }
  return out
}
