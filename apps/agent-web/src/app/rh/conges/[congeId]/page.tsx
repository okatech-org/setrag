import type { Metadata } from "next"

import { DossierConge } from "@/components/modules/rh/conges"

export const metadata: Metadata = { title: "Congé" }

export default async function Page({ params }: { params: Promise<{ congeId: string }> }) {
  const { congeId } = await params
  return <DossierConge congeId={congeId} />
}
