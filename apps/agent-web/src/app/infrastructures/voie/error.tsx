"use client"

import { ErreurInfra } from "@/components/modules/infrastructure/accueil/partage"

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurInfra error={error} reset={reset} quoi="Section de voie" retour={{ href: "/infrastructures/voie", libelle: "Voie et sections" }} />
}
