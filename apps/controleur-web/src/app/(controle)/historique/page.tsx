import type { Metadata } from "next"

import { Historique } from "@/fonctionnalites/historique/historique"

export const metadata: Metadata = { title: "Historique" }

export default function HistoriquePage() {
  return <Historique />
}
