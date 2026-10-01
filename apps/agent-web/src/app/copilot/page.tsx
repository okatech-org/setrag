import type { Metadata } from "next"

import { EcranCopilot } from "@/components/modules/copilot/ecran"

export const metadata: Metadata = { title: "SETRAG Copilot" }

export default function CopilotPage() {
  return <EcranCopilot />
}
