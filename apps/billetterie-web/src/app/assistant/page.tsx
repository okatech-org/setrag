import type { Metadata } from "next"

import { PageAssistant } from "@/fonctionnalites/assistant/page-assistant"

export const metadata: Metadata = {
  title: "Ruban, l'assistant",
  description: "Ruban, l'assistant de la SETRAG : un train, un prix, une réservation, un billet — à l'écrit ou à la voix.",
}

export default function PageRuban() {
  return <PageAssistant />
}
