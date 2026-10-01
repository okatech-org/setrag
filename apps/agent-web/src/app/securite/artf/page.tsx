import type { Metadata } from "next"

import { ListeArtf } from "@/components/modules/securite/artf"

export const metadata: Metadata = { title: "Déclarations ARTF" }

export default function ArtfPage() {
  return <ListeArtf />
}
