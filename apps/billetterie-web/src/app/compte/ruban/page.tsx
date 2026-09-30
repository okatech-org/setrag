import type { Metadata } from "next"

import { CeQueRubanRetient } from "@/fonctionnalites/compte/ruban"

export const metadata: Metadata = {
  title: "Ce que Ruban retient",
  description:
    "Les préférences et habitudes de voyage que Ruban, l'assistant SETRAG, a notées pour votre compte.",
}

export default function PageRuban() {
  return <CeQueRubanRetient />
}
