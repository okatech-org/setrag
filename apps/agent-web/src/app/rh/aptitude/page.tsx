import type { Metadata } from "next"

import { SuiviAptitude } from "@/components/modules/rh/aptitude"

export const metadata: Metadata = { title: "Aptitude médicale" }

export default function Page() {
  return <SuiviAptitude />
}
