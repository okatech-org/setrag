import type { Metadata } from "next"

import { ManagedUserDetail } from "@/components/managed-user-detail"

export const metadata: Metadata = {
  title: "Gestion · Détail de l’utilisateur",
}

export default async function ManagedUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  return <ManagedUserDetail userId={userId} />
}
