import type { Metadata } from "next"

import { ApresVenteReseauPageClient } from "@/components/guichet/apres-vente"

export const metadata: Metadata = { title: "Gestion · Après-vente du réseau" }

export default function ApresVenteReseauPage() {
  return <ApresVenteReseauPageClient />
}
