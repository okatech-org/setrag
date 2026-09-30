import type { Metadata } from "next"
import { Suspense } from "react"

import { ProcesVerbal } from "@/fonctionnalites/pv/proces-verbal"

export const metadata: Metadata = { title: "Procès-verbal" }

export default function PvPage() {
  return (
    <Suspense fallback={null}>
      <ProcesVerbal />
    </Suspense>
  )
}
