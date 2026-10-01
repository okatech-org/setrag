import type { Metadata } from "next"

import { DossierArtf } from "@/components/modules/securite/artf"

export const metadata: Metadata = { title: "Déclaration ARTF" }

export default async function DossierArtfPage({
  params,
}: {
  params: Promise<{ declarationId: string }>
}) {
  const { declarationId } = await params
  return <DossierArtf declarationId={declarationId} />
}
