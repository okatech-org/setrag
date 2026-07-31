import type { Metadata } from "next"
import { Suspense } from "react"

import { PenaltyScreen } from "@/components/penalty-screen"

export const metadata: Metadata = { title: "Procès-verbal" }

export default function PvPage() {
  return (
    <Suspense fallback={null}>
      <PenaltyScreen />
    </Suspense>
  )
}
