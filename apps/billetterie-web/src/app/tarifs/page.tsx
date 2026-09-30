import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Tarifs } from "@/fonctionnalites/infos/tarifs"

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Classes, calcul du prix au kilomètre, réductions et groupes sur la ligne Owendo–Franceville : ce que le système applique.",
}

export default function PageTarifs() {
  return (
    <>
      <BarreApp
        titre="Tarifs"
        sousTitre="Classes, réductions, groupes"
        retour={true}
      />
      <Tarifs />
    </>
  )
}
