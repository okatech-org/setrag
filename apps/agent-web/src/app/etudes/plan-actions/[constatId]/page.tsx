import type { Metadata } from "next"

import { ConstatDetail } from "@/components/modules/etudes/constat"

export const metadata: Metadata = { title: "Audit et documents · Action d'audit" }

export default async function ConstatPage({ params }: { params: Promise<{ constatId: string }> }) {
  const { constatId } = await params
  return <ConstatDetail constatId={constatId} />
}
