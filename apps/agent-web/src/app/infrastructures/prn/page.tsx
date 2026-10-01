import type { Metadata } from "next"

import { ProgrammeEcran } from "@/components/modules/infrastructure/prn/prn"

export const metadata: Metadata = { title: "Programme de remise à niveau" }

export default function ProgrammePage() {
  return <ProgrammeEcran />
}
