import type { Metadata } from "next"

import { ManifestScreen } from "@/components/manifest-screen"

export const metadata: Metadata = { title: "Manifeste embarqué" }

export default function ManifestePage() {
  return <ManifestScreen />
}
