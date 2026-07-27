import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ManagementPageClient } from "@/components/management-screens"
import {
  MANAGEMENT_SECTION_ALIASES,
  MANAGEMENT_SECTIONS,
} from "@/lib/management-data"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>
}): Promise<Metadata> {
  const { section } = await params
  const resolved = MANAGEMENT_SECTION_ALIASES[section]
  return {
    title: resolved
      ? `Gestion · ${MANAGEMENT_SECTIONS[resolved].title}`
      : "Gestion",
  }
}

export default async function ManagementSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  const resolved = MANAGEMENT_SECTION_ALIASES[section]
  if (!resolved) notFound()
  return <ManagementPageClient section={resolved} />
}
