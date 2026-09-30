import type { Metadata } from "next"
import { Suspense } from "react"

import { Connexion } from "@/fonctionnalites/connexion/connexion"

export const metadata: Metadata = {
  title: "Connexion",
  description:
    "Connectez-vous à la billetterie SETRAG avec un code reçu par SMS ou par e-mail, sans mot de passe.",
}

export default function PageConnexion() {
  return (
    // L'adresse de retour se lit dans la requête : `useSearchParams` exige un
    // Suspense pour que la page reste pré-rendue.
    <Suspense>
      <Connexion />
    </Suspense>
  )
}
