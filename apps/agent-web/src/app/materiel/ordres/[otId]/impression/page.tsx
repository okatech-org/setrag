import type { Metadata } from "next"

import { ImpressionOt } from "@/components/modules/gmao/ordres/impression-ot"

export const metadata: Metadata = { title: "Fiche d'ordre de travail" }

export default async function ImpressionOtPage({ params }: { params: Promise<{ otId: string }> }) {
  const { otId } = await params
  return <ImpressionOt otId={otId} />
}
