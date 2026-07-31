"use client"

import Link from "next/link"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { useConvex } from "convex/react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { humanError } from "@/lib/errors"
import { freshness } from "@/lib/offline/manifest"
import { downloadManifest, type DownloadProgress } from "@/lib/offline/manifest"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useTerminal } from "./terminal-provider"

/**
 * Données embarquées — CM-03.
 *
 * Dernière étape avec réseau. L'écran ne cache pas ce qu'il fait : il annonce
 * le volume, montre l'avancement par lot, et laisse interrompre — les lots
 * déjà écrits restent acquis, et la reprise repart du dernier curseur.
 */
export function ManifestScreen() {
  const convex = useConvex()
  const { manifest, online, authenticated, refresh, settings } = useTerminal()
  // Le manifeste vient du serveur : réseau ET session reconnue.
  const serverReady = online && authenticated
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const tripId = settings.activeTripId

  const start = useCallback(async () => {
    if (!tripId) {
      toast.error("Choisissez d'abord une desserte sur le tableau de bord.")
      return
    }
    setFailure(null)
    setRunning(true)
    const controller = new AbortController()
    abort.current = controller
    try {
      await downloadManifest(
        tripId,
        {
          fetchHeader: (args) =>
            convex.query(api.functions.control.manifest, {
              tripId: args.tripId as never,
              includeTickets: args.includeTickets,
            }),
          fetchTickets: (args) =>
            convex.query(api.functions.control.manifestTickets, {
              tripId: args.tripId as never,
              cursor: args.cursor,
              pageSize: args.pageSize,
            }),
        },
        {
          pageSize: 100,
          resume: manifest ?? undefined,
          onProgress: setProgress,
          signal: controller.signal,
        }
      )
      await refresh()
      if (!controller.signal.aborted) {
        toast.success("Données embarquées à jour.")
      }
    } catch (error) {
      // Ce qui est déjà écrit reste utilisable : on le dit, plutôt que de
      // laisser croire à une perte totale.
      setFailure(humanError(error))
      await refresh()
    } finally {
      setRunning(false)
      abort.current = null
    }
  }, [convex, manifest, refresh, tripId])

  const pct = progress
    ? Math.min(100, Math.round((progress.received / Math.max(1, progress.total)) * 100))
    : 0

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h3">Données embarquées</h1>
          <p className="text-[13px] text-ink-muted">
            {manifest
              ? `${manifest.trainNumber} · ${manifest.originName} → ${manifest.destinationName}`
              : (settings.activeTripLabel ??
                (tripId ? "Desserte choisie" : "Aucune desserte choisie"))}
          </p>
        </div>
        <NetworkBadge />
      </header>

      {!tripId && (
        <InlineMessage tone="warning" title="Aucune desserte choisie.">
          Revenez au tableau de bord pour désigner la desserte que vous
          contrôlez.
        </InlineMessage>
      )}

      {running && progress && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-h4">Téléchargement…</h2>
            <span className="text-[13px] text-ink-muted tabular">
              {progress.received} / {progress.total}
            </span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-sunk"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-pill bg-accent-base transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-3 text-[15px]">Lot {progress.batch}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Ne quittez pas la gare avant la fin du téléchargement.
          </p>
        </section>
      )}

      {failure && (
        <InlineMessage tone="danger" title="Téléchargement interrompu.">
          {failure} — {manifest?.downloadedCount ?? 0} titres sur{" "}
          {manifest?.ticketCount ?? 0} sont embarqués. La reprise repartira du
          dernier lot confirmé.
        </InlineMessage>
      )}

      {manifest?.complete && !running && !failure && (
        <InlineMessage tone="success" title="Données embarquées à jour.">
          Mises à jour {freshness(manifest)}.
        </InlineMessage>
      )}

      {!serverReady && (
        <InlineMessage
          tone="warning"
          title={
            online
              ? "Téléchargement impossible : session non reconnue."
              : "Téléchargement impossible sans réseau."
          }
        >
          {online
            ? "Le bouton se réactivera dès que le serveur aura reconnu la session."
            : "Le bouton reste inactif tant que le terminal n'a pas de signal."}
        </InlineMessage>
      )}

      <section className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-[15px]">
          <caption className="sr-only">Contenu embarqué sur le terminal</caption>
          <thead className="bg-surface-sunk text-[13px] text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Contenu embarqué
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="Titres de la desserte"
              value={
                manifest
                  ? `${manifest.downloadedCount} / ${manifest.ticketCount}`
                  : "—"
              }
            />
            <Row
              label="Clé publique de signature"
              value={manifest ? `Ed25519 · v${manifest.signing.keyVersion}` : "—"}
            />
            <Row
              label="Barème kilométrique"
              value={
                manifest?.fare
                  ? `${manifest.stops.length} gares · ${manifest.fare.label}`
                  : manifest
                    ? "absent"
                    : "—"
              }
            />
            <Row
              label="Barème des amendes"
              value={
                manifest ? `${manifest.penalties.length} motifs` : "—"
              }
            />
          </tbody>
        </table>
      </section>

      {manifest && !manifest.fare && (
        <InlineMessage tone="warning" title="Aucun barème kilométrique embarqué.">
          La vente à bord sera refusée : le terminal ne peut pas annoncer un
          prix qu&apos;il ne sait pas calculer.
        </InlineMessage>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <Button
          size="lg"
          block
          disabled={!serverReady || !tripId || running}
          loading={running}
          loadingLabel="Téléchargement…"
          onClick={() => void start()}
        >
          {manifest?.complete
            ? "Mettre à jour maintenant"
            : manifest?.cursor
              ? "Reprendre où l'on s'est arrêté"
              : "Télécharger le manifeste"}
        </Button>
        {running && (
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={() => {
              abort.current?.abort()
              toast.info("Interrompu — les lots déjà écrits sont conservés.")
            }}
          >
            Interrompre — garder les lots déjà écrits
          </Button>
        )}
        {manifest && !running && (
          <Button variant="secondary" size="lg" block asChild>
            <Link href="/scan">
              {manifest.complete
                ? "Commencer le contrôle"
                : "Contrôler avec ce qui est embarqué"}
            </Link>
          </Button>
        )}
      </div>

      {manifest && (
        <p className="text-[13px] text-ink-muted">
          Les données restent sur ce terminal. Elles s&apos;effacent à la purge
          de fin de tournée, une fois tout confirmé.{" "}
          {manifest.signing.isDemoKey && (
            <StatusTag tone="warning" className="ml-1">
              signature de démonstration
            </StatusTag>
          )}
        </p>
      )}
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-4 py-3 text-left font-normal">
        {label}
      </th>
      <td className="px-4 py-3 text-right tabular">{value}</td>
    </tr>
  )
}
