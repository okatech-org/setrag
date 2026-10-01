import type { Metadata } from "next"
import { Suspense } from "react"

import { NewSeatBlock } from "@/components/new-seat-block"

export const metadata: Metadata = { title: "Gestion · Bloquer des places" }

export default function NewSeatBlockPage() {
  return (
    <Suspense fallback={null}>
      <NewSeatBlock />
    </Suspense>
  )
}
