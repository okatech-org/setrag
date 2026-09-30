import type { Metadata } from "next"
import { Suspense } from "react"

import { DonneesEmbarquees } from "@/fonctionnalites/donnees/donnees-embarquees"

export const metadata: Metadata = { title: "Données embarquées" }

export default function ManifestePage() {
  return (
    <Suspense fallback={null}>
      <DonneesEmbarquees />
    </Suspense>
  )
}
