import type { Metadata } from "next"
import { Suspense } from "react"

import { RegistreOt } from "@/components/modules/gmao/ordres/registre-ot"

export const metadata: Metadata = { title: "Matériel roulant · Ordres de travail" }

export default function OrdresTravailPage() {
  return (
    <Suspense fallback={null}>
      <RegistreOt />
    </Suspense>
  )
}
