import type { Metadata } from "next"

import { JournalCopilot } from "@/components/modules/copilot/journal"

export const metadata: Metadata = { title: "SETRAG Copilot · Journal d'usage" }

export default function JournalPage() {
  return <JournalCopilot />
}
