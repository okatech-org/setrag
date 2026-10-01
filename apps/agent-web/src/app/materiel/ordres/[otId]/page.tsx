import type { Metadata } from "next"

import { PageDossierOt } from "@/components/modules/gmao/ordres/dossier-ot"

export const metadata: Metadata = { title: "Matériel roulant · Ordre de travail" }

export default async function OrdreTravailPage({ params }: { params: Promise<{ otId: string }> }) {
  const { otId } = await params
  return <PageDossierOt otId={otId} />
}
