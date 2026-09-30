import type { Metadata } from "next"
import { Suspense } from "react"

import { VenteABord } from "@/fonctionnalites/vente/vente"

export const metadata: Metadata = { title: "Vente à bord" }

export default function VentePage() {
  return (
    <Suspense fallback={null}>
      <VenteABord />
    </Suspense>
  )
}
