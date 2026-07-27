import type { Metadata } from "next"

import { PaymentPageClient } from "@/components/payment-screen"

export const metadata: Metadata = {
  title: "Encaissement de la vente",
}

export default function EncaissementPage() {
  return <PaymentPageClient />
}
