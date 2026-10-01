import type { Metadata } from "next"

import { ParametragePage } from "@/components/gestion/pilotage/parametrage"

export const metadata: Metadata = { title: "Gestion · Paramétrage" }

export default function Parametrage() {
  return <ParametragePage />
}
