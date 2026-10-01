import type { Metadata } from "next"

import { ListeActions } from "@/components/modules/securite/actions"

export const metadata: Metadata = { title: "Plan d'actions correctives" }

export default function ActionsPage() {
  return <ListeActions />
}
