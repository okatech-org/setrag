import type { Metadata } from "next"

import { PlanClassement } from "@/components/modules/ged/classement"

export const metadata: Metadata = { title: "GED · Classement et archives" }

export default function ClassementPage() {
  return <PlanClassement />
}
