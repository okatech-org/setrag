import type { Metadata } from "next"

import { LectureEtude } from "@/components/modules/etudes/lecture"

export const metadata: Metadata = { title: "Audit et documents · Étude" }

export default async function EtudePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <LectureEtude code={decodeURIComponent(code)} />
}
