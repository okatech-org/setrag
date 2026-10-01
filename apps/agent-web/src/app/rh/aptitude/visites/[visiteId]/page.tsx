import type { Metadata } from "next"

import { DossierVisite } from "@/components/modules/rh/aptitude"

export const metadata: Metadata = { title: "Visite médicale" }

export default async function Page({ params }: { params: Promise<{ visiteId: string }> }) {
  const { visiteId } = await params
  return <DossierVisite visiteId={visiteId} />
}
