"use client"

import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { formatPrice } from "@workspace/ui/lib/format"
import {
  StationTimeline,
  type StationTimelineStop,
} from "@workspace/ui/mobile/station-timeline"

/**
 * Attente de validation, en mobile.
 *
 * Les trois étapes reprennent celles de la maquette : ce qui inquiète pendant
 * l'attente, c'est de ne pas savoir où en est la demande. La timeline le dit
 * sans que le voyageur ait à rafraîchir — le statut arrive de lui-même.
 */
export function PaymentWaitingMobile({
  amountXaf,
  methodLabel,
  payerPhone,
  countdown,
  extraAction,
}: {
  amountXaf: number
  methodLabel: string
  payerPhone: string
  countdown: string | null
  /** Raccourci du mode de test, qui n'attend pas la réponse de l'opérateur. */
  extraAction?: React.ReactNode
}) {
  const steps: StationTimelineStop[] = [
    {
      id: "sent",
      name: "Demande envoyée à l’opérateur",
      state: "passed",
      note: { label: "fait", tone: "success" },
    },
    {
      id: "pin",
      name: "Attente de votre code secret",
      state: "current",
      note: { label: "en cours", tone: "warning" },
    },
    {
      id: "ticket",
      name: "Émission du billet",
      state: "upcoming",
      note: { label: "à venir", tone: "neutral" },
    },
  ]

  return (
    <div className="grid gap-s-5 *:min-w-0 md:hidden">
      <section className="grid gap-s-2 rounded-lg border border-line bg-surface p-s-4">
        <div className="flex items-center gap-s-3">
          <span
            aria-hidden
            className="size-3 shrink-0 animate-pulse rounded-pill bg-accent-base"
            data-motion="progress"
          />
          <span className="text-h4 flex-1">Validation en cours</span>
        </div>
        <span className="tabular text-body-lg font-semibold">
          {formatPrice(amountXaf)} · {methodLabel}
        </span>
        <p className="text-small text-ink-muted">
          Composez votre code secret sur la demande reçue au {payerPhone}. Aucun
          code ne se saisit dans l’application.
        </p>
      </section>

      <StationTimeline
        label="Avancement du paiement"
        stops={steps}
        className="px-s-1"
      />

      {countdown && (
        <div className="justify-self-start">
          <Tag tone="warning">La demande expire dans {countdown}</Tag>
        </div>
      )}

      <InlineMessage tone="info" title="Ne fermez pas l’application.">
        Le statut arrive tout seul, sans rafraîchir la page.
      </InlineMessage>

      {extraAction}

      <Button asChild variant="ghost" block>
        <Link href="/paiement">Annuler et changer de moyen de paiement</Link>
      </Button>
    </div>
  )
}
