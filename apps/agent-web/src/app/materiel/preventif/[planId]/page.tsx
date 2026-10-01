import { DetailPlan } from "@/components/modules/gmao/preventif/detail-plan"

export default async function DetailPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params
  return <DetailPlan planId={planId} />
}
