import { InspectionRapport } from "@/components/modules/infrastructure/ouvrages/inspection"

export default async function InspectionPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params
  return <InspectionRapport inspectionId={inspectionId} />
}
