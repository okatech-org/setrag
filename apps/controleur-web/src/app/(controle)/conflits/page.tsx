import type { Metadata } from "next"

import { Conflits } from "@/fonctionnalites/conflits/conflits"

export const metadata: Metadata = { title: "Conflits" }

export default function ConflitsPage() {
  return <Conflits />
}
