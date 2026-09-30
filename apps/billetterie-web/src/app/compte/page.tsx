import type { Metadata } from "next"

import { Compte } from "@/fonctionnalites/compte/compte"

export const metadata: Metadata = {
  title: "Mon compte",
  description:
    "Votre profil, vos voyageurs enregistrés, vos alertes et vos données personnelles sur la billetterie SETRAG.",
}

export default function PageCompte() {
  return <Compte />
}
