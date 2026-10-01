/**
 * Téléchargement du manifeste, en gare, avant le départ.
 *
 * Le réseau d'Owendo coupe : le téléchargement avance donc par lots, et
 * chaque lot confirmé est acquis. Une interruption laisse un manifeste
 * partiel — utilisable, mais l'écran doit le dire, car l'absence d'un titre
 * dans un manifeste incomplet ne prouve rien.
 */

import type { FunctionReturnType } from "convex/server"
import type { api } from "@workspace/backend/generated"

import { putManifest, putSubscriptions, putTicketBatch } from "./db"
import type { EmbarkedManifest } from "./types"

type ManifestHeader = FunctionReturnType<typeof api.functions.control.manifest>
type TicketPage = FunctionReturnType<
  typeof api.functions.control.manifestTickets
>

/**
 * Construit l'en-tête embarqué à partir de la réponse du serveur.
 *
 * `requestedAt` est l'heure, au terminal, à laquelle l'en-tête a été demandé :
 * elle date l'instantané de yield (voir `EmbarkedPricing`).
 */
export function toEmbarkedManifest(
  header: ManifestHeader,
  previous?: EmbarkedManifest,
  requestedAt: number = Date.now()
): EmbarkedManifest {
  const stops = header.stops
  // Un serveur plus ancien ne l'envoie pas : la vente à bord se rabat alors
  // sur le barème seul, et le dit.
  const pricing = (header as { pricing?: ManifestHeader["pricing"] }).pricing
  const origin = stops[0]
  const destination = stops[stops.length - 1]
  return {
    tripId: header.trip._id,
    trainNumber: header.trip.trainNumber,
    trainType: header.trip.trainType,
    serviceDate: header.trip.serviceDate,
    departureAt: header.trip.departureAt,
    arrivalAt: header.trip.arrivalAt,
    originName: origin?.name ?? "?",
    destinationName: destination?.name ?? "?",
    segmentCount: header.trip.segmentCount,
    stops: stops.map((s) => ({
      sequence: s.sequence,
      stationId: s.stationId,
      code: s.code,
      name: s.name,
      kilometerPoint: s.kilometerPoint,
      arrivalAt: s.arrivalAt,
      departureAt: s.departureAt,
    })),
    // Un serveur plus ancien ne l'envoie pas : l'écran se rabat alors sur les
    // voitures des titres (`compositionDe`).
    composition: (
      header as { composition?: ManifestHeader["composition"] }
    ).composition?.map((coach) => ({ ...coach, seats: [...coach.seats] })),
    fare: header.fare,
    pricing: pricing && {
      quotas: pricing.quotas.map((quota) => ({ ...quota })),
      rules: pricing.rules.map((rule) => ({ ...rule })),
      bounds: { ...pricing.bounds },
      counters: pricing.counters.map((counter) => ({ ...counter })),
      requestedAt,
    },
    penalties: [...header.penalties],
    signing: header.signing,
    ticketCount: header.ticketCount,
    // Une mise à jour ne repart pas de zéro : ce qui est déjà écrit reste
    // acquis tant que les lots suivants ne l'ont pas remplacé.
    downloadedCount: previous?.downloadedCount ?? 0,
    cursor: previous?.cursor ?? null,
    complete: false,
    updatedAt: Date.now(),
  }
}

export interface DownloadProgress {
  received: number
  total: number
  batch: number
  done: boolean
}

export interface DownloadHandles {
  fetchHeader: (args: {
    tripId: string
    includeTickets: boolean
  }) => Promise<ManifestHeader>
  fetchTickets: (args: {
    tripId: string
    cursor: string | null
    pageSize: number
  }) => Promise<TicketPage>
}

/**
 * Télécharge — ou reprend — le manifeste d'une desserte.
 *
 * `signal` permet à l'agent d'interrompre sans rien perdre : les lots déjà
 * écrits restent utilisables et la reprise repart du dernier curseur confirmé.
 */
export async function downloadManifest(
  tripId: string,
  handles: DownloadHandles,
  options: {
    pageSize?: number
    resume?: EmbarkedManifest
    onProgress?: (p: DownloadProgress) => void
    signal?: AbortSignal
  } = {}
): Promise<EmbarkedManifest> {
  const pageSize = options.pageSize ?? 100
  // Relevée AVANT l'appel : toute vente confirmée plus tôt est dans l'en-tête.
  const requestedAt = Date.now()
  const header = await handles.fetchHeader({ tripId, includeTickets: false })
  let manifest = toEmbarkedManifest(header, options.resume, requestedAt)
  await putManifest(manifest)
  await putSubscriptions(tripId, [...header.subscriptions])

  let cursor = options.resume?.cursor ?? null
  let received = options.resume?.downloadedCount ?? 0
  let batch = 0

  // La boucle s'arrête sur `isDone`, jamais sur un compte attendu : le
  // serveur reste seul juge de la fin de la pagination.
  for (;;) {
    if (options.signal?.aborted) {
      return { ...manifest, downloadedCount: received, cursor, complete: false }
    }
    const page = await handles.fetchTickets({ tripId, cursor, pageSize })
    batch += 1
    received = await putTicketBatch(tripId, [...page.tickets], {
      cursor: page.isDone ? null : page.cursor,
      complete: page.isDone,
    })
    cursor = page.isDone ? null : page.cursor
    manifest = {
      ...manifest,
      downloadedCount: received,
      cursor,
      complete: page.isDone,
      updatedAt: Date.now(),
    }
    options.onProgress?.({
      received,
      total: header.ticketCount,
      batch,
      done: page.isDone,
    })
    if (page.isDone) break
  }

  return manifest
}

/** Âge des données embarquées, en clair — jamais un horodatage brut. */
export function freshness(
  manifest: EmbarkedManifest,
  now = Date.now()
): string {
  const minutes = Math.max(0, Math.round((now - manifest.updatedAt) / 60_000))
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `il y a ${hours} h`
  return `il y a ${Math.round(hours / 24)} j`
}

/**
 * Seuil au-delà duquel le manifeste est réputé périmé.
 *
 * Douze heures : c'est l'ordre de grandeur d'une circulation Owendo –
 * Franceville. Au-delà, des annulations ont pu intervenir sans que le
 * terminal les connaisse — le contrôle reste possible, mais l'écran doit
 * énoncer ce qui n'est plus garanti.
 */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000

export function isStale(manifest: EmbarkedManifest, now = Date.now()): boolean {
  return now - manifest.updatedAt > STALE_AFTER_MS
}
