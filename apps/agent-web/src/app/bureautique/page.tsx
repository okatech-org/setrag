import type { Metadata } from "next"

import { AccueilGed } from "@/components/modules/ged/accueil"

export const metadata: Metadata = { title: "Bureautique et GED" }

export default function BureautiquePage() {
  return <AccueilGed />
}
