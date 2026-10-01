import type { Metadata } from "next"

import { DossierInspection } from "@/components/modules/securite/inspection-dossier"

export const metadata: Metadata = { title: "Inspection" }

export default async function DossierInspectionPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>
}) {
  const { inspectionId } = await params
  return <DossierInspection inspectionId={inspectionId} />
}
