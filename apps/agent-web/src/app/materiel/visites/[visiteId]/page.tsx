import { BulletinVisite } from "@/components/modules/gmao/visites/bulletin-visite"

export default async function BulletinVisitePage({ params }: { params: Promise<{ visiteId: string }> }) {
  const { visiteId } = await params
  return <BulletinVisite visiteId={visiteId} />
}
