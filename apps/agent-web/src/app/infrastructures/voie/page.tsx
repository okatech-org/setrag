import type { Metadata } from "next"
import { Suspense } from "react"

import { ListeSections } from "@/components/modules/infrastructure/voie/liste-sections"

export const metadata: Metadata = { title: "Infrastructures · Voie et sections" }

export default function VoiePage() {
  return (
    <Suspense fallback={null}>
      <ListeSections />
    </Suspense>
  )
}
