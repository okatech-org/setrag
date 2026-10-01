import { OuvrageDossier } from "@/components/modules/infrastructure/ouvrages/ouvrage-dossier"

export default async function OuvragePage({ params }: { params: Promise<{ ouvrageId: string }> }) {
  const { ouvrageId } = await params
  return <OuvrageDossier ouvrageId={ouvrageId} />
}
