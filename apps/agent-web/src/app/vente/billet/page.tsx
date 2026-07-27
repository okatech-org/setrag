import type { Metadata } from "next"

import { TicketSalePageClient } from "@/components/ticket-sale-screen"

export const metadata: Metadata = {
  title: "Vente billet voyageur",
}

export default function VenteBilletPage() {
  return <TicketSalePageClient />
}
