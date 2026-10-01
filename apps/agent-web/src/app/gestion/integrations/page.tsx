import type { Metadata } from "next"
import { Suspense } from "react"

import { Integrations } from "@/components/gestion/pilotage/integrations"

export const metadata: Metadata = { title: "Gestion · Intégrations" }

export default function IntegrationsPage() {
  return (
    <Suspense>
      <Integrations />
    </Suspense>
  )
}
