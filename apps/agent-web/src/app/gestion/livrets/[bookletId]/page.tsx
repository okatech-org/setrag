import { BookletDetail } from "@/components/booklet-detail"

export default async function BookletDetailPage({
  params,
}: {
  params: Promise<{ bookletId: string }>
}) {
  const { bookletId } = await params
  return <BookletDetail bookletId={bookletId} />
}
