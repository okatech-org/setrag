import type { Metadata } from "next"
import { Suspense } from "react"

import { Controle } from "@/fonctionnalites/controle/viseur"

export const metadata: Metadata = { title: "Scanner" }

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <Controle />
    </Suspense>
  )
}
