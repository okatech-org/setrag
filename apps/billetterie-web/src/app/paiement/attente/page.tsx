import type { Metadata } from "next"
import { Suspense } from "react"

import { SqueletteTunnel } from "@/fonctionnalites/tunnel/etapes"
import { Attente } from "@/fonctionnalites/tunnel/paiement/attente"

export const metadata: Metadata = {
  title: "Paiement en cours",
  robots: { index: false },
}

export default function PageAttente() {
  return (
    <Suspense fallback={<SqueletteTunnel />}>
      <Attente />
    </Suspense>
  )
}
