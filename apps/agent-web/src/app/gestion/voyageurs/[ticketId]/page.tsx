import { TravelerTicketDetail } from "@/components/traveler-ticket-detail"

export default async function TravelerTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  return <TravelerTicketDetail ticketId={ticketId} />
}
