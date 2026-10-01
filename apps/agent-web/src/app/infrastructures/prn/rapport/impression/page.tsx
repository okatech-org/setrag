import type { Metadata } from "next"
import { Suspense } from "react"

import { RapportBailleursImprimable } from "@/components/modules/infrastructure/prn/rapport"

export const metadata: Metadata = { title: "Rapport aux bailleurs · impression" }

export default function RapportImpressionPage() {
  return (
    <Suspense fallback={null}>
      <RapportBailleursImprimable />
    </Suspense>
  )
}
