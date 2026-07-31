"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import type { FunctionReturnType } from "convex/server"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { humanError } from "@/lib/errors"
import { hhmm } from "@/lib/format"
import { asAppRole, canArbitrate } from "@/lib/access"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useControlSession } from "./session-guard"
import { useTerminal } from "./terminal-provider"

/**
 * Conflits — CM-11.
 *
 * Un même titre validé sur deux terminaux revient ici. Le système ne peut pas
 * distinguer une fraude d'un second contrôle légitime : il SIGNALE, il ne
 * tranche pas. La lecture de l'écart — durée, voitures — est une aide, jamais
 * un verdict, et aucun voyageur n'est bloqué automatiquement.
 *
 * Qui tranche : le contrôleur signale au chef de gare ; clore le conflit
 * relève de la supervision, car un contrôle enregistré ne se réécrit pas.
 */

type Conflict = FunctionReturnType<
  typeof api.functions.control.listConflicts
>[number]

const SUSPECT_WINDOW_MS = 10 * 60 * 1000

export function ConflictScreen() {
  const { online, authenticated } = useTerminal()
  const { profile } = useControlSession()
  // Hors réseau le profil n'est pas rechargé : l'écran de conflits exige de
  // toute façon le réseau, la question de l'arbitrage ne se pose pas encore.
  const role = asAppRole(profile?.user.role)
  const arbitre = canArbitrate(role)

  // Les conflits naissent de la confrontation des terminaux : ils exigent le
  // réseau ET une session reconnue.
  const serverReady = online && authenticated
  const conflicts = useQuery(
    api.functions.control.listConflicts,
    serverReady ? {} : "skip"
  )
  const resolveConflict = useMutation(api.functions.control.resolveConflict)
  const flagConflict = useMutation(api.functions.control.flagConflict)
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!serverReady) {
    return (
      <main className="safe-top flex flex-1 flex-col gap-4 px-5 pt-5">
        <header className="flex items-start justify-between gap-3">
          <h1 className="text-h3">Conflits</h1>
          <NetworkBadge />
        </header>
        <InlineMessage
          tone="warning"
          title={
            online
              ? "Liste indisponible tant que la session n'est pas reconnue."
              : "Liste indisponible hors réseau."
          }
        >
          Les conflits naissent de la confrontation des terminaux : ils
          n&apos;apparaissent qu&apos;après synchronisation. Une liste vide ici
          serait trompeuse.
        </InlineMessage>
        <Button variant="secondary" size="lg" block asChild>
          <Link href="/historique">Retour à l&apos;historique</Link>
        </Button>
      </main>
    )
  }

  const detail = conflicts?.find((c) => c.scan._id === selected)

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h3">Conflits à arbitrer</h1>
          <p className="text-[13px] text-ink-muted">
            {conflicts
              ? `${conflicts.length} titre(s) en conflit`
              : "Chargement…"}
          </p>
        </div>
        <NetworkBadge />
      </header>

      {detail ? (
        <ConflictDetail
          conflict={detail}
          arbitre={arbitre}
          pending={pending}
          onBack={() => setSelected(null)}
          onAccept={async () => {
            setPending(true)
            try {
              await resolveConflict({
                scanId: detail.scan._id,
                accept: true,
                note: "Double contrôle reconnu légitime",
              })
              toast.success("Conflit clos : double contrôle accepté.")
              setSelected(null)
            } catch (error) {
              toast.error(humanError(error))
            } finally {
              setPending(false)
            }
          }}
          onFlag={async () => {
            setPending(true)
            try {
              const r = await flagConflict({
                scanId: detail.scan._id,
                note: "Écart suspect constaté à bord",
              })
              toast.success(
                `Signalé à ${r.notified} chef(s) de gare. Le contrôle reste en conflit.`
              )
              setSelected(null)
            } catch (error) {
              toast.error(humanError(error))
            } finally {
              setPending(false)
            }
          }}
        />
      ) : (
        <>
          {conflicts && conflicts.length > 0 && (
            <InlineMessage
              tone="warning"
              title={`${conflicts.length} titre(s) en conflit — arbitrage humain requis.`}
            >
              Un même titre a été contrôlé sur deux terminaux. Le système ne
              peut pas distinguer une fraude d&apos;un second contrôle légitime :
              il signale, il ne tranche pas.
            </InlineMessage>
          )}

          <ul className="flex flex-col gap-2">
            {conflicts?.map((conflict) => {
              const others = conflict.allScans.filter(
                (s) => s._id !== conflict.scan._id
              )
              const suspect = isSuspect(conflict)
              return (
                <li key={conflict.scan._id}>
                  <button
                    type="button"
                    onClick={() => setSelected(conflict.scan._id)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-md border border-line bg-surface p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="flex-1">
                      <span className="block text-[15px] font-semibold tabular">
                        {conflict.ticket?.number ?? "titre inconnu"}
                        {conflict.ticket &&
                          ` · ${conflict.ticket.passenger.lastName} ${conflict.ticket.passenger.firstName}`}
                      </span>
                      <span className="block text-[13px] text-ink-muted tabular">
                        {agentLabel(conflict.agent)} à{" "}
                        {hhmm(conflict.scan.scannedAt)}
                        {others[0] &&
                          ` · autre terminal à ${hhmm(others[0].scannedAt)}`}
                      </span>
                    </span>
                    <StatusTag tone={suspect ? "danger" : "warning"}>
                      {suspect ? "suspect" : "à arbitrer"}
                    </StatusTag>
                  </button>
                </li>
              )
            })}
          </ul>

          {conflicts?.length === 0 && (
            <section className="rounded-lg border border-dashed border-line-strong p-5">
              <h2 className="text-h4">Aucun conflit</h2>
              <p className="mt-1 text-[15px] text-ink-muted">
                Les contrôles remontés ont été acceptés sans doublon.
              </p>
            </section>
          )}

          <Button variant="ghost" size="md" className="mt-auto" asChild>
            <Link href="/historique">Retour à l&apos;historique</Link>
          </Button>
        </>
      )}
    </main>
  )
}

