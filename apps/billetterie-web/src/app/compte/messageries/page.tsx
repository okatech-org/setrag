import type { Metadata } from "next"

import { Messageries } from "@/fonctionnalites/compte/messageries"

export const metadata: Metadata = {
  title: "Messageries reliées",
  description: "Les messageries où Ruban, l'assistant SETRAG, retrouve vos billets.",
}

export default function PageMessageries() {
  return <Messageries />
}
