import type { Metadata } from "next"

import { PlanningRoulements } from "@/components/modules/rh/roulements"

export const metadata: Metadata = { title: "Roulements" }

export default function Page() {
  return <PlanningRoulements />
}
