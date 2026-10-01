import type { Metadata } from "next"
import { Suspense } from "react"

import { RegistreCourrier } from "@/components/modules/ged/courrier"

export const metadata: Metadata = { title: "GED · Registre du courrier" }

export default function CourrierPage() {
  return (
    <Suspense fallback={null}>
      <RegistreCourrier />
    </Suspense>
  )
}
