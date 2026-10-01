import type { Metadata } from "next"

import { VoyageursManifeste } from "@/components/gestion/referentiels/voyageurs"

export const metadata: Metadata = { title: "Gestion · Voyageurs et manifeste" }

export default function VoyageursPage() {
  return <VoyageursManifeste />
}
