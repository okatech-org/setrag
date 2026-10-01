import type { Metadata } from "next"
import { Suspense } from "react"

import { EcranAchats } from "@/components/modules/gmao/achats/achats"

export const metadata: Metadata = { title: "Matériel roulant · Achats" }

export default function AchatsPage() {
  return (
    <Suspense fallback={null}>
      <EcranAchats />
    </Suspense>
  )
}
