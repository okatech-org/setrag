import { SeatBlockDetail } from "@/components/seat-block-detail"

export default async function SeatBlockDetailPage({
  params,
}: {
  params: Promise<{ blockId: string }>
}) {
  const { blockId } = await params
  return <SeatBlockDetail blockId={blockId} />
}
