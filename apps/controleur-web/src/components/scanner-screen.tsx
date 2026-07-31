"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { CameraOff, Flashlight, Search, Train } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { humanError } from "@/lib/errors"
import { listScans } from "@/lib/offline/db"
import { isStale } from "@/lib/offline/manifest"
import {
  decodeFrame,
  describeCameraFailure,
  openCamera,
  type CameraFailure,
  type CameraHandle,
} from "@/lib/scanner"
import { NetworkBadge } from "./network-badge"
import { useControl, type ControlOutcome } from "./scan-controller"
import { useTerminal } from "./terminal-provider"
import { VerdictSheet } from "./verdict-sheet"

/**
 * Viseur — CM-04.
 *
 * L'écran le plus utilisé de la tournée, donc le plus dépouillé : le viseur
 * occupe la hauteur, et trois commandes seulement l'entourent — lampe,
 * voiture, recherche manuelle. Tout le reste se fait depuis le verdict.
 *
 * Le décodage tourne à intervalle fixe plutôt qu'à chaque image : décoder 60
 * fois par seconde viderait la batterie d'un terminal qui doit tenir une
 * desserte de douze heures, sans lire un code de plus.
 */

const DECODE_INTERVAL_MS = 320

export function ScannerScreen() {
  const { manifest, settings, online, updateSettings, refresh, queue } =
    useTerminal()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef<CameraHandle | null>(null)
  const busy = useRef(false)

  const [cameraError, setCameraError] = useState<CameraFailure | null>(null)
  const [opening, setOpening] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [outcome, setOutcome] = useState<ControlOutcome | null>(null)
  const [controls, setControls] = useState(0)
  const [manualCode, setManualCode] = useState("")
  const [showManual, setShowManual] = useState(false)

  // La lampe est un réglage persistant : on le suit dans une référence pour
  // ne pas en faire une dépendance de l'ouverture caméra, qui ne doit se
  // produire qu'une fois — la relancer couperait le flux en plein contrôle.
  const torchWanted = useRef(settings.torch)
  useEffect(() => {
    torchWanted.current = settings.torch
  }, [settings.torch])

  const { inspect, record } = useControl({
    manifest,
    currentStopIndex: settings.currentStopIndex,
    coachLabel: settings.coachLabel,
    online,
    onRecorded: () => void refresh(),
  })

  useEffect(() => {
    if (!manifest) return
    void listScans(manifest.tripId).then((scans) => setControls(scans.length))
  }, [manifest, queue.total])

  /* ── Caméra ──────────────────────────────────────────────────────────── */

  /**
   * Ouvre le viseur. Rappelable : un refus d'autorisation se rattrape sans
   * quitter l'écran, ce qui compte quand la seule alternative est de saisir à
   * la main les codes de toute une voiture.
   */
  const startCamera = useCallback(async () => {
    setOpening(true)
    setCameraError(null)
    try {
      cameraRef.current?.stop()
      const camera = await openCamera()
      cameraRef.current = camera
      setTorchAvailable(camera.torchAvailable)
      if (videoRef.current) {
        videoRef.current.srcObject = camera.stream
        await videoRef.current.play()
      }
      if (torchWanted.current && camera.torchAvailable) {
        await camera.setTorch(true)
      }
      return true
    } catch (error) {
      setCameraError(describeCameraFailure(error))
      return false
    } finally {
      setOpening(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const camera = await openCamera().catch((error: unknown) => {
        if (!cancelled) setCameraError(describeCameraFailure(error))
        return null
      })
      if (!camera) return
      if (cancelled) {
        camera.stop()
        return
      }
      cameraRef.current = camera
      setTorchAvailable(camera.torchAvailable)
      if (videoRef.current) {
        videoRef.current.srcObject = camera.stream
        await videoRef.current.play()
      }
      if (torchWanted.current && camera.torchAvailable) {
        await camera.setTorch(true)
      }
    })()
    return () => {
      cancelled = true
      cameraRef.current?.stop()
      cameraRef.current = null
    }
    // La caméra s'ouvre une fois pour toute la durée de l'écran : la relancer
    // à chaque changement de réglage couperait le flux en plein contrôle.
  }, [])

  const handleCode = useCallback(
    async (barcode: string, manual = false) => {
      if (busy.current) return
      busy.current = true
      try {
        const result = await inspect(barcode, { manual })
        setOutcome(result)
        if (navigator.vibrate) navigator.vibrate(result.verdict === "valide" ? 40 : [40, 60, 40])
      } catch (error) {
        toast.error(humanError(error))
      } finally {
        busy.current = false
      }
    },
    [inspect]
  )

  /* ── Boucle de décodage ──────────────────────────────────────────────── */

  useEffect(() => {
    if (cameraError || outcome || !manifest) return
    const timer = window.setInterval(() => {
      void (async () => {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState < 2 || busy.current) return
        const width = video.videoWidth
        const height = video.videoHeight
        if (!width || !height) return
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) return
        context.drawImage(video, 0, 0, width, height)
        const code = await decodeFrame(canvas)
        if (code) await handleCode(code)
      })()
    }, DECODE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [cameraError, handleCode, manifest, outcome])

  /* ── Commandes ───────────────────────────────────────────────────────── */

  async function toggleTorch() {
    const next = !settings.torch
    try {
      await cameraRef.current?.setTorch(next)
      await updateSettings({ torch: next })
    } catch {
      toast.error("Ce terminal ne pilote pas la lampe.")
    }
  }

  async function nextCoach() {
    const current = Number.parseInt(settings.coachLabel, 10)
    const next = Number.isFinite(current) ? ((current % 6) + 1).toString() : "1"
    await updateSettings({ coachLabel: next })
  }

  const stale = manifest ? isStale(manifest) : false

  if (!manifest) {
    return (
      <main className="safe-top flex flex-1 flex-col gap-4 px-5 pt-5">
        <InlineMessage tone="warning" title="Aucun manifeste embarqué.">
          Choisissez une desserte et téléchargez son manifeste avant de
          contrôler.
        </InlineMessage>
        <Button size="lg" block asChild>
          <Link href="/tournee">Retour au tableau de bord</Link>
        </Button>
      </main>
    )
  }

  return (
    <main
      data-theme="dark"
      className="flex flex-1 flex-col bg-[oklch(0.18_0.02_257)] text-ink"
    >
      <header className="safe-top flex items-center justify-between px-5 pt-4 pb-3">
        <h1 className="text-h4">Voiture {settings.coachLabel}</h1>
        <NetworkBadge />
      </header>

      {stale && (
        <p className="mx-5 mb-3 rounded-sm bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-ink">
          Manifeste périmé — statuts fins inconnus
        </p>
      )}
      {!manifest.complete && (
        <p className="mx-5 mb-3 rounded-sm bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-ink">
          Manifeste incomplet — {manifest.downloadedCount} titres sur{" "}
          {manifest.ticketCount}
        </p>
      )}

      <section className="relative mx-5 min-h-[300px] flex-1 overflow-hidden rounded-lg bg-black">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <CameraOff aria-hidden className="size-7 text-ink-muted" />
            <h2 className="text-h4">Caméra indisponible</h2>
            <p className="max-w-xs text-[15px] text-ink-muted">
              {cameraError.message} {cameraError.remedy}
            </p>
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              {cameraError.retryable && (
                <Button
                  size="lg"
                  block
                  loading={opening}
                  loadingLabel="Ouverture…"
                  onClick={() => void startCamera()}
                >
                  Autoriser la caméra
                </Button>
              )}
              <Button
                variant={cameraError.retryable ? "secondary" : "primary"}
                size="lg"
                block
                onClick={() => setShowManual(true)}
              >
                Saisir un code à la main
              </Button>
              <Button variant="secondary" size="lg" block asChild>
                <Link href="/recherche">Chercher dans le manifeste</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full object-cover"
            />
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-8 top-1/2 h-56 -translate-y-1/2 rounded-md border-2 border-accent-base/70">
                <div className="cm-sweep h-0.5 bg-accent-base/80" />
              </div>
            </div>
            <p className="absolute inset-x-0 bottom-4 text-center text-[14px] text-white/80">
              Présentez le code Aztec dans le cadre
            </p>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </section>

      <div className="mx-5 mt-4 flex gap-3">
        <Stat value={controls} label="contrôlés" />
        <Stat value={queue.total} label="à envoyer" />
      </div>

      <div className="safe-bottom mx-5 mt-4 mb-4 flex gap-2">
        {/* Libellés courts plutôt que tronqués : à 375 px, « Voiture 1 » et
            « Recherche » ne tiennent pas à trois. L'icône porte le sens, le
            texte le confirme, et rien n'est coupé. La hauteur reste au
            plancher de 44 px — on vise en marchant. */}
        <Button
          variant={settings.torch ? "primary" : "secondary"}
          size="md"
          className="min-w-0 flex-1 px-2 text-[14px]"
          disabled={!torchAvailable}
          aria-pressed={settings.torch}
          onClick={() => void toggleTorch()}
        >
          <Flashlight aria-hidden />
          Lampe
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="min-w-0 flex-1 px-2 text-[14px]"
          aria-label={`Voiture ${settings.coachLabel} — passer à la suivante`}
          onClick={() => void nextCoach()}
        >
          <Train aria-hidden />
          <span className="tabular">{settings.coachLabel}</span>
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="min-w-0 flex-1 px-2 text-[14px]"
          asChild
        >
          <Link href="/recherche" aria-label="Rechercher dans le manifeste">
            <Search aria-hidden />
            Chercher
          </Link>
        </Button>
      </div>

      {showManual && (
        <ManualCodeDialog
          value={manualCode}
          onChange={setManualCode}
          onCancel={() => setShowManual(false)}
          onSubmit={() => {
            setShowManual(false)
            void handleCode(manualCode.trim(), true)
            setManualCode("")
          }}
        />
      )}

      {outcome && (
        <VerdictSheet
          outcome={outcome}
          manifest={manifest}
          onValidate={async () => {
            await record(outcome)
            setOutcome(null)
          }}
          onClose={() => setOutcome(null)}
        />
      )}
    </main>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-md bg-white/10 p-3 text-center">
      <p className="text-h3 tabular">{value}</p>
      <p className="text-[13px] text-white/70">{label}</p>
    </div>
  )
}

/** Saisie d'un code au clavier — dernier recours quand la caméra lâche. */
function ManualCodeDialog({
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-code-title"
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60 p-5"
    >
      <div className="rounded-lg bg-surface p-5 text-ink">
        <h2 id="manual-code-title" className="text-h4">
          Saisir le code du titre
        </h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Recopiez la chaîne imprimée sous le code, en commençant par SETRAG1:.
        </p>
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-3 w-full rounded-md border border-line-strong bg-surface p-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
            Annuler
          </Button>
          <Button size="lg" className="flex-1" disabled={!value.trim()} onClick={onSubmit}>
            Vérifier
          </Button>
        </div>
      </div>
    </div>
  )
}
