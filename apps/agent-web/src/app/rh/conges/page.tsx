import type { Metadata } from "next"

import { ListeConges } from "@/components/modules/rh/conges"

export const metadata: Metadata = { title: "Congés et absences" }

export default function Page() {
  return <ListeConges />
}
