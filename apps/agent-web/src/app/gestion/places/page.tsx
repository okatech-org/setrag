import type { Metadata } from "next"
import { Suspense } from "react"

import { PlacesQuotas } from "@/components/gestion/referentiels/places"

export const metadata: Metadata = { title: "Gestion · Places et quotas" }

export default function PlacesPage() {
  return (
    <Suspense fallback={null}>
      <PlacesQuotas />
    </Suspense>
  )
}
