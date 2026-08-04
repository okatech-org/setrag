"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"

import { humanError } from "@/lib/errors"
import { hhmm, xaf } from "@/lib/format"
import {
  listPending,
  listSales,
  listScans,
  purgeLocalData,
} from "@/lib/offline/db"
import type { LocalSale, LocalScan, QueueEntry } from "@/lib/offline/types"
import { VERDICT_LABELS, verdictTone } from "@/lib/offline/verify"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useTerminal } from "./terminal-provider"

/**
 * Historique et file d'envoi — CM-10.
 *
 * L'écran de fin de tournée, mais consultable à tout moment. Il ne dramatise
 * pas l'attente : hors ligne, une file qui grossit est le fonctionnement
 * normal. Ce qu'il doit rendre visible, c'est ce qui a ÉCHOUÉ, et le fait que
 * rien n'est jamais supprimé après un échec.
 */

type View = "file" | "controles"

export function HistoryScreen() {
  const {
    manifest,
    queue,
    online,
    authenticated,
    syncing,
    progress,
    syncNow,
    refresh,
  } = useTerminal()
  // L'envoi exige le réseau ET une session : sans elle, chaque écriture
  // reviendrait en échec pour un motif qui ne la concerne pas.
  const serverReady = online && authenticated
  const [view, setView] = useState<View>("file")
  const [scans, setScans] = useState<LocalScan[]>([])
  const [sales, setSales] = useState<LocalSale[]>([])
  const [failures, setFailures] = useState<QueueEntry[]>([])
  const [purging, setPurging] = useState(false)

  const tripId = manifest?.tripId

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [nextScans, nextSales, pending] = await Promise.all([
        listScans(tripId),
        listSales(tripId),
        listPending(),
      ])
      if (cancelled) return
      setScans(nextScans)
      setSales(nextSales)
      setFailures(pending.filter((e) => e.state === "failed"))
    })()
    return () => {
      cancelled = true
    }
  }, [tripId, queue.total, queue.failed, syncing])

  const sent = {
    scans: queue.byKind.scan.sent,
    sales: queue.byKind.sale.sent,
    penalties: queue.byKind.penalty.sent,
    incidents: queue.byKind.incident.sent,
  }
  const totalSent = sent.scans + sent.sales + sent.penalties + sent.incidents
  const canPurge = queue.total === 0 && totalSent > 0

  async function purge() {
    if (
      !window.confirm(
        "Effacer les données voyageurs de ce terminal ? Les contrôles restent journalisés côté système."
      )
    ) {
      return
    }
    setPurging(true)
    try {
      await purgeLocalData()
      await refresh()
      toast.success("Données locales purgées.")
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setPurging(false)
    }
  }

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h3">
            {manifest ? `Tournée ${manifest.trainNumber}` : "Historique"}
          </h1>
          <p className="text-[13px] text-ink-muted">
            {manifest
              ? `${manifest.originName} → ${manifest.destinationName}`
              : "Aucune desserte embarquée"}
          </p>
        </div>
        <NetworkBadge />
      </header>

      <SegmentedControl
        label="Vue"
        size="touch"
        options={[
          { value: "file", label: "File d'envoi" },
          { value: "controles", label: "Contrôles" },
        ]}
        value={view}
        onValueChange={(value) => setView(value as View)}
      />

      {view === "file" ? (
        <>
          <section className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-[15px]">
              <caption className="sr-only">
                File d&apos;envoi du terminal
              </caption>
              <thead className="bg-surface-sunk text-[13px] text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Élément
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Nb
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    État
                  </th>
                </tr>
              </thead>
              <tbody>
                <QueueRow label="Contrôles" counts={queue.byKind.scan} />
                <QueueRow label="Ventes à bord" counts={queue.byKind.sale} />
                <QueueRow
                  label="Procès-verbaux"
                  counts={queue.byKind.penalty}
                />
                <QueueRow
                  label="Incidents"
                  counts={queue.byKind.incident}
                  priority={queue.criticalPending > 0}
                />
              </tbody>
            </table>
          </section>

          {syncing && progress && (
            <section className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-h4">
                  Lot {progress.batch} sur {progress.batchCount}
                </h2>
                <span className="tabular text-[13px] text-ink-muted">
                  {progress.sent} / {progress.total}
                </span>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-sunk"
                role="progressbar"
                aria-valuenow={progress.sent}
                aria-valuemin={0}
                aria-valuemax={progress.total}
              >
                <div
                  className="h-full rounded-pill bg-accent-base transition-[width] duration-300"
                  style={{
                    width: `${Math.round((progress.sent / Math.max(1, progress.total)) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                {progress.label} · les lots sont idempotents : une reprise ne
                crée pas de doublon.
              </p>
            </section>
          )}

          {!syncing && queue.total > 0 && (
            <InlineMessage
              tone={serverReady ? "info" : "warning"}
              title={
                serverReady
                  ? `Envoi automatique — ${queue.total} éléments en attente de confirmation.`
                  : online
                    ? "Session non reconnue — l'envoi reprendra dès qu'elle sera rétablie."
                    : "Aucun réseau — l'envoi partira automatiquement dès le retour du signal."
              }
            >
              {serverReady
                ? "Aucune action n'est requise : l'application les transmet et réessaie seule. Le bouton ci-dessous permet seulement de forcer une reprise immédiate."
                : "C'est le cas nominal en pleine voie : rien n'est perdu, tout est écrit dans la base du terminal."}
            </InlineMessage>
          )}

          {failures.length > 0 && (
            <>
              <InlineMessage
                tone="danger"
                title={`${failures.length} éléments en échec — non perdus, conservés localement.`}
              >
                Rien n&apos;est jamais supprimé après un échec.
                L&apos;identifiant client de chaque écriture garantit
                l&apos;absence de doublon à la reprise.
              </InlineMessage>
              <ul className="overflow-hidden rounded-md border border-line">
                {failures.slice(0, 8).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 last:border-b-0"
                  >
                    <span className="flex-1">
                      <span className="block text-[15px]">
                        {KIND_LABELS[entry.kind]}
                      </span>
                      <span className="block text-[13px] text-ink-muted">
                        {entry.lastError ?? "motif inconnu"} ·{" "}
                        <span className="tabular">{entry.attempts}</span>{" "}
                        tentative(s)
                      </span>
                    </span>
                    <StatusTag tone="danger">échec</StatusTag>
                  </li>
                ))}
              </ul>
            </>
          )}

          {queue.total === 0 && totalSent > 0 && (
            <InlineMessage
              tone="success"
              title={`Tournée synchronisée — ${totalSent} éléments confirmés.`}
            >
              La purge des données locales est maintenant possible.
            </InlineMessage>
          )}

          <div className="mt-auto flex flex-col gap-3">
            <Button
              size="lg"
              block
              loading={syncing}
              loadingLabel="Synchronisation en cours…"
              disabled={!serverReady || queue.total === 0}
              onClick={() => void syncNow()}
            >
              {queue.total === 0
                ? "Tout est confirmé"
                : !serverReady
                  ? "Envoi impossible sans réseau"
                  : failures.length > 0
                    ? "Réessayer maintenant"
                    : "Envoyer sans attendre"}
            </Button>
            <Button variant="secondary" size="lg" block asChild>
              <Link href="/conflits">Voir les conflits</Link>
            </Button>
            {canPurge && (
              <Button
                variant="secondary"
                size="lg"
                block
                loading={purging}
                onClick={() => void purge()}
              >
                Purger les données locales
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          {scans.length === 0 && sales.length === 0 ? (
            <p className="text-[15px] text-ink-muted">
              Aucun contrôle enregistré sur cette tournée.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-md border border-line">
              {scans.map((scan) => (
                <li
                  key={scan.clientScanId}
                  className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 last:border-b-0"
                >
                  <span className="tabular w-12 text-[13px] text-ink-muted">
                    {hhmm(scan.scannedAt)}
                  </span>
                  <span className="flex-1">
                    <span className="tabular block text-[15px]">
                      {scan.ticketNumber ?? "code illisible"}
                    </span>
                    {scan.passengerName && (
                      <span className="block text-[13px] text-ink-muted">
                        {scan.passengerName}
                      </span>
                    )}
                  </span>
                  <StatusTag tone={verdictTone(scan.verdict)}>
                    {VERDICT_LABELS[scan.verdict]}
                  </StatusTag>
                </li>
              ))}
            </ul>
          )}

          {sales.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
                Ventes à bord
              </h2>
              <ul className="overflow-hidden rounded-md border border-line">
                {sales.map((sale) => (
                  <li
                    key={sale.clientSaleId}
                    className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 last:border-b-0"
                  >
                    <span className="flex-1">
                      <span className="tabular block text-[15px]">
                        {sale.serverSaleNumber ?? sale.localRef}
                      </span>
                      <span className="block text-[13px] text-ink-muted">
                        {sale.originName} → {sale.destinationName}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="tabular block text-[15px]">
                        {xaf(sale.quotedXaf)}
                      </span>
                      {/* Les deux montants côte à côte : l'agent doit voir ce
                          qu'il a encaissé ET ce que le système a facturé. */}
                      {sale.serverXaf !== undefined &&
                        sale.serverXaf !== sale.quotedXaf && (
                          <span className="tabular block text-[13px] font-semibold text-warning-ink">
                            facturé {xaf(sale.serverXaf)}
                          </span>
                        )}
                    </span>
                  </li>
                ))}
              </ul>
              {sales.some(
                (s) => s.serverXaf !== undefined && s.serverXaf !== s.quotedXaf
              ) && (
                <InlineMessage tone="warning" title="Écart de tarification.">
                  Un montant recalculé par le système diffère de celui encaissé
                  à bord. Signalez-le à votre caisse : l&apos;écart doit être
                  justifié, pas absorbé.
                </InlineMessage>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}

const KIND_LABELS: Record<QueueEntry["kind"], string> = {
  scan: "Contrôle",
  sale: "Vente à bord",
  penalty: "Procès-verbal",
  incident: "Incident",
}

function QueueRow({
  label,
  counts,
  priority = false,
}: {
  label: string
  counts: { pending: number; failed: number; sent: number }
  priority?: boolean
}) {
  const waiting = counts.pending + counts.failed
  const total = waiting + counts.sent
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-4 py-3 text-left font-normal">
        {label}
      </th>
      <td className="tabular px-4 py-3 text-right">{total}</td>
      <td className="px-4 py-3 text-right text-[13px]">
        {total === 0 ? (
          // Une ligne vide n'a rien été « envoyé » : le dire serait un
          // faux acquittement, exactement ce qu'un agent ne doit pas lire.
          <span className="text-ink-muted">aucun</span>
        ) : counts.failed > 0 ? (
          <span className="font-semibold text-danger-ink">
            {counts.failed} en échec
          </span>
        ) : waiting > 0 ? (
          <span
            className={
              priority ? "font-semibold text-warning-ink" : "text-ink-muted"
            }
          >
            {priority ? "priorité" : "en attente"}
          </span>
        ) : (
          <span className="text-success-ink">envoyé</span>
        )}
      </td>
    </tr>
  )
}
