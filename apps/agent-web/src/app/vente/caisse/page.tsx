import type { Metadata } from "next"

import { CashPageClient } from "@/components/seller-operations"

export const metadata: Metadata = { title: "Ma caisse" }

export default function CashPage() {
  return <CashPageClient />
}
