import type { Metadata } from "next"

import { ReglagesScreen } from "@/components/reglages-screen"

export const metadata: Metadata = { title: "Réglages" }

export default function ReglagesPage() {
  return <ReglagesScreen />
}
