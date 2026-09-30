import type { Metadata } from "next"

import { Profil } from "@/fonctionnalites/compte/profil"

export const metadata: Metadata = {
  title: "Profil",
  description: "Votre nom et vos coordonnées sur la billetterie SETRAG.",
}

export default function PageProfil() {
  return <Profil />
}
