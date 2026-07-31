import type { Metadata } from "next"

import { HistoryScreen } from "@/components/history-screen"

export const metadata: Metadata = { title: "Historique et envoi" }

export default function HistoriquePage() {
  return <HistoryScreen />
}
