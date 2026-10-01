import { EquipementDossier } from "@/components/modules/infrastructure/equipements/equipement-dossier"

export default async function EquipementPage({ params }: { params: Promise<{ equipementId: string }> }) {
  const { equipementId } = await params
  return <EquipementDossier equipementId={equipementId} />
}
