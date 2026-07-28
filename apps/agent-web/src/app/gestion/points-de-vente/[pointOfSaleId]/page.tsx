import type { Metadata } from "next"

import { PointOfSaleDetail } from "@/components/point-of-sale-detail"

export const metadata: Metadata = {
  title: "Gestion · Détail du point de vente",
}

export default async function PointOfSaleDetailPage({
  params,
}: {
  params: Promise<{ pointOfSaleId: string }>
}) {
  const { pointOfSaleId } = await params
  return <PointOfSaleDetail pointOfSaleId={pointOfSaleId} />
}
