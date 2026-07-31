import type { Metadata } from "next"

import { ConflictScreen } from "@/components/conflict-screen"

export const metadata: Metadata = { title: "Conflits à arbitrer" }

export default function ConflitsPage() {
  return <ConflictScreen />
}
