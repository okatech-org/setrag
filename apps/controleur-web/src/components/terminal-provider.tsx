"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { useConvexAuth, useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { useOnline } from "@/hooks/use-online"
import {
  getManifest,
  getSettings,
  queueSummary,
  saveSettings,
} from "@/lib/offline/db"
import { humanError } from "@/lib/errors"
import { synchronize, type SyncProgress, type SyncTransport } from "@/lib/offline/sync"
import type {
  EmbarkedManifest,
  QueueKind,
  TerminalSettings,
} from "@/lib/offline/types"

interface QueueCounts {
  total: number
  failed: number
  criticalPending: number
  byKind: Record<QueueKind, { pending: number; failed: number; sent: number }>
}

const EMPTY_COUNTS: QueueCounts = {
  total: 0,
  failed: 0,
  criticalPending: 0,
  byKind: {
    incident: { pending: 0, failed: 0, sent: 0 },
    penalty: { pending: 0, failed: 0, sent: 0 },
    sale: { pending: 0, failed: 0, sent: 0 },
    scan: { pending: 0, failed: 0, sent: 0 },
  },
}

interface TerminalContextValue {
  ready: boolean
  online: boolean
  /**
   * Vrai quand le serveur reconnaît la session.
   *
   * À distinguer de `online` : un terminal peut avoir du réseau sans session
   * valide — au démarrage, le temps que l'authentification s'établisse, ou
   * après une reprise hors ligne. Toute lecture ou écriture serveur doit
   * attendre ce drapeau, faute de quoi elle part pour être refusée.
   */
  authenticated: boolean
  settings: TerminalSettings
  manifest: EmbarkedManifest | null
  queue: QueueCounts
  syncing: boolean
  progress: SyncProgress | null
  /** Relit la base embarquée — après toute écriture locale. */
  refresh: () => Promise<void>
  updateSettings: (patch: Partial<TerminalSettings>) => Promise<void>
  setActiveTrip: (tripId: string | undefined, label?: string) => Promise<void>
  syncNow: (options?: { silent?: boolean }) => Promise<void>
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function useTerminal(): TerminalContextValue {
  const value = useContext(TerminalContext)
  if (!value) {
    throw new Error("useTerminal doit être utilisé sous TerminalProvider")
  }
  return value
}

const DEFAULT_SETTINGS: TerminalSettings = {
  coachLabel: "1",
  currentStopIndex: 0,
  torch: false,
  deviceId: "WEB",
}

/**
 * Lecture complète de l'état embarqué.
 *
 * Hors du composant, pour que le premier chargement et les rafraîchissements
 * ultérieurs lisent exactement la même chose — un écart entre les deux ferait
 * apparaître des compteurs incohérents après une écriture.
 */
async function readTerminalState(): Promise<{
  settings: TerminalSettings
  manifest: EmbarkedManifest | null
  queue: QueueCounts
}> {
  const settings = await getSettings()
  const manifest = settings.activeTripId
    ? ((await getManifest(settings.activeTripId)) ?? null)
    : null
  const summary = await queueSummary()
  return {
    settings,
    manifest,
    queue: {
      total: summary.total,
      failed: summary.failed,
      criticalPending: summary.criticalPending,
      byKind: summary.byKind,
    },
  }
}

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const online = useOnline()
  const { isAuthenticated } = useConvexAuth()
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_SETTINGS)
  const [manifest, setManifest] = useState<EmbarkedManifest | null>(null)
  const [queue, setQueue] = useState<QueueCounts>(EMPTY_COUNTS)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)

  const syncScans = useMutation(api.functions.control.syncScans)
  const syncSale = useMutation(api.functions.control.syncSale)
  const syncPenalties = useMutation(api.functions.control.syncPenalties)
  const syncIncidents = useMutation(api.functions.control.syncIncidents)
  const uploadUrl = useMutation(api.functions.control.incidentPhotoUploadUrl)

  const refresh = useCallback(async () => {
    const snapshot = await readTerminalState()
    setSettings(snapshot.settings)
    setManifest(snapshot.manifest)
    setQueue(snapshot.queue)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const snapshot = await readTerminalState()
      if (cancelled) return
      setSettings(snapshot.settings)
      setManifest(snapshot.manifest)
      setQueue(snapshot.queue)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<TerminalSettings>) => {
      setSettings(await saveSettings(patch))
    },
    []
  )

  const setActiveTrip = useCallback(
    async (tripId: string | undefined, label?: string) => {
      await saveSettings({
        activeTripId: tripId,
        activeTripLabel: label,
        currentStopIndex: 0,
      })
      await refresh()
    },
    [refresh]
  )

  /**
   * Les identifiants Convex voyagent en `string` dans la base embarquée : le
   * terminal les stocke sans les interpréter, et le serveur les revalide à
   * l'arrivée. Le cast est donc borné à cette frontière.
   */
  const transport = useMemo<SyncTransport>(
    () => ({
      syncScans: (args) => syncScans(args as never),
      syncSale: (args) => syncSale(args as never),
      syncPenalties: (args) => syncPenalties(args as never),
      syncIncidents: (args) => syncIncidents(args as never),
      uploadUrl: () => uploadUrl({}),
    }),
    [syncScans, syncSale, syncPenalties, syncIncidents, uploadUrl]
  )

  const syncing_ = useRef(false)

  const syncNow = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (syncing_.current) return
      const summary = await queueSummary()
      if (summary.total === 0) {
        if (!options.silent) toast.info("Rien à envoyer : tout est confirmé.")
        return
      }
      if (!navigator.onLine) {
        if (!options.silent) {
          toast.warning("Aucun réseau — l'envoi partira au retour du signal.")
        }
        return
      }
      // Sans session reconnue, chaque envoi serait refusé et marquerait les
      // écritures en échec — un motif trompeur, puisque le problème est la
      // session et non l'écriture. On attend donc, sans rien abîmer.
      if (!isAuthenticated) {
        if (!options.silent) {
          toast.warning(
            "Session non reconnue par le serveur — l'envoi reprendra une fois la session rétablie."
          )
        }
        return
      }

      syncing_.current = true
      setSyncing(true)
      try {
        const report = await synchronize(transport, {
          onProgress: setProgress,
        })
        await refresh()
        if (report.failed === 0 && report.errors.length === 0) {
          if (!options.silent) {
            toast.success(`${report.sent} éléments confirmés.`)
          }
        } else {
          toast.error(
            `${report.failed} éléments en échec — conservés localement.`
          )
        }
        if (report.conflicts > 0) {
          toast.warning(
            `${report.conflicts} conflit(s) signalé(s) — arbitrage requis.`
          )
        }
      } catch (error) {
        toast.error(humanError(error))
      } finally {
        syncing_.current = false
        setSyncing(false)
        setProgress(null)
      }
    },
    [isAuthenticated, refresh, transport]
  )

  // Retour du réseau ET de la session : on tente l'envoi sans rien demander à
  // l'agent, qui a les mains prises. Le silence est voulu — seul un échec
  // l'interrompt.
  useEffect(() => {
    if (!online || !ready || !isAuthenticated) return
    const timer = window.setTimeout(() => void syncNow({ silent: true }), 1500)
    return () => window.clearTimeout(timer)
  }, [isAuthenticated, online, ready, syncNow])

  const value = useMemo<TerminalContextValue>(
    () => ({
      ready,
      online,
      authenticated: isAuthenticated,
      settings,
      manifest,
      queue,
      syncing,
      progress,
      refresh,
      updateSettings,
      setActiveTrip,
      syncNow,
    }),
    [
      ready,
      online,
      isAuthenticated,
      settings,
      manifest,
      queue,
      syncing,
      progress,
      refresh,
      updateSettings,
      setActiveTrip,
      syncNow,
    ]
  )

  return (
    <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>
  )
}
