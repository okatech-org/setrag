import type { Metadata } from "next"

import { CotrafDashboardPage } from "@/components/modules/cotraf/cotraf-dashboard"

export const metadata: Metadata = {
  title: "Régulation & trafic COTRAF",
}

export default function CotrafPage() {
  return <CotrafDashboardPage />
}
