import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Charte } from "@/fonctionnalites/charte/charte"

export const metadata: Metadata = {
  title: "Charte graphique",
  description: "La charte graphique SETRAG : le logo, la voie et le ruban, les couleurs, le mouvement et tous les composants de la billetterie.",
}

export default function PageCharte() {
  return (
    <>
      <BarreApp titre="Charte graphique" sousTitre="SETRAG · version 1" retour={true} />
      <Charte />
    </>
  )
}
