import type { Metadata } from "next"

import { IncidentScreen } from "@/components/incident-screen"

export const metadata: Metadata = { title: "Incidents" }

export default function IncidentPage() {
  return <IncidentScreen />
}
