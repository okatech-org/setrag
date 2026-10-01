import type { Metadata } from "next"
import { Suspense } from "react"

import { RapportBailleursEcran } from "@/components/modules/infrastructure/prn/rapport"

export const metadata: Metadata = { title: "Rapport aux bailleurs" }

export default function RapportPage() {
  return (
    <Suspense fallback={null}>
      <RapportBailleursEcran />
    </Suspense>
  )
}
