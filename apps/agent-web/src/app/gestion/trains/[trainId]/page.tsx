import type { Metadata } from "next"

import { TrainDetailScreen } from "@/components/train-detail"

export const metadata: Metadata = {
  title: "Gestion · Détail du train",
}

export default async function TrainDetailPage({
  params,
}: {
  params: Promise<{ trainId: string }>
}) {
  const { trainId } = await params
  return <TrainDetailScreen trainId={trainId} />
}
