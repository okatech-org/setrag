import type { Metadata } from "next"

import { TableauDeBord } from "@/components/gestion/pilotage/tableau-de-bord"

export const metadata: Metadata = { title: "Gestion · Tableau de bord" }

export default function ManagementHomePage() {
  return <TableauDeBord />
}
