import type { Metadata } from "next"

import { BaggageSalePageClient } from "@/components/ancillary-sale-screens"

export const metadata: Metadata = { title: "Vente bagage" }

export default function BaggagePage() {
  return <BaggageSalePageClient />
}
