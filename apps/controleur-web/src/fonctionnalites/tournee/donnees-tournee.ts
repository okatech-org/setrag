"use client"

import { useEffect, useMemo, useState } from "react"

import { listScans, listTickets } from "@/lib/offline/db"
import type {
  EmbarkedManifest,
  EmbarkedTicket,
  LocalScan,
} from "@/lib/offline/types"
import { progressionParVoiture, titresControles } from "@/lib/tournee"
import { compositionDe } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"

/**
 * Titres et contrôles de la desserte embarquée, relus après chaque écriture.
 *
 * Tout vient de la base du terminal : ni la tournée ni le plan d'une voiture
 * ne demandent le réseau.
 */
export function useDonneesTournee(manifest: EmbarkedManifest | null) {
  const { queue } = useTerminal()
  const [lu, setLu] = useState<{
    tripId: string
    tickets: EmbarkedTicket[]
    scans: LocalScan[]
  } | null>(null)

  useEffect(() => {
    if (!manifest) return
    let annule = false
    void (async () => {
      const [tickets, scans] = await Promise.all([
        listTickets(manifest.tripId),
        listScans(manifest.tripId),
      ])
      if (!annule) setLu({ tripId: manifest.tripId, tickets, scans })
    })()
    return () => {
      annule = true
    }
    // La file change à chaque écriture : c'est le signal de relecture.
  }, [manifest, queue.total, queue.byKind.scan.sent])

  const donnees = lu && manifest && lu.tripId === manifest.tripId ? lu : null
  const tickets = useMemo(() => donnees?.tickets ?? [], [donnees])
  const scans = useMemo(() => donnees?.scans ?? [], [donnees])

  return useMemo(() => {
    const controles = titresControles(scans, tickets)
    const composition = manifest
      ? compositionDe(
          manifest,
          tickets.map((t) => t.coachLabel ?? "")
        )
      : []
    return {
      charge: donnees !== null,
      tickets,
      scans,
      controles,
      composition,
      voitures: progressionParVoiture(composition, tickets, controles),
    }
  }, [donnees, manifest, scans, tickets])
}
