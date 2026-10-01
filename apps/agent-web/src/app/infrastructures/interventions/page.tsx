import type { Metadata } from "next"

import { InterventionsEcran } from "@/components/modules/infrastructure/interventions/interventions"

export const metadata: Metadata = { title: "Plages travaux" }

export default function InterventionsPage() {
  return <InterventionsEcran />
}
