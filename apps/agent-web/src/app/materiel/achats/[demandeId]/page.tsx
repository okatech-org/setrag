import type { Metadata } from "next"

import { PageDossierAchat } from "@/components/modules/gmao/achats/dossier-achat"

export const metadata: Metadata = { title: "Matériel roulant · Demande d'achat" }

export default async function DemandeAchatPage({ params }: { params: Promise<{ demandeId: string }> }) {
  const { demandeId } = await params
  return <PageDossierAchat demandeId={demandeId} />
}
