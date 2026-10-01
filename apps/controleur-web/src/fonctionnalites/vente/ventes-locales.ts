"use client"

import { useEffect, useState } from "react"

import { listSales } from "@/lib/offline/db"
import type { LocalSale } from "@/lib/offline/types"

import { useTerminal } from "../terminal/contexte-terminal"

const AUCUNE: LocalSale[] = []

/**
 * Ventes à bord de la desserte enregistrées sur ce terminal.
 *
 * Relues à chaque mouvement de la file d'envoi : une vente encaissée, puis
 * confirmée, change ce que le manifeste compte déjà. Le devis à bord en
 * retranche celles qu'il ne compte pas encore (`quoteOnboard`).
 */
export function useVentesLocales(tripId: string | undefined): LocalSale[] {
  const { queue } = useTerminal()
  const { pending, failed, sent } = queue.byKind.sale
  const [lues, setLues] = useState<{ tripId: string; ventes: LocalSale[] }>()

  useEffect(() => {
    if (!tripId) return
    let annule = false
    void listSales(tripId).then((ventes) => {
      if (!annule) setLues({ tripId, ventes })
    })
    return () => {
      annule = true
    }
  }, [tripId, pending, failed, sent])

  return lues && lues.tripId === tripId ? lues.ventes : AUCUNE
}
