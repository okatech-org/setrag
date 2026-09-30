import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Aide } from "@/fonctionnalites/infos/aide"

export const metadata: Metadata = {
  title: "Aide",
  description:
    "Retrouver un billet, voyager sans réseau, payer, annuler, installer l’application : les réponses de la billetterie SETRAG.",
}

export default function PageAide() {
  return (
    <>
      <BarreApp titre="Aide" sousTitre="Questions fréquentes" retour={true} />
      <Aide />
    </>
  )
}
