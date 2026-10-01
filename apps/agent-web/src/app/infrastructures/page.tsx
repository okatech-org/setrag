import type { Metadata } from "next"

import { TableauDeBordInfra } from "@/components/modules/infrastructure/accueil/tableau-de-bord"

export const metadata: Metadata = { title: "Infrastructures · Tableau de bord" }

export default function InfrastructuresPage() {
  return <TableauDeBordInfra />
}
