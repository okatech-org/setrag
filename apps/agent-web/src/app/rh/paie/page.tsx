import type { Metadata } from "next"

import { ListePaie } from "@/components/modules/rh/paie"

export const metadata: Metadata = { title: "Paie et déclarations" }

export default function Page() {
  return <ListePaie />
}
