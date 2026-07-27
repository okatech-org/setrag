import type { Metadata } from "next"

import { SpecialTransportPageClient } from "@/components/ancillary-sale-screens"

export const metadata: Metadata = { title: "Prestation spéciale" }

export default async function SpecialTransportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  return (
    <SpecialTransportPageClient
      initialType={type === "funeraire" ? "funeraire" : "auto"}
    />
  )
}
