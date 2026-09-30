import type { Metadata } from "next"
import { Suspense } from "react"

import { Recherche } from "@/fonctionnalites/recherche/recherche"

export const metadata: Metadata = { title: "Recherche manuelle" }

export default function RecherchePage() {
  return (
    <Suspense fallback={null}>
      <Recherche />
    </Suspense>
  )
}
