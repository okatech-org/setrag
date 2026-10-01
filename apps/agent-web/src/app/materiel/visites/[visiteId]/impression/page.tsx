import type { Metadata } from "next"

import { BulletinImprimable } from "@/components/modules/gmao/visites/impression-visite"

export const metadata: Metadata = { title: "Bulletin de visite avant départ" }

export default async function ImpressionVisitePage({ params }: { params: Promise<{ visiteId: string }> }) {
  const { visiteId } = await params
  return <BulletinImprimable visiteId={visiteId} />
}
