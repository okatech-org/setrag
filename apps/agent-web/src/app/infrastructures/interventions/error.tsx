"use client"

import { ErreurRubrique } from "@/components/modules/infrastructure/interventions/partage"

export default function ErreurInterventions({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurRubrique error={error} reset={reset} quoi="Plage travaux" retour={{ href: "/infrastructures/interventions", libelle: "Plages travaux" }} />
}
