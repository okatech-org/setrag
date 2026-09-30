import type { Metadata } from "next"

import { Preferences } from "@/fonctionnalites/compte/preferences"

export const metadata: Metadata = {
  title: "Alertes et notifications",
  description:
    "Où et pour quoi la billetterie SETRAG vous prévient, et l'affichage de l'application.",
}

export default function PagePreferences() {
  return <Preferences />
}
