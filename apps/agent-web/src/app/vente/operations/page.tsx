import type { Metadata } from "next"

import { OperationsPageClient } from "@/components/seller-operations"

export const metadata: Metadata = { title: "Opérations" }

export default function OperationsPage() {
  return <OperationsPageClient />
}
