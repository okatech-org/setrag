import { InterventionDossier } from "@/components/modules/infrastructure/interventions/intervention-dossier"

export default async function InterventionPage({ params }: { params: Promise<{ interventionId: string }> }) {
  const { interventionId } = await params
  return <InterventionDossier interventionId={interventionId} />
}
