import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Bagages } from "@/fonctionnalites/infos/bagages"

export const metadata: Metadata = {
  title: "Bagages et colis",
  description:
    "Bagages, colis express, transport de véhicules et transport funéraire sur le Transgabonais : ce qui se fait au guichet.",
}

export default function PageBagages() {
  return (
    <>
      <BarreApp
        titre="Bagages et colis"
        sousTitre="Au guichet de la gare"
        retour={true}
      />
      <Bagages />
    </>
  )
}
