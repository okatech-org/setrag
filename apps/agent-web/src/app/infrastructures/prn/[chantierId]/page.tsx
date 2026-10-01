import { ChantierDossier } from "@/components/modules/infrastructure/prn/chantier-dossier"

export default async function ChantierPage({ params }: { params: Promise<{ chantierId: string }> }) {
  const { chantierId } = await params
  return <ChantierDossier chantierId={chantierId} />
}
