import type { Metadata } from "next"

import { ListeEnquetes } from "@/components/modules/securite/enquetes"

export const metadata: Metadata = { title: "Enquêtes de sécurité" }

export default function EnquetesPage() {
  return <ListeEnquetes />
}
