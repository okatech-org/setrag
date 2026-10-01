import type { Metadata } from "next"

import { PlanActions } from "@/components/modules/etudes/plan-actions"

export const metadata: Metadata = { title: "Audit et documents · Plan d'actions" }

export default function PlanActionsPage() {
  return <PlanActions />
}
