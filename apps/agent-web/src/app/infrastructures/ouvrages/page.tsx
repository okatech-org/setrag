import type { Metadata } from "next"

import { OuvragesEcran } from "@/components/modules/infrastructure/ouvrages/ouvrages"

export const metadata: Metadata = { title: "Ouvrages d'art" }

export default function OuvragesPage() {
  return <OuvragesEcran />
}
