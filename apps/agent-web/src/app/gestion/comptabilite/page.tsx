import type { Metadata } from "next"
import { Suspense } from "react"

import { Comptabilite } from "@/components/gestion/pilotage/comptabilite"

export const metadata: Metadata = { title: "Gestion · Comptabilité" }

export default function ComptabilitePage() {
  return (
    <Suspense>
      <Comptabilite />
    </Suspense>
  )
}
