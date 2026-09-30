import type { Metadata } from "next"
import { Suspense } from "react"

import {
  ExecutivePageClient,
  ExecutivePageFallback,
} from "@/components/direction/executive-page-client"

export const metadata: Metadata = {
  title: "Risques et continuité · Direction générale",
}

/**
 * La route est statique et le client lit `useSearchParams` (période) :
 * la frontière `Suspense` est exigée par `next build`.
 */
export default function DirectionRisksPage() {
  return (
    <Suspense fallback={<ExecutivePageFallback />}>
      <ExecutivePageClient volet="risks" />
    </Suspense>
  )
}
