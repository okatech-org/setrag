import type { Metadata } from "next"
import { Suspense } from "react"

import { RegistreAnomalies } from "@/components/modules/infrastructure/anomalies/registre-anomalies"

export const metadata: Metadata = { title: "Infrastructures · Anomalies terrain" }

export default function AnomaliesPage() {
  return (
    <Suspense fallback={null}>
      <RegistreAnomalies />
    </Suspense>
  )
}
