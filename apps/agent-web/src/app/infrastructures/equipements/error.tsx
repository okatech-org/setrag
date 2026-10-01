"use client"

import { ErreurRubrique } from "@/components/modules/infrastructure/interventions/partage"

export default function ErreurEquipements({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurRubrique error={error} reset={reset} quoi="Équipement" retour={{ href: "/infrastructures/equipements", libelle: "Signalisation et télécoms" }} />
}
