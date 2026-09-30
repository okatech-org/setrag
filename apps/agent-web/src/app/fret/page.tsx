import type { Metadata } from "next"

import { FreightDashboardPage } from "@/components/modules/fret/screens/freight-dashboard"

export const metadata: Metadata = { title: "Fret & Marchandises" }

export default function FretPage() {
  return <FreightDashboardPage />
}
