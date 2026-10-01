import type { Metadata } from "next"
import { Suspense } from "react"

import { ManifesteImprimable } from "@/components/gestion/referentiels/manifeste-imprimable"

export const metadata: Metadata = { title: "Manifeste voyageurs" }

export default function ManifestePage() {
  return (
    <Suspense fallback={null}>
      <ManifesteImprimable />
    </Suspense>
  )
}
