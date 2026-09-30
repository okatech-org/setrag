import type { Metadata } from "next"

import { Voyageurs } from "@/fonctionnalites/compte/voyageurs"

export const metadata: Metadata = {
  title: "Voyageurs enregistrés",
  description:
    "Les personnes avec qui vous voyagez, enregistrées dans votre compte SETRAG.",
}

export default function PageVoyageurs() {
  return <Voyageurs />
}
