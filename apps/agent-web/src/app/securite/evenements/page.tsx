import type { Metadata } from "next"

import { RegistreEvenements } from "@/components/modules/securite/evenements"

export const metadata: Metadata = {
  title: "Registre des événements de sécurité",
}

export default function EvenementsPage() {
  return <RegistreEvenements />
}
