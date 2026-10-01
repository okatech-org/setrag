import type { Metadata } from "next"

import { DossierService } from "@/components/modules/rh/roulements"

export const metadata: Metadata = { title: "Service de roulement" }

export default async function Page({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params
  return <DossierService serviceId={serviceId} />
}
