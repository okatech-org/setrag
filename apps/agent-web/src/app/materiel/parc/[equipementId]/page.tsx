import { FicheEngin } from "@/components/modules/gmao/parc/fiche-engin"

export default async function FicheEnginPage({ params }: { params: Promise<{ equipementId: string }> }) {
  const { equipementId } = await params
  return <FicheEngin equipementId={equipementId} />
}
