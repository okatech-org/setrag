import type { Metadata } from "next"
import { Suspense } from "react"

import { SqueletteTunnel } from "@/fonctionnalites/tunnel/etapes"
import { Resultats } from "@/fonctionnalites/tunnel/resultats/resultats"

export const metadata: Metadata = {
  title: "Trains disponibles",
  description:
    "Horaires, places et prix des trains du Transgabonais pour votre trajet.",
}

export default function PageResultats() {
  return (
    <Suspense fallback={<SqueletteTunnel />}>
      <Resultats />
    </Suspense>
  )
}
