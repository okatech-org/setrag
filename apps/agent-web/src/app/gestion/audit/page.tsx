import type { Metadata } from "next"
import { Suspense } from "react"

import { JournalAudit } from "@/components/gestion/referentiels/audit"

export const metadata: Metadata = { title: "Gestion · Journal d'audit" }

export default function AuditPage() {
  return (
    <Suspense fallback={null}>
      <JournalAudit />
    </Suspense>
  )
}
