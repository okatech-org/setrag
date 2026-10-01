import type { Metadata } from "next"

import { DepotDocument } from "@/components/modules/ged/depot"

export const metadata: Metadata = { title: "GED · Déposer une pièce" }

export default function NouveauDocumentPage() {
  return <DepotDocument />
}
