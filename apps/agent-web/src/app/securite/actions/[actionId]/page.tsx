import type { Metadata } from "next"

import { DossierAction } from "@/components/modules/securite/action-dossier"

export const metadata: Metadata = { title: "Action corrective" }

export default async function DossierActionPage({
  params,
}: {
  params: Promise<{ actionId: string }>
}) {
  const { actionId } = await params
  return <DossierAction actionId={actionId} />
}
