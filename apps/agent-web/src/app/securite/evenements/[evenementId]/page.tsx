import type { Metadata } from "next"

import { DossierEvenement } from "@/components/modules/securite/evenement-dossier"

export const metadata: Metadata = { title: "Événement de sécurité" }

export default async function DossierEvenementPage({
  params,
}: {
  params: Promise<{ evenementId: string }>
}) {
  const { evenementId } = await params
  return <DossierEvenement evenementId={evenementId} />
}
