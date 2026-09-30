import type { Metadata } from "next"

import { Donnees } from "@/fonctionnalites/compte/donnees"

export const metadata: Metadata = {
  title: "Mes données et consentements",
  description:
    "Vos consentements, l'export de vos données personnelles et la suppression de votre compte SETRAG.",
}

export default function PageDonnees() {
  return <Donnees />
}
