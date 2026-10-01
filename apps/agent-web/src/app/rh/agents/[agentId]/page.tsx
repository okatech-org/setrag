import type { Metadata } from "next"

import { DossierAgent } from "@/components/modules/rh/agent-dossier"

export const metadata: Metadata = { title: "Dossier d'un agent" }

export default async function DossierAgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  return <DossierAgent agentId={agentId} />
}
