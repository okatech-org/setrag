import type { Metadata } from "next"

import { EquipementsEcran } from "@/components/modules/infrastructure/equipements/equipements"

export const metadata: Metadata = { title: "Signalisation, passages à niveau et télécoms" }

export default function EquipementsPage() {
  return <EquipementsEcran />
}
