import type { Metadata } from "next"

import { Tournee } from "@/fonctionnalites/tournee/tournee"

export const metadata: Metadata = { title: "Tournée" }

export default function TourneePage() {
  return <Tournee />
}
