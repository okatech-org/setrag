import type { Metadata } from "next"

import { DocumentDetail } from "@/components/modules/ged/document-detail"

export const metadata: Metadata = { title: "GED · Pièce" }

export default async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  return <DocumentDetail documentId={documentId} />
}
