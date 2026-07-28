import { PenaltyDetail } from "@/components/penalty-detail"

export default async function PenaltyDetailPage({
  params,
}: {
  params: Promise<{ penaltyId: string }>
}) {
  const { penaltyId } = await params
  return <PenaltyDetail penaltyId={penaltyId} />
}
