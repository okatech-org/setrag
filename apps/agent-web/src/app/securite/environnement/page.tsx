import type { Metadata } from "next"

import { SuiviEnvironnement } from "@/components/modules/securite/environnement"

export const metadata: Metadata = { title: "Environnement · parc de la Lopé" }

export default function EnvironnementPage() {
  return <SuiviEnvironnement />
}
