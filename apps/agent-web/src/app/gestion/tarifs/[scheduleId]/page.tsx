import type { Metadata } from "next"

import { FareScheduleDetail } from "@/components/fare-schedule-detail"

export const metadata: Metadata = {
  title: "Gestion · Détail du barème",
}

export default async function FareSchedulePage({
  params,
}: {
  params: Promise<{ scheduleId: string }>
}) {
  const { scheduleId } = await params
  return <FareScheduleDetail scheduleId={scheduleId} />
}
