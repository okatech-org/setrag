import type { Metadata } from "next"
import { Suspense } from "react"

import { PlanVoiture } from "@/fonctionnalites/voiture/voiture"

export const metadata: Metadata = { title: "Voiture" }

export default function VoiturePage() {
  return (
    <Suspense fallback={null}>
      <PlanVoiture />
    </Suspense>
  )
}
