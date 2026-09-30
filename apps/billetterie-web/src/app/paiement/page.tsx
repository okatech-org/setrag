import type { Metadata } from "next"
import { Suspense } from "react"

import { SqueletteTunnel } from "@/fonctionnalites/tunnel/etapes"
import { Paiement } from "@/fonctionnalites/tunnel/paiement/paiement"

export const metadata: Metadata = {
  title: "Paiement",
  robots: { index: false },
}

export default function PagePaiement() {
  return (
    <Suspense fallback={<SqueletteTunnel />}>
      <Paiement />
    </Suspense>
  )
}
