import type { Metadata } from "next"

import { BarreApp } from "@/coquille/barre-app"
import { Conditions } from "@/fonctionnalites/infos/conditions"
import { VERSION_CGV } from "@/fonctionnalites/infos/regles"

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Les règles de vente que la billetterie SETRAG applique aujourd’hui, en attendant le texte définitif des conditions générales.",
}

export default function PageConditions() {
  return (
    <>
      <BarreApp
        titre="Conditions de vente"
        sousTitre={`Version ${VERSION_CGV}`}
        retour={true}
      />
      <Conditions />
    </>
  )
}
