import type { Metadata } from "next"

import { ManagementPageClient } from "@/components/management-screens"

export const metadata: Metadata = { title: "Gestion · Vue d’ensemble" }

export default function ManagementHomePage() {
  return <ManagementPageClient section="tableau-de-bord" />
}
