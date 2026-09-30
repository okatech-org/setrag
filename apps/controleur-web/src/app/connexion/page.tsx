import type { Metadata } from "next"

import { Connexion } from "@/fonctionnalites/connexion/connexion"

export const metadata: Metadata = {
  title: "Connexion",
}

export default function ConnexionPage() {
  return <Connexion />
}
