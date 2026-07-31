import type { Metadata } from "next"

import { SearchScreen } from "@/components/search-screen"

export const metadata: Metadata = { title: "Recherche manuelle" }

export default function RecherchePage() {
  return <SearchScreen />
}
