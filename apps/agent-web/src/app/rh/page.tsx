import type { Metadata } from "next"

import { AccueilRh } from "@/components/modules/rh/accueil-rh"

export const metadata: Metadata = { title: "Ressources humaines" }

export default function RhPage() {
  return <AccueilRh />
}
