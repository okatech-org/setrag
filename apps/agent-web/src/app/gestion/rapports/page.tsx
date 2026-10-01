import type { Metadata } from "next"
import { Suspense } from "react"

import { Rapports } from "@/components/gestion/pilotage/rapports"

export const metadata: Metadata = { title: "Gestion · Rapports" }

export default function RapportsPage() {
  return (
    <Suspense>
      <Rapports />
    </Suspense>
  )
}
