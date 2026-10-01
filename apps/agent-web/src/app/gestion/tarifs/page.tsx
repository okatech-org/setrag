import type { Metadata } from "next"

import { TarifsListe } from "@/components/gestion/referentiels/tarifs"

export const metadata: Metadata = { title: "Gestion · Tarifs" }

export default function TarifsPage() {
  return <TarifsListe />
}
