import type { Metadata } from "next"

import { BulletinImprimable } from "@/components/modules/rh/bulletin"

export const metadata: Metadata = { title: "Impression du bulletin" }

export default async function Page({ params }: { params: Promise<{ bulletinId: string }> }) {
  const { bulletinId } = await params
  return <BulletinImprimable bulletinId={bulletinId} />
}