function ConflictDetail({
  conflict,
  arbitre,
  pending,
  onBack,
  onAccept,
  onFlag,
}: {
  conflict: Conflict
  arbitre: boolean
  pending: boolean
  onBack: () => void
  onAccept: () => Promise<void>
  onFlag: () => Promise<void>
}) {
  const scans = [...conflict.allScans].sort(
    (a, b) => a.scannedAt - b.scannedAt
  )
  const suspect = isSuspect(conflict)
  const ecart =
    scans.length >= 2
      ? Math.abs(scans[scans.length - 1]!.scannedAt - scans[0]!.scannedAt)
      : 0

  return (
    <>
      <section>
        <h2 className="text-h3 tabular">
          {conflict.ticket?.number ?? "Titre inconnu"}
          {conflict.ticket &&
            ` · ${conflict.ticket.passenger.lastName} ${conflict.ticket.passenger.firstName}`}
        </h2>
        <p className="text-[13px] text-ink-muted">
          {conflict.trip?.trainNumber} · {conflict.ticket?.serviceClass}
          {conflict.ticket?.seatLabel && ` · ${conflict.ticket.seatLabel}`}
        </p>
      </section>

      {suspect && (
        <InlineMessage
          tone="danger"
          title={`Écart suspect — ${Math.round(ecart / 60_000)} min entre les deux contrôles.`}
        >
          Deux personnes ont vraisemblablement présenté le même titre.
        </InlineMessage>
      )}

      <section className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-[15px]">
          <caption className="sr-only">
            Contrôles enregistrés pour ce titre
          </caption>
          <thead className="bg-surface-sunk text-[13px] text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Heure
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Arrêt
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Résultat
              </th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={scan._id} className="border-t border-line">
                <td className="px-4 py-3 tabular">{hhmm(scan.scannedAt)}</td>
                <td className="px-4 py-3 tabular">
                  {scan.stopIndex ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">{scan.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="rounded-md border border-dashed border-line-strong bg-surface-sunk p-4 text-[15px] text-ink-muted">
        {suspect
          ? `${Math.round(ecart / 60_000)} min d'écart : un second contrôle légitime est peu vraisemblable sur un intervalle aussi court.`
          : `${Math.round(ecart / 60_000)} min d'écart : un second contrôle en tournée croisée est plausible.`}{" "}
        Cette lecture est une aide, pas un verdict.
      </p>

      <div className="mt-auto flex flex-col gap-3">
        {arbitre ? (
          <Button size="lg" block loading={pending} onClick={() => void onAccept()}>
            Accepter — double contrôle légitime
          </Button>
        ) : (
          <InlineMessage tone="info" title="Clore un conflit relève du chef de gare.">
            Un contrôle enregistré ne se réécrit pas depuis le terrain. Vous
            pouvez signaler l&apos;écart, avec votre observation.
          </InlineMessage>
        )}
        <Button
          variant="secondary"
          size="lg"
          block
          loading={pending}
          onClick={() => void onFlag()}
        >
          Signaler pour enquête
        </Button>
        <Button variant="secondary" size="lg" block asChild>
          <Link
            href={`/pv?titre=${conflict.ticket?.number ?? ""}&motif=inconnu`}
          >
            Établir un PV a posteriori
          </Link>
        </Button>
        <Button variant="ghost" size="md" block onClick={onBack}>
          Retour à la liste
        </Button>
      </div>
    </>
  )
}

/**
 * Écart suspect : deux contrôles trop rapprochés pour une tournée croisée.
 *
 * Le seuil est volontairement grossier — il n'a pas à trancher, seulement à
 * attirer l'œil de l'agent sur les cas qui méritent une lecture.
 */
function isSuspect(conflict: Conflict): boolean {
  const times = conflict.allScans.map((s) => s.scannedAt).sort((a, b) => a - b)
  if (times.length < 2) return false
  return times[times.length - 1]! - times[0]! < SUSPECT_WINDOW_MS
}

function agentLabel(agent: Conflict["agent"]): string {
  if (!agent) return "agent inconnu"
  const withMatricule = agent as { matricule?: string; lastName?: string }
  return withMatricule.matricule ?? withMatricule.lastName ?? "agent"
}
