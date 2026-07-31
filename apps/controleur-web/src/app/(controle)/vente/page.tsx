import type { Metadata } from "next"
import { Suspense } from "react"

import { OnboardSaleScreen } from "@/components/onboard-sale-screen"

export const metadata: Metadata = { title: "Vente à bord" }

export default function VentePage() {
  return (
    <Suspense fallback={null}>
      <OnboardSaleScreen />
    </Suspense>
  )
}
