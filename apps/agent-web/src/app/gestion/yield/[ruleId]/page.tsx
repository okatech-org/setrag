import type { Metadata } from "next"

import { PricingRuleDetail } from "@/components/pricing-rule-detail"

export const metadata: Metadata = {
  title: "Gestion · Détail de la règle yield",
}

export default async function PricingRuleDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>
}) {
  const { ruleId } = await params
  return <PricingRuleDetail ruleId={ruleId} />
}
