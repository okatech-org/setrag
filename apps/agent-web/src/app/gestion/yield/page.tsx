import type { Metadata } from "next"

import { YieldManagement } from "@/components/gestion/referentiels/yield"

export const metadata: Metadata = { title: "Gestion · Yield management" }

export default function YieldPage() {
  return <YieldManagement />
}
