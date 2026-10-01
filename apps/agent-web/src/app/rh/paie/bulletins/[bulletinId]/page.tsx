import type { Metadata } from "next"

import { DossierBulletin } from "@/components/modules/rh/bulletin"

export const metadata: Metadata = { title: "Bulletin de paie" }

export default async function Page({ params }: { params: Promise<{ bulletinId: string }> }) {
  const { bulletinId } = await params
  return <DossierBulletin bulletinId={bulletinId} />
}
