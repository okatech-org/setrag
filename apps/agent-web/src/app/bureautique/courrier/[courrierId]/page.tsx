import type { Metadata } from "next"

import { CourrierDetail } from "@/components/modules/ged/courrier-detail"

export const metadata: Metadata = { title: "GED · Courrier" }

export default async function CourrierDetailPage({ params }: { params: Promise<{ courrierId: string }> }) {
  const { courrierId } = await params
  return <CourrierDetail courrierId={courrierId} />
}
