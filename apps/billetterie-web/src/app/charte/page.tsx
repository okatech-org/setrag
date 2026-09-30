import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Charte } from "@/fonctionnalites/charte/charte"

export const metadata: Metadata = {
  title: "Charte graphique",
  description: "La charte graphique SETRAG : marque, mouvement, composants, widgets, activité en direct, Wallet et Ruban, l’assistant.",
}

export default function PageCharte() {
  return (
    <>
      <BarreApp titre="Charte graphique" sousTitre="SETRAG · version 1" retour={true} />
      <Charte />
    </>
  )
}
