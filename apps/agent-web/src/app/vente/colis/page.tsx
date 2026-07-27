import type { Metadata } from "next"

import { ParcelSalePageClient } from "@/components/ancillary-sale-screens"

export const metadata: Metadata = { title: "Colis express" }

export default function ParcelPage() {
  return <ParcelSalePageClient />
}
