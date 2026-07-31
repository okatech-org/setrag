import type { Metadata } from "next"

import { DashboardScreen } from "@/components/dashboard-screen"

export const metadata: Metadata = { title: "Tournée" }

export default function TourneePage() {
  return <DashboardScreen />
}
