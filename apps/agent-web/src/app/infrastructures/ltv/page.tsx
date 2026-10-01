import type { Metadata } from "next"
import { Suspense } from "react"

import { ListeLtv } from "@/components/modules/infrastructure/ltv/liste-ltv"

export const metadata: Metadata = { title: "Infrastructures · Limitations de vitesse" }

export default function LtvPage() {
  return (
    <Suspense fallback={null}>
      <ListeLtv />
    </Suspense>
  )
}
