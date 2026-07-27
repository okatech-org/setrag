"use client"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { formatPrice } from "@workspace/ui/lib/format"
import { StickyActions } from "@workspace/ui/mobile/sticky-actions"

import {
  PAYMENT_METHODS,
  formatCountdown,
  type usePayment,
} from "@/features/paiement/use-payment"

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * Paiement, en mobile.
 *
 * Le moyen se choisit dans une liste pleine largeur plutôt que dans le
 * récapitulatif compact du bureau : c'est la décision de l'écran, et elle doit
 * rester atteignable au pouce sans défilement latéral.
 */
export function PaymentFormMobile({
  payment,
}: {
  payment: ReturnType<typeof usePayment>
}) {
  const countdown = formatCountdown(payment.remaining)

  return (
    <div className="grid gap-s-4 *:min-w-0 md:hidden">
      <section className="grid gap-s-1 rounded-lg border border-line bg-surface p-s-4">
        <span className="tabular text-h2">{formatPrice(payment.total)}</span>
        <span className="text-small text-ink-muted">
          {payment.trip.originName} → {payment.trip.destinationName} ·{" "}
          {payment.trip.trainNumber} ·{" "}
          {hourFormatter.format(payment.trip.departureAt)} ·{" "}
          {payment.booking.passengers.length} voyageur
          {payment.booking.passengers.length > 1 ? "s" : ""}
        </span>
      </section>

      <ul
        role="radiogroup"
        aria-label="Moyen de paiement"
        className="grid gap-s-2"
      >
        {PAYMENT_METHODS.map((option) => {
          const active = payment.method === option.id
          return (
            <li key={option.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  payment.setMethod(option.id)
                  payment.clearError()
                }}
                className={
                  active
                    ? "flex w-full items-center gap-s-3 rounded-md border-[1.5px] border-accent-base bg-accent-soft p-s-4 text-left"
                    : "flex w-full items-center gap-s-3 rounded-md border border-line bg-surface p-s-4 text-left hover:bg-surface-sunk"
                }
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-body font-semibold">
                    {option.label}
                  </span>
                  <span className="text-caption text-ink-muted">
                    {option.note}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={
                    active
                      ? "size-5 shrink-0 rounded-pill border-[6px] border-accent-base"
                      : "size-5 shrink-0 rounded-pill border-2 border-line-strong"
                  }
                />
              </button>
              {active && payment.needsPayerPhone && (
                <div className="mt-s-2 rounded-md border border-line bg-surface p-s-3">
                  <Field
                    label="Numéro payeur"
                    htmlFor={`m-payer-phone-${option.id}`}
                    hint="La demande de validation part vers ce numéro. Aucun code ne se saisit dans l’application."
                  >
                    <Input
                      id={`m-payer-phone-${option.id}`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+241 06 12 34 56"
                      value={payment.payerPhone}
                      onChange={(event) =>
                        payment.setPayerPhone(event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {countdown &&
        (payment.expired ? (
          <InlineMessage tone="danger" title="Vos places ont été libérées.">
            Le délai de quinze minutes est écoulé : reprenez la recherche pour
            rouvrir un dossier au tarif du moment.
          </InlineMessage>
        ) : (
          <Tag tone="warning">Places tenues encore {countdown}</Tag>
        ))}

      {payment.error && <InlineMessage tone="danger" title={payment.error} />}

      <StickyActions>
        <Checkbox
          checked={payment.accepted}
          onCheckedChange={(checked) => {
            payment.setAccepted(checked === true)
            payment.clearError()
          }}
          label="J’accepte les conditions générales de vente SETRAG (version 2026-07)."
        />
        <Button
          size="lg"
          block
          disabled={payment.expired}
          loading={payment.submitting}
          loadingLabel="Envoi de la demande…"
          onClick={() => void payment.submit()}
        >
          {payment.method === "guichet"
            ? "Réserver sans payer"
            : `Payer ${formatPrice(payment.total)}`}
        </Button>
      </StickyActions>
    </div>
  )
}
