import type { Metadata } from "next"
import { Suspense } from "react"

import { Suivi } from "@/fonctionnalites/suivi/suivi"

export const metadata: Metadata = {
  title: "Suivi des trains",
  description:
    "Les trains du Transgabonais du jour : arrêts, heures, retard annoncé et position estimée.",
}

export default function PageSuivi() {
  return (
    <Suspense>
      <Suivi />
    </Suspense>
  )
}
