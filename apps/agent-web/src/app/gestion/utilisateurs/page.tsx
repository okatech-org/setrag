import type { Metadata } from "next"

import { UtilisateursDroits } from "@/components/gestion/referentiels/utilisateurs"

export const metadata: Metadata = { title: "Gestion · Utilisateurs et droits" }

export default function UtilisateursPage() {
  return <UtilisateursDroits />
}
