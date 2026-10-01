import type { Metadata } from "next"

import { AccueilSecurite } from "@/components/modules/securite/accueil-securite"

export const metadata: Metadata = {
  title: "Sécurité ferroviaire et conformité ARTF",
}

export default function SecuritePage() {
  return <AccueilSecurite />
}
