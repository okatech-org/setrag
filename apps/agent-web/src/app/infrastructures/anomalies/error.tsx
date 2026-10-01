"use client"

import { ErreurInfra } from "@/components/modules/infrastructure/accueil/partage"

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurInfra error={error} reset={reset} quoi="Anomalie" retour={{ href: "/infrastructures/anomalies", libelle: "Registre des anomalies" }} />
}
