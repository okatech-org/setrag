import type { Metadata } from "next"

import { EntreeAudit } from "@/components/gestion/referentiels/audit-entree"

export const metadata: Metadata = { title: "Gestion · Entrée du journal d'audit" }

export default async function EntreeAuditPage({
  params,
}: {
  params: Promise<{ logId: string }>
}) {
  const { logId } = await params
  return <EntreeAudit logId={logId} />
}
