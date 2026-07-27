import type { Metadata } from "next"

import { SaleConfirmationPageClient } from "@/components/sale-confirmation-screen"

export const metadata: Metadata = {
  title: "Vente confirmée",
}

export default function ConfirmationPage() {
  return <SaleConfirmationPageClient />
}
