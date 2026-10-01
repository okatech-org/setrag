"use client"

import { ErreurRubrique } from "@/components/modules/infrastructure/interventions/partage"

export default function ErreurProgramme({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurRubrique error={error} reset={reset} quoi="Chantier" retour={{ href: "/infrastructures/prn", libelle: "Programme PRN" }} />
}
