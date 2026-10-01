import type { Metadata } from "next"

import { DossierEnquete } from "@/components/modules/securite/enquete-dossier"

export const metadata: Metadata = { title: "Enquête de sécurité" }

export default async function DossierEnquetePage({
  params,
}: {
  params: Promise<{ enqueteId: string }>
}) {
  const { enqueteId } = await params
  return <DossierEnquete enqueteId={enqueteId} />
}
