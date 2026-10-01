import type { Metadata } from "next"

import { DossierSectionEcran } from "@/components/modules/infrastructure/voie/dossier-section"

export const metadata: Metadata = { title: "Infrastructures · Section de voie" }

export default async function SectionPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params
  return <DossierSectionEcran sectionId={sectionId} />
}
