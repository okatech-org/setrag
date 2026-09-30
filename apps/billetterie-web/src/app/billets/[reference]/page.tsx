import type { Metadata } from "next"

import { DetailDossier } from "@/fonctionnalites/billets/detail-dossier"

export const metadata: Metadata = {
  title: "Réservation",
  description:
    "Le détail d'une réservation SETRAG : billets, codes de contrôle, suivi du train.",
  robots: { index: false },
}

export default async function PageReservation({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const { reference } = await params
  return <DetailDossier reference={decodeURIComponent(reference)} />
}
