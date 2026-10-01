import type { Metadata } from "next"

import { DossierAnomalieEcran } from "@/components/modules/infrastructure/anomalies/dossier-anomalie"

export const metadata: Metadata = { title: "Infrastructures · Anomalie" }

export default async function AnomaliePage({ params }: { params: Promise<{ anomalieId: string }> }) {
  const { anomalieId } = await params
  return <DossierAnomalieEcran anomalieId={anomalieId} />
}
