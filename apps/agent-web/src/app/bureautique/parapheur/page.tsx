import type { Metadata } from "next"

import { Parapheur } from "@/components/modules/ged/parapheur"

export const metadata: Metadata = { title: "GED · Parapheur" }

export default function ParapheurPage() {
  return <Parapheur />
}
