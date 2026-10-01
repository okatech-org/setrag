import type { Metadata } from "next"

import { RapportEnquete } from "@/components/modules/securite/rapport-enquete"

export const metadata: Metadata = { title: "Rapport d'enquête" }

export default async function RapportEnquetePage({
  params,
}: {
  params: Promise<{ enqueteId: string }>
}) {
  const { enqueteId } = await params
  return <RapportEnquete enqueteId={enqueteId} />
}
