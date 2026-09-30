import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Presentation } from "@/fonctionnalites/infos/presentation"

export const metadata: Metadata = {
  title: "Dossier SETRAG — NTSAGUI DIGITAL",
  description:
    "Applications en ligne et propositions commerciales de NTSAGUI DIGITAL pour la digitalisation de la billettique du Transgabonais.",
  // Dossier commercial : accessible par lien, jamais listé par un moteur.
  robots: { index: false, follow: false },
}

export default function PagePresentation() {
  return (
    <>
      <BarreApp
        titre="Dossier SETRAG"
        sousTitre="NTSAGUI DIGITAL"
        retour={true}
      />
      <Presentation />
    </>
  )
}
