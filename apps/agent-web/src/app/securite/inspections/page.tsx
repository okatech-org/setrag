import type { Metadata } from "next"

import { ListeInspections } from "@/components/modules/securite/inspections"

export const metadata: Metadata = { title: "Inspections et audits" }

export default function InspectionsPage() {
  return <ListeInspections />
}
