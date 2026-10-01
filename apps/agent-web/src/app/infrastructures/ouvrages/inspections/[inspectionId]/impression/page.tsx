import type { Metadata } from "next"

import { InspectionImprimable } from "@/components/modules/infrastructure/ouvrages/inspection"

export const metadata: Metadata = { title: "Rapport d'inspection" }

export default async function InspectionImpressionPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params
  return <InspectionImprimable inspectionId={inspectionId} />
}
