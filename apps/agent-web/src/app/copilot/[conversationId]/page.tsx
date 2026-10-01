import type { Metadata } from "next"

import { EcranCopilot } from "@/components/modules/copilot/ecran"

export const metadata: Metadata = { title: "SETRAG Copilot · Conversation" }

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  return <EcranCopilot conversationId={conversationId} />
}
