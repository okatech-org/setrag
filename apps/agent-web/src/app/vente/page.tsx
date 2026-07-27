import type { Metadata } from "next"

import { SellerDashboardPageClient } from "@/components/seller-dashboard"

export const metadata: Metadata = {
  title: "Accueil vendeur",
}

export default function VentePage() {
  return <SellerDashboardPageClient />
}
