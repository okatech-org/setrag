import type { Metadata } from "next"
import { Suspense } from "react"

import { ControleRecettes } from "@/components/gestion/pilotage/recettes"

export const metadata: Metadata = { title: "Gestion · Contrôle des recettes" }

export default function RecettesPage() {
  return (
    <Suspense>
      <ControleRecettes />
    </Suspense>
  )
}
