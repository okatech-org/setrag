"use client"

import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { formatPrice } from "@workspace/ui/lib/format"
import { CheckoutSummary } from "@workspace/ui/components/voyage/checkout-summary"

import {
  PAYMENT_METHODS,
  formatCountdown,
  type usePayment,
} from "@/features/paiement/use-payment"

/** Paiement au format bureau : récapitulatif et moyens dans un même bloc. */
export function PaymentFormDesktop({
  payment,
}: {
  payment: ReturnType<typeof usePayment>
}) {
  const countdown = formatCountdown(payment.remaining)

  return (
    <div className="hidden gap-5 md:grid">
      <CheckoutSummary
        lines={[
          {
            label: `${payment.booking.passengers.length} billet(s) · ${payment.booking.serviceClass.toLowerCase()}`,
            amountXaf: payment.total,
          },
        ]}
        options={PAYMENT_METHODS.map((option) => ({
          id: option.id,
          label: option.label,
          note: option.note,
        }))}
        selectedOption={payment.method}
        onSelectOption={(id) => {
          payment.setMethod(id as typeof payment.method)
          payment.clearError()
        }}
        onSubmit={() => void payment.submit()}
        submitting={payment.submitting}
        submitDisabled={payment.expired}
        submitLabel={
          payment.method === "guichet"
            ? "Réserver sans payer"
            : `Payer ${formatPrice(payment.total)}`
        }
        paymentDetails={
          <div className="grid gap-4">
            {payment.needsPayerPhone && (
              <Field
                label="Téléphone du payeur"
                htmlFor="payer-phone"
                hint="Le message de validation sera envoyé à ce numéro."
              >
                <Input
                  id="payer-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={payment.payerPhone}
                  onChange={(event) =>
                    payment.setPayerPhone(event.target.value)
                  }
                />
              </Field>
            )}
            {payment.error && (
              <InlineMessage tone="danger" title={payment.error} />
            )}
            <Checkbox
              checked={payment.accepted}
              onCheckedChange={(checked) => {
                payment.setAccepted(checked === true)
                payment.clearError()
              }}
              label="J’accepte les conditions générales de vente SETRAG (version 2026-07)."
            />
          </div>
        }
        footnote="Le billet est émis dès la confirmation du paiement."
      />
      {countdown && !payment.expired && (
        <p className="text-small text-ink-muted">
          Vos places et votre tarif sont tenus encore{" "}
          <span className="tabular font-semibold">{countdown}</span>.
        </p>
      )}
      {payment.expired && (
        <InlineMessage tone="danger" title="Vos places ont été libérées.">
          Le délai de quinze minutes est écoulé : reprenez la recherche pour
          rouvrir un dossier au tarif du moment.
        </InlineMessage>
      )}
    </div>
  )
}
