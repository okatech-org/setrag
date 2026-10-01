import type { Metadata } from "next"

import { LivretsListe } from "@/components/gestion/referentiels/livrets"

export const metadata: Metadata = { title: "Gestion · Livrets horaires" }

export default function LivretsPage() {
  return <LivretsListe />
}
