import type { Metadata } from "next"

import { MesBillets } from "@/fonctionnalites/billets/mes-billets"

export const metadata: Metadata = {
  title: "Mes billets",
  description:
    "Vos réservations et vos billets SETRAG, lisibles sans réseau une fois enregistrés sur votre téléphone.",
}

export default function PageBillets() {
  return <MesBillets />
}
