import type { Metadata } from "next"

import { FinanceDashboardPage } from "@/components/modules/finance/finance-dashboard"

export const metadata: Metadata = {
  title: "Finances & comptabilité",
}

export default function FinancesPage() {
  return <FinanceDashboardPage />
}
