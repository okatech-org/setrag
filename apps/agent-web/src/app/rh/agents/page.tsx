import type { Metadata } from "next"

import { ListeAgents } from "@/components/modules/rh/agents"

export const metadata: Metadata = { title: "Dossiers du personnel" }

export default function AgentsPage() {
  return <ListeAgents />
}
