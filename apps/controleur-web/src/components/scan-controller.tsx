"use client"

import { useCallback } from "react"

import {
  commitOperation,
  getSubscriptionByCard,
  getTicketByNumber,
  scansForTicket,
} from "@/lib/offline/db"
import { clientId, nowMs } from "@/lib/offline/ids"
import type { EmbarkedManifest, LocalScan } from "@/lib/offline/types"
import { toScanResult, verifyLocally, type VerificationResult } from "@/lib/offline/verify"

/**
 * Enchaînement d'un contrôle, de bout en bout.
 *
 * Regroupé ici plutôt que dispersé dans les écrans : scanner un code, le
 * chercher dans le manifeste, rendre un verdict puis l'enregistrer forment une
 * seule opération, et deux écrans l'exécutent — le viseur et la recherche
 * manuelle. Deux copies de cette logique divergeraient.
 */

export interface ControlOutcome extends VerificationResult {
  barcode: string
  /** Vrai quand le titre vient de la recherche manuelle, pas du viseur. */
  manual: boolean
}

/** Vérifie un code contre le manifeste embarqué, sans rien enregistrer. */
export async function inspectBarcode(
  barcode: string,
  manifest: EmbarkedManifest,
  currentStopIndex: number,
  options: { manual?: boolean } = {}
): Promise<ControlOutcome> {
  // Une première passe sans manifeste donne la référence du titre ; on ne va
  // le chercher en base qu'ensuite, car un code illisible n'a pas de référence.
  const preliminaire = verifyLocally(barcode, {
    manifest,
    currentStopIndex,
  })
  const ref = preliminaire.payload?.ref
  if (!ref) return { ...preliminaire, barcode, manual: Boolean(options.manual) }

  const [ticket, subscription, priorScans] = await Promise.all([
    getTicketByNumber(manifest.tripId, ref),
    getSubscriptionByCard(manifest.tripId, ref),
    scansForTicket(ref),
  ])

  const result = verifyLocally(barcode, {
    manifest,
    currentStopIndex,
    ticket,
    subscription,
    priorScans,
  })
  return { ...result, barcode, manual: Boolean(options.manual) }
}

/**
 * Enregistre le contrôle dans la base embarquée et le met en file.
 *
 * Tout contrôle est enregistré, y compris un refus : c'est ce qui permet de
 * prouver qu'un titre contrefait a été présenté, et de compter les voyageurs
 * réellement vus dans la voiture.
 */
export async function recordControl(
  outcome: ControlOutcome,
  context: {
    manifest: EmbarkedManifest
    currentStopIndex: number
    coachLabel: string
    online: boolean
  }
): Promise<LocalScan> {
  const scan: LocalScan = {
    clientScanId: clientId("scan"),
    tripId: context.manifest.tripId,
    ticketId: outcome.ticket?._id,
    ticketNumber: outcome.ticket?.number ?? outcome.payload?.ref,
    subscriptionId: outcome.subscription?._id,
    passengerName: outcome.ticket
      ? `${outcome.ticket.passenger.lastName} ${outcome.ticket.passenger.firstName}`
      : undefined,
    result: toScanResult(outcome.verdict),
    verdict: outcome.verdict,
    reason: outcome.reason ?? undefined,
    stopIndex: context.currentStopIndex,
    coachLabel: context.coachLabel,
    scannedAt: nowMs(),
    offline: !context.online,
    state: "pending",
  }
  await commitOperation("scan", scan.clientScanId, scan)
  return scan
}

/** Version React des deux opérations ci-dessus, liée au contexte terminal. */
export function useControl(context: {
  manifest: EmbarkedManifest | null
  currentStopIndex: number
  coachLabel: string
  online: boolean
  onRecorded?: () => void
}) {
  const inspect = useCallback(
    async (barcode: string, options: { manual?: boolean } = {}) => {
      if (!context.manifest) {
        throw new Error("Aucun manifeste embarqué : téléchargez-le d'abord.")
      }
      return await inspectBarcode(
        barcode,
        context.manifest,
        context.currentStopIndex,
        options
      )
    },
    [context.manifest, context.currentStopIndex]
  )

  const record = useCallback(
    async (outcome: ControlOutcome) => {
      if (!context.manifest) throw new Error("Aucun manifeste embarqué")
      const scan = await recordControl(outcome, {
        manifest: context.manifest,
        currentStopIndex: context.currentStopIndex,
        coachLabel: context.coachLabel,
        online: context.online,
      })
      context.onRecorded?.()
      return scan
    },
    [context]
  )

  return { inspect, record }
}
