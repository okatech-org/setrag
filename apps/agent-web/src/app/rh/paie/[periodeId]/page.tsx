import type { Metadata } from "next"

import { DossierPeriode } from "@/components/modules/rh/paie"

export const metadata: Metadata = { title: "Période de paie" }

export default async function Page({ params }: { params: Promise<{ periodeId: string }> }) {
  const { periodeId } = await params
  return <DossierPeriode periodeId={periodeId} />
}
