import type { Metadata } from "next"
import { Suspense } from "react"

import { EcranStock } from "@/components/modules/gmao/stock/stock"

export const metadata: Metadata = { title: "Matériel roulant · Stock de pièces" }

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <EcranStock />
    </Suspense>
  )
}
