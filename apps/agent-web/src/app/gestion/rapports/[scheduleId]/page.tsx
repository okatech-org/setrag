import { ReportScheduleDetail } from "@/components/report-schedule-detail"

export default async function ReportScheduleDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>
}) {
  const { scheduleId } = await params
  return <ReportScheduleDetail scheduleId={scheduleId} />
}
