"use client"

import { ErreurRubrique } from "@/components/modules/infrastructure/interventions/partage"

export default function ErreurOuvrages({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurRubrique error={error} reset={reset} quoi="Ouvrage" retour={{ href: "/infrastructures/ouvrages", libelle: "Ouvrages d'art" }} />
}
