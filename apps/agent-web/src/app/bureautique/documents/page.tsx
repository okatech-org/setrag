import type { Metadata } from "next"
import { Suspense } from "react"

import { ListeDocuments } from "@/components/modules/ged/documents"

export const metadata: Metadata = { title: "GED · Documents" }

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <ListeDocuments />
    </Suspense>
  )
}
