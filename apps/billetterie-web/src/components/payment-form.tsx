"use client"

import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { PaymentFormDesktop } from "@/components/payment/payment-form-desktop"
import { PaymentFormMobile } from "@/components/payment/payment-form-mobile"
import { usePayment } from "@/features/paiement/use-payment"

/**
 * Paiement du dossier.
 *
 * L'état, le compte à rebours et la mutation de confirmation sont tenus une
 * seule fois ici ; les deux vues n'en sont que le rendu.
 */
export function PaymentForm() {
  const payment = usePayment()

  if (!payment.ready) {
    return (
      <InlineMessage
        tone="warning"
        title="Votre réservation n’est pas encore créée."
      >
        Revenez à la recherche pour sélectionner un train et renseigner les
        voyageurs.
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href="/">Reprendre la recherche</Link>
        </Button>
      </InlineMessage>
    )
  }

  return (
    <>
      <PaymentFormMobile payment={payment} />
      <PaymentFormDesktop payment={payment} />
    </>
  )
}
