"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"

import { humanError } from "@/lib/errors"
import { listTickets, normalize } from "@/lib/offline/db"
import type { EmbarkedTicket } from "@/lib/offline/types"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useControl, type ControlOutcome } from "./scan-controller"
import { useTerminal } from "./terminal-provider"
import { VerdictSheet } from "./verdict-sheet"

/**
 * Recherche manuelle — CM-06.
 *
 * Zéro requête réseau : tout se lit dans le manifeste embarqué. C'est le
 * recours quand la caméra refuse, quand le code est déchiré, ou quand le
 * voyageur n'a qu'une référence reçue par SMS.
 *
 * Un titre trouvé ici suit exactement le même chemin qu'un titre scanné : sa
 * signature est vérifiée, son verdict rendu, son contrôle enregistré. Sans
 * quoi la recherche manuelle deviendrait une porte dérobée.
 */

type Axis = "reference" | "nom" | "place"

const AXES = [
  { value: "reference", label: "Référence" },
  { value: "nom", label: "Nom" },
  { value: "place", label: "Place" },
] as const

export function SearchScreen() {
  const { manifest, settings, online, refresh } = useTerminal()
  const [axis, setAxis] = useState<Axis>("reference")
  const [query, setQuery] = useState("")
  const [tickets, setTickets] = useState<EmbarkedTicket[]>([])
  const [outcome, setOutcome] = useState<ControlOutcome | null>(null)

  const { inspect, record } = useControl({
    manifest,
    currentStopIndex: settings.currentStopIndex,
    coachLabel: settings.coachLabel,
    online,
    onRecorded: () => void refresh(),
  })

  useEffect(() => {
    if (!manifest) return
    void listTickets(manifest.tripId).then(setTickets)
  }, [manifest])

  const results = useMemo(() => {
    const needle = normalize(query)
    if (needle.length < 2) return []
    return tickets
      .filter((ticket) => {
        if (axis === "reference") return normalize(ticket.number).includes(needle)
        if (axis === "place") {
          return normalize(ticket.seatLabel ?? "").includes(needle)
        }
        return normalize(
          `${ticket.passenger.lastName} ${ticket.passenger.firstName}`
        ).includes(needle)
      })
      .slice(0, 40)
  }, [axis, query, tickets])

  async function openTicket(ticket: EmbarkedTicket) {
    if (!ticket.barcodePayload) {
      toast.error(
        "Ce titre n'a pas de code embarqué : il ne peut pas être vérifié hors ligne."
      )
      return
    }
    try {
      setOutcome(await inspect(ticket.barcodePayload, { manual: true }))
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  if (!manifest) {
    return (
      <main className="safe-top flex flex-1 flex-col gap-4 px-5 pt-5">
        <InlineMessage tone="warning" title="Aucun manifeste embarqué.">
          La recherche lit le manifeste du terminal : téléchargez-le d&apos;abord.
        </InlineMessage>
        <Button size="lg" block asChild>
          <Link href="/manifeste">Télécharger le manifeste</Link>
        </Button>
      </main>
    )
  }

  const noResults = query.trim().length >= 2 && results.length === 0

  return (
    <main className="safe-top flex flex-1 flex-col gap-4 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h3">Recherche manuelle</h1>
          <p className="text-[13px] text-ink-muted">
            {manifest.trainNumber} · <span className="tabular">{tickets.length}</span>{" "}
            titres embarqués
          </p>
        </div>
        <NetworkBadge />
      </header>

      <SegmentedControl
        label="Chercher par"
        size="touch"
        options={[...AXES]}
        value={axis}
        onValueChange={(value) => setAxis(value as Axis)}
      />

      <Field
        label={
          axis === "reference"
            ? "Référence du titre"
            : axis === "nom"
              ? "Nom du voyageur"
              : "Numéro de place"
        }
        hint="Recherche locale : aucune donnée n'est envoyée."
      >
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            axis === "reference" ? "B-48…" : axis === "nom" ? "OBAME" : "12A"
          }
          className="tabular"
        />
      </Field>

      {results.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {results.map((ticket) => (
              <li key={ticket.number}>
                <button
                  type="button"
                  onClick={() => void openTicket(ticket)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-md border border-line bg-surface p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold tabular">
                      {ticket.number} · {ticket.passenger.lastName}{" "}
                      {ticket.passenger.firstName}
                    </span>
                    <span className="block text-[13px] text-ink-muted">
                      {manifest.stops[ticket.fromStopIndex]?.name ?? "?"} →{" "}
                      {manifest.stops[ticket.toStopIndex]?.name ?? "?"}
                      {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}
                    </span>
                  </span>
                  <StatusTag tone={statusTone(ticket.status)}>
                    {statusLabel(ticket.status)}
                  </StatusTag>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular">{results.length}</span> résultat(s) ·
            recherche locale, aucune donnée envoyée.
          </p>
        </>
      )}

      {noResults && (
        <section className="rounded-lg border border-dashed border-line-strong p-5">
          <h2 className="text-h4">Aucun titre trouvé</h2>
          <p className="mt-1 text-[15px] text-ink-muted">
            Cette référence n&apos;existe pas dans le manifeste de{" "}
            {manifest.trainNumber}.
          </p>
          {!manifest.complete && (
            <InlineMessage
              tone="warning"
              title="Manifeste incomplet : l'absence ne vaut pas preuve."
              className="mt-3"
            >
              {manifest.ticketCount - manifest.downloadedCount} titres n&apos;ont
              pas été embarqués. Vérifiez la signature du code avant de conclure.
            </InlineMessage>
          )}
          <div className="mt-4 flex flex-col gap-3">
            <Button size="lg" block asChild>
              <Link href="/vente">Vendre un titre à bord</Link>
            </Button>
            <Button variant="secondary" size="lg" block asChild>
              <Link href="/pv?motif=sans_titre">Établir un procès-verbal</Link>
            </Button>
          </div>
        </section>
      )}

      <Button variant="ghost" size="md" className="mt-auto" asChild>
        <Link href="/scan">Retour au scanner</Link>
      </Button>

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

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    valide: "valide",
    utilise: "déjà contrôlé",
    annule: "annulé",
    rembourse: "remboursé",
    en_attente: "non payé",
  }
  return labels[status] ?? status
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "valide") return "success"
  if (status === "utilise") return "warning"
  if (status === "annule" || status === "rembourse") return "danger"
  return "neutral"
}
