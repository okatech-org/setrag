"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { humanError } from "@/lib/errors"
import { classLabel, hhmm } from "@/lib/format"
import { freshness } from "@/lib/offline/manifest"
import type { EmbarkedManifest } from "@/lib/offline/types"
import {
  VERDICT_LABELS,
  verdictSource,
  verdictTone,
} from "@/lib/offline/verify"
import type { ControlOutcome } from "./scan-controller"
import { StatusTag } from "./network-badge"

/**
 * Verdict d'un contrôle — CM-05.
 *
 * Le verdict s'écrit en toutes lettres, en tête, avec son motif : la couleur
 * n'est qu'un renfort. Un agent qui refuse un voyageur doit pouvoir lui dire
 * POURQUOI, et le motif détermine la suite — régularisation ou procès-verbal.
 */
export function VerdictSheet({
  outcome,
  manifest,
  onValidate,
  onClose,
}: {
  outcome: ControlOutcome
  manifest: EmbarkedManifest
  /** Enregistre le contrôle puis rouvre le viseur. */
  onValidate: () => Promise<void>
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const tone = verdictTone(outcome.verdict)

  const toneClasses = {
    success: "bg-success-soft text-success-ink",
    warning: "bg-warning-soft text-warning-ink",
    danger: "bg-danger-soft text-danger-ink",
  } as const

  const ticket = outcome.ticket
  const subscription = outcome.subscription
  const ref = ticket?.number ?? subscription?.cardNumber ?? outcome.payload?.ref

  async function validate() {
    setPending(true)
    try {
      await onValidate()
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setPending(false)
    }
  }

  /** Passe à la vente ou au PV en enregistrant d'abord le contrôle. */
  async function goTo(path: string) {
    setPending(true)
    try {
      await onValidate()
      const params = new URLSearchParams()
      if (ref) params.set("titre", ref)
      params.set("motif", outcome.verdict)
      router.push(`${path}?${params.toString()}`)
    } catch (error) {
      toast.error(humanError(error))
      setPending(false)
    }
  }

  const refus = tone === "danger"
  const regularisable =
    outcome.verdict === "hors_segment" || outcome.verdict === "inconnu"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verdict-title"
      className="fixed inset-0 z-40 flex flex-col bg-canvas"
    >
      <header className={`safe-top px-5 pt-6 pb-6 ${toneClasses[tone]}`}>
        <p className="text-[13px] font-semibold tracking-wide uppercase opacity-80">
          {verdictSource(outcome)}
        </p>
        <h1 id="verdict-title" className="mt-1 text-h1">
          {VERDICT_LABELS[outcome.verdict]}
        </h1>
        {outcome.reason && (
          <p className="mt-2 text-[15px]">{outcome.reason}</p>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {(ticket || subscription) && (
          <section className="rounded-md border border-line bg-surface p-4">
            <h2 className="text-h4">
              {ticket
                ? `${ticket.passenger.lastName} ${ticket.passenger.firstName}`
                : `Abonnement ${subscription!.cardNumber}`}
            </h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {ticket
                ? `${manifest.stops[ticket.fromStopIndex]?.name ?? "?"} → ${
                    manifest.stops[ticket.toStopIndex]?.name ?? "?"
                  }`
                : `${classLabel(subscription!.serviceClass)} · abonnement ${subscription!.kind}`}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted tabular">
              {ticket
                ? [
                    classLabel(ticket.serviceClass),
                    ticket.coachLabel && `voiture ${ticket.coachLabel}`,
                    ticket.seatLabel && `place ${ticket.seatLabel}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : `Valable jusqu'au ${new Date(
                    subscription!.validUntil
                  ).toLocaleDateString("fr-FR")}`}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted tabular">
              N° {ref} · {manifest.trainNumber}
            </p>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {outcome.verdict === "valide" && (
            <>
              <StatusTag tone="success">segment couvert</StatusTag>
              <StatusTag tone="success">1er contrôle</StatusTag>
            </>
          )}
          {outcome.verdict === "hors_segment" && (
            <StatusTag tone="danger">hors segment</StatusTag>
          )}
          {outcome.verdict === "deja_controle" && (
            <StatusTag tone="warning">
              anti-repassage
              {outcome.firstScanAt
                ? ` · 1er contrôle ${hhmm(outcome.firstScanAt)}`
                : ""}
            </StatusTag>
          )}
          {outcome.verdict === "contrefait" && (
            <StatusTag tone="danger">signature non valide</StatusTag>
          )}
          {outcome.manual && <StatusTag tone="neutral">recherche manuelle</StatusTag>}
        </div>

        {outcome.fromManifest && (
          <InlineMessage tone="info" title="Information issue du manifeste embarqué.">
            Mis à jour {freshness(manifest)}. La signature du titre, elle, est
            vérifiée localement sans réseau.
          </InlineMessage>
        )}
      </div>

      <div className="safe-bottom flex flex-col gap-3 border-t border-line bg-surface px-5 py-4">
        {!refus && (
          <Button
            size="lg"
            block
            loading={pending}
            onClick={() => void validate()}
          >
            {outcome.verdict === "deja_controle"
              ? "Continuer sans second contrôle"
              : "Valider et scanner le suivant"}
          </Button>
        )}

        {regularisable && (
          <Button
            size="lg"
            block
            loading={pending}
            onClick={() => void goTo("/vente")}
          >
            Régulariser — vendre le complément
          </Button>
        )}

        {refus && !regularisable && (
          <Button
            size="lg"
            block
            loading={pending}
            onClick={() => void goTo("/pv")}
          >
            Établir un procès-verbal
          </Button>
        )}

        {(refus || regularisable) && (
          <Button
            variant={regularisable ? "secondary" : "secondary"}
            size="lg"
            block
            loading={pending}
            onClick={() => void goTo(regularisable ? "/pv" : "/vente")}
          >
            {regularisable
              ? "Établir un procès-verbal"
              : "Vendre un titre à bord"}
          </Button>
        )}

        <Button variant="ghost" size="md" block onClick={onClose}>
          Fermer sans enregistrer
        </Button>
      </div>
    </div>
  )
}
