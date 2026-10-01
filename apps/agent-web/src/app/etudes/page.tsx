import type { Metadata } from "next"

import { Bibliotheque } from "@/components/modules/etudes/bibliotheque"

export const metadata: Metadata = { title: "Audit et documents" }

export default function EtudesPage() {
  return <Bibliotheque />
}
