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

import { useTerminal } from "../terminal/contexte-terminal"

/**
 * Enchaînement d'un contrôle, de bout en bout.
 *
 * Regroupé ici plutôt que dispersé dans les écrans : lire un code, le
 * chercher dans le manifeste, rendre un verdict puis l'enregistrer forment
 * une seule opération, et trois écrans l'exécutent — le viseur, la recherche
 * manuelle et le plan de voiture. Trois copies de cette logique
 * divergeraient.
 */

export interface ResultatControle extends VerificationResult {
  code: string
  /** Vrai quand le titre vient du manifeste (recherche, plan), pas du viseur. */
  manuel: boolean
}

/** Vérifie un code contre le manifeste embarqué, sans rien enregistrer. */
export async function inspecterCode(
  code: string,
  manifest: EmbarkedManifest,
  currentStopIndex: number,
  options: { manuel?: boolean } = {}
): Promise<ResultatControle> {
  // Une première passe sans manifeste donne la référence du titre ; on ne va
  // le chercher en base qu'ensuite, car un code illisible n'a pas de référence.
  const preliminaire = verifyLocally(code, { manifest, currentStopIndex })
  const ref = preliminaire.payload?.ref
  if (!ref) return { ...preliminaire, code, manuel: Boolean(options.manuel) }

  const [ticket, subscription, priorScans] = await Promise.all([
    getTicketByNumber(manifest.tripId, ref),
    getSubscriptionByCard(manifest.tripId, ref),
    scansForTicket(ref),
  ])

  const resultat = verifyLocally(code, {
    manifest,
    currentStopIndex,
    ticket,
    subscription,
    priorScans,
  })
  return { ...resultat, code, manuel: Boolean(options.manuel) }
}

/**
 * Enregistre le contrôle dans la base embarquée et le met en file, dans une
 * seule transaction (`commitOperation`).
 *
 * Tout verdict sur un titre est enregistré, refus compris : c'est ce qui
 * permet de prouver qu'un titre contrefait a été présenté, et de compter les
 * voyageurs réellement vus dans la voiture.
 */
export async function enregistrerControle(
  resultat: ResultatControle,
  contexte: {
    manifest: EmbarkedManifest
    currentStopIndex: number
    coachLabel: string
    online: boolean
  }
): Promise<LocalScan> {
  const scan: LocalScan = {
    clientScanId: clientId("scan"),
    tripId: contexte.manifest.tripId,
    ticketId: resultat.ticket?._id,
    ticketNumber: resultat.ticket?.number ?? resultat.payload?.ref,
    subscriptionId: resultat.subscription?._id,
    passengerName: resultat.ticket
      ? `${resultat.ticket.passenger.lastName} ${resultat.ticket.passenger.firstName}`
      : undefined,
    result: toScanResult(resultat.verdict),
    verdict: resultat.verdict,
    reason: resultat.reason ?? undefined,
    stopIndex: contexte.currentStopIndex,
    coachLabel: contexte.coachLabel,
    scannedAt: nowMs(),
    offline: !contexte.online,
    state: "pending",
  }
  await commitOperation("scan", scan.clientScanId, scan)
  return scan
}

/** Les deux opérations ci-dessus, liées au contexte du terminal. */
export function useControle() {
  const { manifest, settings, online, refresh } = useTerminal()

  const inspecter = useCallback(
    async (code: string, options: { manuel?: boolean } = {}) => {
      if (!manifest) {
        throw new Error("Aucun manifeste embarqué : téléchargez-le d'abord.")
      }
      return await inspecterCode(code, manifest, settings.currentStopIndex, options)
    },
    [manifest, settings.currentStopIndex]
  )

  const enregistrer = useCallback(
    async (resultat: ResultatControle) => {
      if (!manifest) throw new Error("Aucun manifeste embarqué")
      const scan = await enregistrerControle(resultat, {
        manifest,
        currentStopIndex: settings.currentStopIndex,
        coachLabel: settings.coachLabel,
        online,
      })
      await refresh()
      return scan
    },
    [manifest, online, refresh, settings.coachLabel, settings.currentStopIndex]
  )

  return { inspecter, enregistrer }
}
