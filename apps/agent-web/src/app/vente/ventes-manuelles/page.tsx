import type { Metadata } from "next"

import { ManualSalesPageClient } from "@/components/seller-operations"

export const metadata: Metadata = { title: "Ventes manuelles" }

export default function ManualSalesPage() {
  return <ManualSalesPageClient />
}
