import type { Metadata } from "next"
import { Suspense } from "react"

import { Incident } from "@/fonctionnalites/incident/incident"

export const metadata: Metadata = { title: "Incident" }

export default function IncidentPage() {
  return (
    <Suspense fallback={null}>
      <Incident />
    </Suspense>
  )
}
