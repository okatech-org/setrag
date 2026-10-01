import type { Metadata } from "next"

import { TrainsListe } from "@/components/gestion/referentiels/trains"

export const metadata: Metadata = { title: "Gestion · Trains et voitures" }

export default function TrainsPage() {
  return <TrainsListe />
}
