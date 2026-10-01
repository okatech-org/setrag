import type { Metadata } from "next"
import { Suspense } from "react"

import { IncidentsPv } from "@/components/gestion/referentiels/incidents"

export const metadata: Metadata = { title: "Gestion · Incidents et procès-verbaux" }

export default function IncidentsPage() {
  return (
    <Suspense fallback={null}>
      <IncidentsPv />
    </Suspense>
  )
}
