"use client"

import { CircleAlertIcon, CircleCheckIcon, CloudUploadIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Tag } from "@workspace/ui/components/tag"

import { useTerminal } from "@/fonctionnalites/terminal/contexte-terminal"
import { getRecord } from "@/lib/offline/db"
import type { QueueKind, SyncState } from "@/lib/offline/types"

/**
 * L'état d'envoi d'une écriture, relu à chaque mouvement de la file : ce qui
 * est écrit « en attente d'envoi » l'est vraiment, et devient « envoyé »
 * quand le serveur a confirmé.
 */
export function useEtatEnvoi<T extends { state: SyncState }>(nature: QueueKind, id: string | undefined) {
  const { queue } = useTerminal()
  const [enregistrement, setEnregistrement] = useState<T | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    let annule = false
    void getRecord<T>(nature, id).then((lu) => {
      if (!annule) setEnregistrement(lu)
    })
    return () => {
      annule = true
    }
  }, [id, nature, queue.total, queue.failed])
  return enregistrement
}

/** Pastille d'état d'envoi : un mot et une icône, jamais la teinte seule. */
export function PastilleEnvoi({ etat, className }: { etat: SyncState | undefined; className?: string }) {
  if (etat === "sent") {
    return (
      <Tag tone="success" className={className}>
        <CircleCheckIcon aria-hidden />
        envoyé
      </Tag>
    )
  }
  if (etat === "failed") {
    return (
      <Tag tone="danger" className={className}>
        <CircleAlertIcon aria-hidden />
        échec · conservé
      </Tag>
    )
  }
  return (
    <Tag tone="warning" className={className}>
      <CloudUploadIcon aria-hidden />
      en attente d&apos;envoi
    </Tag>
  )
}
