import type { Metadata } from "next"

import { DossierLtvEcran } from "@/components/modules/infrastructure/ltv/dossier-ltv"

export const metadata: Metadata = { title: "Infrastructures · Limitation de vitesse" }

export default async function LtvDossierPage({ params }: { params: Promise<{ ltvId: string }> }) {
  const { ltvId } = await params
  return <DossierLtvEcran ltvId={ltvId} />
}
